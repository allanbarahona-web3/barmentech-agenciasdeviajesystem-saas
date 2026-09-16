import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { OpenAiVisionService } from "../payment-verification/openai-vision.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { FINANCE_AUDIT_ACTIONS, FINANCE_AUDIT_ENTITY_TYPES, financeAuditRecord, type FinanceActor } from "./finance-audit";
import { PaymentDestinationValidator, type PaymentDestinationValidationResult, type PaymentDestinationValidationStatus } from "./payment-destination-validator.service";

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const EVIDENCE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]);
const VISION_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const CUSTOMER_VISIBLE_EVIDENCE_STATUSES = [
  PaymentStatus.PENDING_VERIFICATION,
  PaymentStatus.RECEIVED,
  PaymentStatus.PARTIALLY_ALLOCATED,
  PaymentStatus.FULLY_ALLOCATED,
  PaymentStatus.REJECTED,
  PaymentStatus.CANCELLED,
] as const;

type EvidenceFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export type PaymentEvidenceExtractionInput = {
  destinationAccount?: unknown;
  sinpePhone?: unknown;
  destinationBank?: unknown;
  reference?: unknown;
  paymentCode?: unknown;
  confidence?: unknown;
};

type PendingReportedPayment = {
  id: string;
  tenantId: string;
  customerId: string | null;
  purpose: PaymentPurpose;
  contractId: string | null;
  status: PaymentStatus;
  allocationProposal?: unknown;
};

@Injectable()
export class PendingInvoicePaymentEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly vision: OpenAiVisionService,
    private readonly destinationValidator: PaymentDestinationValidator,
  ) {}

  async extract(input: { tenantId: string; customerId: string; file: EvidenceFile }) {
    await this.requireCustomer(input.tenantId, input.customerId);
    validateEvidenceFile(input.file, VISION_MIME_TYPES, "FINANCE_PAYMENT_EVIDENCE_IMAGE_REQUIRED");
    const result = await this.vision.extractPaymentDataFromImage(input.file.buffer, input.file.mimetype);
    if (!result.success) {
      throw new BadRequestException("FINANCE_PAYMENT_EVIDENCE_EXTRACTION_FAILED");
    }
    const destinationValidation = await this.destinationValidator.validate({
      tenantId: input.tenantId,
      extractedDestinationAccount: result.data?.destinationAccount,
      extractedBankName: result.data?.destinationBank,
    });
    return {
      extractedData: result.data ?? {},
      destinationValidation,
      warnings: destinationValidation.status === "UNMATCHED" || destinationValidation.status === "AMBIGUOUS"
        ? ["FINANCE_PAYMENT_DESTINATION_REVIEW_REQUIRED"]
        : [],
    };
  }

  async attach(input: { tenantId: string; customerId: string; paymentId: string; file: EvidenceFile; extraction?: PaymentEvidenceExtractionInput | null }) {
    validateEvidenceFile(input.file, EVIDENCE_MIME_TYPES, "FINANCE_PAYMENT_EVIDENCE_INVALID");
    validatePendingReportedPayment(await this.findPayment(input.tenantId, input.paymentId), input.customerId);
    const extractionMetadata = input.extraction
      ? await extractionMetadataFor(input.tenantId, input.extraction, this.destinationValidator)
      : null;
    const objectKey = evidenceObjectKey(input);
    await this.storage.uploadObject({ objectKey, contentType: input.file.mimetype, body: input.file.buffer });
    try {
      const evidence = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "payments"
          WHERE "id" = ${input.paymentId} AND "tenantId" = ${input.tenantId}
          FOR UPDATE
        `;
        if (locked.length !== 1) throw new NotFoundException("FINANCE_PENDING_PAYMENT_NOT_FOUND");
        const payment = await tx.payment.findFirst({
          where: { id: input.paymentId, tenantId: input.tenantId },
        }) as PendingReportedPayment | null;
        validatePendingReportedPayment(payment, input.customerId);
        return tx.paymentEvidence.create({
          data: {
            tenantId: input.tenantId,
            paymentId: input.paymentId,
            objectKey,
            originalFileName: safeFileName(input.file.originalname),
            mimeType: input.file.mimetype,
            size: input.file.size,
            ...(extractionMetadata ? { extractionMetadata } : {}),
          } as never,
          select: { id: true, paymentId: true, originalFileName: true, mimeType: true, size: true, createdAt: true, extractionMetadata: true } as never,
        });
      });
      return evidence;
    } catch (error) {
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      throw error;
    }
  }

  async getAccess(input: { tenantId: string; customerId: string; paymentId: string; evidenceId: string }) {
    const evidence = await this.prisma.paymentEvidence.findFirst({
      where: {
        id: input.evidenceId,
        paymentId: input.paymentId,
        tenantId: input.tenantId,
        payment: {
          tenantId: input.tenantId,
          customerId: input.customerId,
          status: { in: CUSTOMER_VISIBLE_EVIDENCE_STATUSES },
          OR: [
            {
              purpose: PaymentPurpose.GENERAL,
              contractId: null,
              allocationProposal: { path: ["kind"], equals: "INVOICES" },
            },
            {
              purpose: PaymentPurpose.CONTRACT_INSTALLMENT,
              contractId: { not: null },
              allocationProposal: { path: ["kind"], equals: "CONTRACTS" },
            },
          ],
        },
      },
      select: { id: true, originalFileName: true, mimeType: true, size: true, objectKey: true },
    } as never) as unknown as { id: string; originalFileName: string; mimeType: string; size: number; objectKey: string } | null;
    if (!evidence) throw new NotFoundException("FINANCE_PENDING_PAYMENT_EVIDENCE_NOT_FOUND");
    return {
      id: evidence.id,
      originalFileName: evidence.originalFileName,
      mimeType: evidence.mimeType,
      size: evidence.size,
      url: await this.storage.generateSignedUrl(evidence.objectKey, 900),
    };
  }

  async acceptDestinationOverride(input: {
    tenantId: string;
    customerId: string;
    paymentId: string;
    evidenceId: string;
    actor: FinanceActor;
    reason?: string | null;
  }) {
    const overrideReason = optionalText(input.reason, 500);
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "payments"
        WHERE "id" = ${input.paymentId} AND "tenantId" = ${input.tenantId}
        FOR UPDATE
      `;
      if (locked.length !== 1) throw new NotFoundException("FINANCE_PENDING_PAYMENT_NOT_FOUND");
      const payment = await tx.payment.findFirst({ where: { id: input.paymentId, tenantId: input.tenantId } }) as PendingReportedPayment | null;
      validatePendingReportedPayment(payment, input.customerId);
      const evidence = await tx.paymentEvidence.findFirst({
        where: { id: input.evidenceId, paymentId: input.paymentId, tenantId: input.tenantId },
        select: { id: true, extractionMetadata: true },
      } as never) as unknown as { id: string; extractionMetadata: unknown } | null;
      if (!evidence) throw new NotFoundException("FINANCE_PENDING_PAYMENT_EVIDENCE_NOT_FOUND");
      const metadata = evidenceMetadata(evidence.extractionMetadata);
      if (!metadata) throw new ConflictException("FINANCE_PAYMENT_DESTINATION_VALIDATION_NOT_FOUND");
      const validation = metadata.destinationValidation;
      if (validation.status === "MATCHED" || validation.status === "UNKNOWN") {
        throw new ConflictException("FINANCE_PAYMENT_DESTINATION_OVERRIDE_NOT_REQUIRED");
      }
      if (validation.overrideAccepted) return destinationValidationForResponse(validation);
      const acceptedAt = new Date();
      const updatedValidation = {
        ...validation,
        overrideAccepted: true,
        overrideAcceptedByUserId: input.actor.userId,
        overrideAcceptedByName: input.actor.name,
        overrideAcceptedAt: acceptedAt.toISOString(),
        ...(overrideReason ? { overrideReason } : {}),
      };
      await tx.paymentEvidence.update({
        where: { id: evidence.id },
        data: { extractionMetadata: { ...metadata, destinationValidation: updatedValidation } as Prisma.InputJsonValue } as never,
      });
      await tx.billingAuditLog.create({
        data: financeAuditRecord({
          tenantId: input.tenantId,
          entityType: FINANCE_AUDIT_ENTITY_TYPES.PAYMENT,
          entityId: input.paymentId,
          action: FINANCE_AUDIT_ACTIONS.PAYMENT_DESTINATION_OVERRIDE_ACCEPTED,
          actor: input.actor,
          occurredAt: acceptedAt,
          beforeJson: { evidenceId: evidence.id, destinationValidation: { status: validation.status, reason: validation.reason } },
          afterJson: { evidenceId: evidence.id, destinationValidation: updatedValidation },
        }),
      });
      return destinationValidationForResponse(updatedValidation);
    });
  }

  private async requireCustomer(tenantId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.client.findFirst({ where: { id: customerId, tenantId }, select: { id: true } });
    if (!customer) throw new NotFoundException("FINANCE_PENDING_PAYMENT_CUSTOMER_NOT_FOUND");
  }

  private async findPayment(tenantId: string, paymentId: string): Promise<PendingReportedPayment | null> {
    return this.prisma.payment.findFirst({ where: { id: paymentId, tenantId } }) as unknown as Promise<PendingReportedPayment | null>;
  }
}

function validatePendingReportedPayment(payment: PendingReportedPayment | null, customerId: string): asserts payment is PendingReportedPayment {
  if (!payment || payment.customerId !== customerId || !isPendingReportedPayment(payment)) {
    throw new NotFoundException("FINANCE_PENDING_PAYMENT_NOT_FOUND");
  }
  if (payment.status !== PaymentStatus.PENDING_VERIFICATION) {
    throw new ConflictException("FINANCE_PENDING_PAYMENT_NOT_PENDING");
  }
}

function isPendingReportedPayment(payment: PendingReportedPayment): boolean {
  return (
    (payment.purpose === PaymentPurpose.GENERAL && payment.contractId === null && invoiceProposal(payment.allocationProposal)) ||
    (payment.purpose === PaymentPurpose.CONTRACT_INSTALLMENT && payment.contractId !== null && contractProposal(payment.allocationProposal))
  );
}

function invoiceProposal(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).kind === "INVOICES");
}

function contractProposal(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).kind === "CONTRACTS");
}

function validateEvidenceFile(file: EvidenceFile | undefined, allowedMimeTypes: Set<string>, errorCode: string): asserts file is EvidenceFile {
  if (!file || !Buffer.isBuffer(file.buffer) || !allowedMimeTypes.has(file.mimetype) || !Number.isInteger(file.size) || file.size < 1 || file.size > MAX_EVIDENCE_BYTES) {
    throw new BadRequestException(errorCode);
  }
}

function evidenceObjectKey(input: { tenantId: string; customerId: string; paymentId: string; file: EvidenceFile }): string {
  return ["finance", "payment-evidence", safeSegment(input.tenantId), safeSegment(input.customerId), safeSegment(input.paymentId), `${randomUUID()}-${safeFileName(input.file.originalname)}`].join("/");
}

function safeSegment(value: string): string {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 191) || "unknown";
}

function safeFileName(value: string): string {
  const name = String(value).split(/[\\/]/).pop() ?? "comprobante";
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "comprobante";
}

type StoredDestinationValidation = PaymentDestinationValidationResult & {
  evaluatedAt: string;
  overrideAccepted?: boolean;
  overrideAcceptedByUserId?: string;
  overrideAcceptedByName?: string;
  overrideAcceptedAt?: string;
  overrideReason?: string;
};

type StoredEvidenceMetadata = {
  schemaVersion: 1;
  extraction: {
    destinationAccount: string | null;
    sinpePhone: string | null;
    destinationBank: string | null;
    reference: string | null;
    paymentCode: string | null;
    confidence: number | null;
  };
  destinationValidation: StoredDestinationValidation;
};

async function extractionMetadataFor(
  tenantId: string,
  input: PaymentEvidenceExtractionInput,
  validator: PaymentDestinationValidator,
): Promise<StoredEvidenceMetadata> {
  const extraction = {
    destinationAccount: optionalText(input.destinationAccount, 191),
    sinpePhone: optionalText(input.sinpePhone, 30),
    destinationBank: optionalText(input.destinationBank, 100),
    reference: optionalText(input.reference, 150),
    paymentCode: optionalText(input.paymentCode, 150),
    confidence: confidence(input.confidence),
  };
  const destinationValidation = await validator.validate({
    tenantId,
    extractedDestinationAccount: extraction.destinationAccount,
    extractedSinpePhone: extraction.sinpePhone,
    extractedBankName: extraction.destinationBank,
  });
  return {
    schemaVersion: 1,
    extraction,
    destinationValidation: { ...destinationValidation, evaluatedAt: new Date().toISOString(), overrideAccepted: false },
  };
}

function evidenceMetadata(value: unknown): StoredEvidenceMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as Record<string, unknown>;
  const extraction = metadata.extraction;
  const destinationValidation = metadata.destinationValidation;
  if (!extraction || typeof extraction !== "object" || Array.isArray(extraction) || !destinationValidation || typeof destinationValidation !== "object" || Array.isArray(destinationValidation)) return null;
  const validation = destinationValidation as Record<string, unknown>;
  if (!["MATCHED", "UNMATCHED", "UNKNOWN", "AMBIGUOUS"].includes(String(validation.status))) return null;
  if (typeof validation.evaluatedAt !== "string" || Number.isNaN(new Date(validation.evaluatedAt).getTime())) return null;
  return metadata as unknown as StoredEvidenceMetadata;
}

export function destinationValidationForResponse(validation: StoredDestinationValidation) {
  return {
    status: validation.status,
    reason: validation.reason ?? null,
    matchedAccount: validation.matchedAccount ?? null,
    bankNameMatches: validation.bankNameMatches ?? null,
    evaluatedAt: validation.evaluatedAt,
    overrideAccepted: validation.overrideAccepted === true,
    overrideAcceptedByUserId: validation.overrideAcceptedByUserId ?? null,
    overrideAcceptedByName: validation.overrideAcceptedByName ?? null,
    overrideAcceptedAt: validation.overrideAcceptedAt ?? null,
    overrideReason: validation.overrideReason ?? null,
  };
}

export function paymentEvidenceMetadataForReview(value: unknown) {
  const metadata = evidenceMetadata(value);
  if (!metadata) return null;
  return {
    extraction: {
      destinationAccount: maskDetectedIdentifier(metadata.extraction.destinationAccount),
      sinpePhone: maskDetectedIdentifier(metadata.extraction.sinpePhone),
      destinationBank: metadata.extraction.destinationBank,
      reference: metadata.extraction.reference,
      paymentCode: metadata.extraction.paymentCode,
      confidence: metadata.extraction.confidence,
    },
    destinationValidation: destinationValidationForResponse(metadata.destinationValidation),
  };
}

function maskDetectedIdentifier(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/[\s-]/g, "");
  return normalized.length <= 4 ? "****" : `****${normalized.slice(-4)}`;
}

function optionalText(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new BadRequestException("FINANCE_PAYMENT_EVIDENCE_METADATA_INVALID");
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new BadRequestException("FINANCE_PAYMENT_EVIDENCE_METADATA_INVALID");
  return normalized;
}

function confidence(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new BadRequestException("FINANCE_PAYMENT_EVIDENCE_METADATA_INVALID");
  }
  return value;
}

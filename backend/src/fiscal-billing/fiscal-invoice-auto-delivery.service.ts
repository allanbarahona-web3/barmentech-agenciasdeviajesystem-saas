import { HttpException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { isEmail } from "class-validator";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { FiscalArtifactReadService } from "./fiscal-artifact-read.service";
import { FiscalInvoicePdfService } from "./fiscal-invoice-pdf.service";
import {
  FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE,
  FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE,
  FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_VERSION,
} from "./jobs/fiscal-accepted-fanout.constants";
import {
  FISCAL_INVOICE_AUTO_DELIVERY_LEASE_MS,
  FISCAL_INVOICE_AUTO_DELIVERY_RETRY_BASE_MS,
  FISCAL_INVOICE_AUTO_DELIVERY_RETRY_MAX_MS,
} from "./jobs/fiscal-invoice-auto-delivery.constants";

const REQUIRED_ARTIFACTS = ["SIGNED_FISCAL_XML", "TAX_AUTHORITY_RESPONSE_XML"] as const;
const ALL_ARTIFACTS = ["INTERNAL_PDF", ...REQUIRED_ARTIFACTS] as const;
const SYSTEM_ACTOR_ID = "SYSTEM";
const SYSTEM_ACTOR_NAME = "Fiscal invoice automatic delivery";
const ACTION = "INITIAL_AUTOMATIC";
const WORKER_FAILED = "FISCAL_INVOICE_AUTO_DELIVERY_WORKER_FAILED";

export const FISCAL_INVOICE_AUTO_DELIVERY_ERRORS = {
  CLAIM_INVALID: "FISCAL_INVOICE_AUTO_DELIVERY_CLAIM_INVALID",
  CHILD_INVALID: "FISCAL_INVOICE_AUTO_DELIVERY_CHILD_INVALID",
  DOCUMENT_INELIGIBLE: "FISCAL_INVOICE_AUTO_DELIVERY_DOCUMENT_INELIGIBLE",
  RECIPIENT_INVALID: "FISCAL_INVOICE_AUTO_DELIVERY_RECIPIENT_INVALID",
  ARTIFACT_NOT_READY: "FISCAL_INVOICE_AUTO_DELIVERY_ARTIFACT_NOT_READY",
  ARTIFACT_FAILED: "FISCAL_INVOICE_AUTO_DELIVERY_ARTIFACT_FAILED",
  ARTIFACT_INVALID: "FISCAL_INVOICE_AUTO_DELIVERY_ARTIFACT_INVALID",
  PDF_FAILED: "FISCAL_INVOICE_AUTO_DELIVERY_PDF_FAILED",
  EMAIL_FAILED: "FISCAL_INVOICE_AUTO_DELIVERY_EMAIL_FAILED",
} as const;

export interface ClaimedFiscalInvoiceAutoDelivery {
  tenantId: string;
  billingOutboxEventId: string;
  lockOwner: string;
}
interface Payload { tenantId: string; billingDocumentId: string; eventVersion: 1; }
interface Prepared {
  claim: ClaimedFiscalInvoiceAutoDelivery;
  payload: Payload;
  causationId: string;
  recipient: string;
  receiverName: string;
  fiscalNumber: string;
  idempotencyKey: string;
}

export class FiscalInvoiceAutoDeliveryError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) { super(code); this.name = "FiscalInvoiceAutoDeliveryError"; }
}

@Injectable()
export class FiscalInvoiceAutoDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: FiscalInvoicePdfService,
    private readonly artifacts: FiscalArtifactReadService,
    private readonly email: EmailService,
  ) {}

  async processClaimedDelivery(claim: ClaimedFiscalInvoiceAutoDelivery): Promise<void> {
    const prepared = await this.prepare(claim);
    try {
      await this.pdf.generateAndPersist(claim.tenantId, prepared.payload.billingDocumentId);
    } catch (error) {
      throw classifyExternal(error, FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.PDF_FAILED);
    }

    const attachments = await Promise.all(ALL_ARTIFACTS.map(async (artifactType) => {
      try {
        const artifact = await this.artifacts.download(claim.tenantId, prepared.payload.billingDocumentId, artifactType, "1");
        return { filename: artifact.filename, content: artifact.bytes.toString("base64"), contentType: artifact.mimeType };
      } catch (error) {
        throw classifyExternal(error, FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.ARTIFACT_INVALID);
      }
    }));

    await this.revalidateBeforeDelivery(prepared);
    const result = await this.email.sendEmail({
      tenantId: claim.tenantId,
      to: prepared.recipient,
      subject: `Factura electrónica ${prepared.fiscalNumber}`,
      template: "business-document-attachment",
      templateData: {
        recipientName: prepared.receiverName,
        documentLabel: "Factura electrónica",
        documentNumber: prepared.fiscalNumber,
        message: "Adjuntamos su factura electrónica y los documentos fiscales asociados.",
        attachmentSummary: "La factura, el XML firmado y la respuesta de la autoridad tributaria se encuentran adjuntos.",
      },
      attachments,
      idempotencyKey: prepared.idempotencyKey,
    });
    if (!result.success) throw retryable(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.EMAIL_FAILED);
    await this.complete(prepared, result.emailId ?? null);
  }

  async failClaim(claim: ClaimedFiscalInvoiceAutoDelivery, errorCode: string): Promise<void> {
    await this.finalizeFailure(claim, safeCode(errorCode));
  }

  async releaseClaimAfterWorkerFailure(claim: ClaimedFiscalInvoiceAutoDelivery): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const child = await lockOwnedChild(tx, claim, false);
      if (!child) return;
      if (child.attemptCount >= child.maximumAttempts) {
        const recipient = await auditRecipient(tx, claim.tenantId, child.aggregateId);
        await createAudit(tx, claim.tenantId, child.aggregateId, "FAILED", recipient, WORKER_FAILED, providerKey(claim.tenantId, child.aggregateId));
        await requireOwnedUpdate(tx, claim, { status: "FAILED", lastError: WORKER_FAILED, lockedAt: null, lockedBy: null });
        return;
      }
      const delay = Math.min(FISCAL_INVOICE_AUTO_DELIVERY_RETRY_BASE_MS * 2 ** Math.min(Math.max(child.attemptCount - 1, 0), 30), FISCAL_INVOICE_AUTO_DELIVERY_RETRY_MAX_MS);
      await requireOwnedUpdate(tx, claim, { status: "PENDING", availableAt: new Date(Date.now() + delay), lastError: WORKER_FAILED, lockedAt: null, lockedBy: null });
    });
  }

  private async prepare(claim: ClaimedFiscalInvoiceAutoDelivery): Promise<Prepared> {
    return this.prisma.$transaction(async (tx) => {
      const child = await lockOwnedChild(tx, claim, true);
      if (!child) throw permanent(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.CLAIM_INVALID);
      const payload = validPayload(child, claim);
      if (!payload) throw permanent(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.CHILD_INVALID);
      const document = await tx.billingDocument.findUnique({
        where: { id_tenantId: { id: payload.billingDocumentId, tenantId: claim.tenantId } },
        select: { id: true, lifecycleStatus: true, providerStatus: true, taxAuthorityStatus: true, receiverEmail: true, receiverName: true, fiscalNumber: true },
      });
      if (!document || document.lifecycleStatus !== "SUBMITTED" || document.providerStatus !== "PROCESSED" || document.taxAuthorityStatus !== "ACCEPTED" || !nonEmpty(document.receiverName) || !nonEmpty(document.fiscalNumber)) throw permanent(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.DOCUMENT_INELIGIBLE);
      const recipient = document.receiverEmail?.trim() ?? "";
      if (!recipient || !isEmail(recipient)) throw permanent(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.RECIPIENT_INVALID);
      const rows = await tx.billingDocumentArtifact.findMany({
        where: { tenantId: claim.tenantId, billingDocumentId: payload.billingDocumentId, artifactType: { in: [...REQUIRED_ARTIFACTS] }, version: 1 },
        select: { artifactType: true, status: true }, take: REQUIRED_ARTIFACTS.length,
      });
      for (const type of REQUIRED_ARTIFACTS) {
        const artifact = rows.find((row) => row.artifactType === type);
        if (artifact?.status === "FAILED") throw permanent(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.ARTIFACT_FAILED);
        if (artifact?.status !== "AVAILABLE") throw retryable(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.ARTIFACT_NOT_READY);
      }
      return { claim, payload, causationId: child.causationId!, recipient, receiverName: document.receiverName, fiscalNumber: document.fiscalNumber, idempotencyKey: providerKey(claim.tenantId, payload.billingDocumentId) };
    });
  }

  private async revalidateBeforeDelivery(prepared: Prepared): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const child = await lockOwnedChild(tx, prepared.claim, true);
      const payload = child && validPayload(child, prepared.claim);
      if (!child || !payload || child.causationId !== prepared.causationId || payload.billingDocumentId !== prepared.payload.billingDocumentId) throw permanent(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.CLAIM_INVALID);
      const document = await tx.billingDocument.findUnique({ where: { id_tenantId: { id: payload.billingDocumentId, tenantId: prepared.claim.tenantId } }, select: { lifecycleStatus: true, providerStatus: true, taxAuthorityStatus: true, receiverEmail: true } });
      if (!document || document.lifecycleStatus !== "SUBMITTED" || document.providerStatus !== "PROCESSED" || document.taxAuthorityStatus !== "ACCEPTED" || document.receiverEmail?.trim() !== prepared.recipient) throw permanent(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.DOCUMENT_INELIGIBLE);
      const count = await tx.billingDocumentArtifact.count({ where: { tenantId: prepared.claim.tenantId, billingDocumentId: payload.billingDocumentId, artifactType: { in: [...ALL_ARTIFACTS] }, version: 1, status: "AVAILABLE" } });
      if (count !== ALL_ARTIFACTS.length) throw retryable(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.ARTIFACT_NOT_READY);
    });
  }

  private async complete(prepared: Prepared, providerMessageId: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const child = await lockOwnedChild(tx, prepared.claim, true);
      const payload = child && validPayload(child, prepared.claim);
      if (!child || !payload || child.causationId !== prepared.causationId || payload.billingDocumentId !== prepared.payload.billingDocumentId) throw permanent(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.CLAIM_INVALID);
      await createAudit(tx, prepared.claim.tenantId, payload.billingDocumentId, "SUCCESS", prepared.recipient, null, prepared.idempotencyKey, providerMessageId);
      await requireOwnedUpdate(tx, prepared.claim, { status: "PROCESSED", processedAt: new Date(), lastError: null, lockedAt: null, lockedBy: null });
    });
  }

  private async finalizeFailure(claim: ClaimedFiscalInvoiceAutoDelivery, code: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const child = await lockOwnedChild(tx, claim, false);
      if (!child) return;
      const recipient = await auditRecipient(tx, claim.tenantId, child.aggregateId);
      await createAudit(tx, claim.tenantId, child.aggregateId, "FAILED", recipient, code, providerKey(claim.tenantId, child.aggregateId));
      await requireOwnedUpdate(tx, claim, { status: "FAILED", lastError: code, lockedAt: null, lockedBy: null });
    });
  }
}

async function lockOwnedChild(tx: Prisma.TransactionClient, claim: ClaimedFiscalInvoiceAutoDelivery, requireLease: boolean) {
  const cutoff = new Date(Date.now() - FISCAL_INVOICE_AUTO_DELIVERY_LEASE_MS);
  const rows = requireLease
    ? await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "billing_outbox_events" WHERE "id" = ${claim.billingOutboxEventId} AND "tenantId" = ${claim.tenantId} AND "eventType" = ${FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE} AND "eventVersion" = ${FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_VERSION} AND "status" = 'PROCESSING' AND "lockedBy" = ${claim.lockOwner} AND "lockedAt" >= ${cutoff} FOR UPDATE`
    : await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "billing_outbox_events" WHERE "id" = ${claim.billingOutboxEventId} AND "tenantId" = ${claim.tenantId} AND "eventType" = ${FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE} AND "eventVersion" = ${FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_VERSION} AND "status" = 'PROCESSING' AND "lockedBy" = ${claim.lockOwner} FOR UPDATE`;
  if (rows.length !== 1) return null;
  return tx.billingOutboxEvent.findUnique({ where: { id: claim.billingOutboxEventId } });
}
function validPayload(child: { tenantId: string; eventType: string; eventVersion: number; aggregateType: string; aggregateId: string; causationId: string | null; payload: Prisma.JsonValue }, claim: ClaimedFiscalInvoiceAutoDelivery): Payload | null {
  if (child.tenantId !== claim.tenantId || child.eventType !== FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE || child.eventVersion !== 1 || child.aggregateType !== FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE || !nonEmpty(child.causationId) || !json(child.payload) || Object.keys(child.payload).length !== 3) return null;
  const p = child.payload;
  return p.tenantId === child.tenantId && p.billingDocumentId === child.aggregateId && nonEmpty(p.billingDocumentId) && p.eventVersion === 1 ? { tenantId: child.tenantId, billingDocumentId: p.billingDocumentId, eventVersion: 1 } : null;
}
async function requireOwnedUpdate(tx: Prisma.TransactionClient, claim: ClaimedFiscalInvoiceAutoDelivery, data: Prisma.BillingOutboxEventUpdateManyMutationInput): Promise<void> {
  const result = await tx.billingOutboxEvent.updateMany({ where: { id: claim.billingOutboxEventId, tenantId: claim.tenantId, status: "PROCESSING", lockedBy: claim.lockOwner }, data });
  if (result.count !== 1) throw retryable(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.CLAIM_INVALID);
}
async function createAudit(tx: Prisma.TransactionClient, tenantId: string, billingDocumentId: string, outcome: "SUCCESS" | "FAILED", recipient: string | null, failureCode: string | null, idempotencyKey: string, providerMessageId: string | null = null): Promise<void> {
  await tx.billingAuditLog.create({ data: { tenantId, entityType: "BILLING_DOCUMENT", entityId: billingDocumentId, action: ACTION, actorUserId: SYSTEM_ACTOR_ID, actorName: SYSTEM_ACTOR_NAME, afterJson: { deliveryMode: ACTION, recipient, cc: [], outcome, providerMessageId, idempotencyKey, failureCode } } });
}
async function auditRecipient(tx: Prisma.TransactionClient, tenantId: string, billingDocumentId: string): Promise<string | null> {
  const document = await tx.billingDocument.findUnique({ where: { id_tenantId: { id: billingDocumentId, tenantId } }, select: { receiverEmail: true } });
  const recipient = document?.receiverEmail?.trim() ?? "";
  return recipient && isEmail(recipient) ? recipient : null;
}
function classifyExternal(error: unknown, fallback: string): FiscalInvoiceAutoDeliveryError {
  const code = httpCode(error);
  if (code === "FISCAL_ARTIFACT_NOT_AVAILABLE" || code === "FISCAL_ARTIFACT_DOWNLOAD_FAILED" || code === "BILLING_DOCUMENT_INVOICE_PDF_GENERATION_FAILED") return retryable(fallback);
  if (code) return permanent(fallback);
  return retryable(fallback);
}
function httpCode(error: unknown): string | null { if (!(error instanceof HttpException)) return null; const response = error.getResponse(); return typeof response === "object" && response !== null && "code" in response && typeof (response as { code?: unknown }).code === "string" ? (response as { code: string }).code : null; }
function providerKey(tenantId: string, billingDocumentId: string): string { return `fiscal-invoice-auto:${tenantId}:${billingDocumentId}:v1`; }
function permanent(code: string): FiscalInvoiceAutoDeliveryError { return new FiscalInvoiceAutoDeliveryError(code, false); }
function retryable(code: string): FiscalInvoiceAutoDeliveryError { return new FiscalInvoiceAutoDeliveryError(code, true); }
function safeCode(code: string): string { return /^[A-Z][A-Z0-9_]{0,99}$/.test(code) ? code : WORKER_FAILED; }
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function json(value: Prisma.JsonValue): value is Prisma.JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }

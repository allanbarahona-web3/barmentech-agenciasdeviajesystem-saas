import { HttpException, Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { DocumentPdfService } from "../documents/document-pdf.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  IMMUTABLE_BILLING_ARTIFACT_STORAGE_PORT,
  ImmutableBillingArtifactStorageError,
  type ImmutableBillingArtifactStorageMetadata,
  type ImmutableBillingArtifactStoragePort,
} from "../storage/immutable-billing-artifact-storage.port";
import { BillingDocumentService } from "./billing-document.service";
import { fiscalBillingError } from "./fiscal-billing.errors";
import { fiscalInvoicePdfTemplate } from "./fiscal-invoice-pdf.template";

const ARTIFACT_TYPE = "INTERNAL_PDF" as const;
const ARTIFACT_VERSION = 1;
const PDF_MIME_TYPE = "application/pdf";

const ARTIFACT_SELECT = {
  id: true,
  tenantId: true,
  billingDocumentId: true,
  artifactType: true,
  version: true,
  status: true,
  storageProvider: true,
  storageKey: true,
  sha256: true,
  byteSize: true,
  mimeType: true,
  sourceEtag: true,
  retrievedAt: true,
  storedAt: true,
  terminalErrorCode: true,
  failedAt: true,
} as const;

type ArtifactRow = {
  id: string;
  tenantId: string;
  billingDocumentId: string;
  artifactType: string;
  version: number;
  status: string;
  storageProvider: string | null;
  storageKey: string | null;
  sha256: string | null;
  byteSize: bigint | null;
  mimeType: string | null;
  sourceEtag: string | null;
  retrievedAt: Date | null;
  storedAt: Date | null;
  terminalErrorCode: string | null;
  failedAt: Date | null;
};

export interface FiscalInvoicePdfArtifactResult {
  artifactType: typeof ARTIFACT_TYPE;
  version: typeof ARTIFACT_VERSION;
  status: "AVAILABLE";
  mimeType: typeof PDF_MIME_TYPE;
  byteSize: string;
  storedAt: Date;
}

@Injectable()
export class FiscalInvoicePdfService {
  constructor(
    private readonly billingDocumentService: BillingDocumentService,
    private readonly documentPdfService: DocumentPdfService,
    private readonly prisma: PrismaService,
    @Inject(IMMUTABLE_BILLING_ARTIFACT_STORAGE_PORT)
    private readonly storage: ImmutableBillingArtifactStoragePort,
  ) {}

  async generateAndPersist(
    tenantId: string,
    billingDocumentId: string,
  ): Promise<FiscalInvoicePdfArtifactResult> {
    try {
      const invoice = await this.billingDocumentService.getAcceptedInvoice(
        tenantId,
        billingDocumentId,
      );
      const existing = await this.findArtifact(tenantId, billingDocumentId);
      if (existing) return this.exactAvailableResult(existing, tenantId, billingDocumentId);

      const html = fiscalInvoicePdfTemplate(invoice);
      const { pdfBuffer } = await this.documentPdfService.renderDocumentToBuffer(html);
      if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
        throw fiscalBillingError("BILLING_DOCUMENT_INVOICE_PDF_GENERATION_FAILED");
      }

      const sha256 = createHash("sha256").update(pdfBuffer).digest("hex");
      const stored = await this.storage.storeImmutable({
        tenantId,
        billingDocumentId,
        artifactType: ARTIFACT_TYPE,
        artifactVersion: ARTIFACT_VERSION,
        expectedSha256: sha256,
        mimeType: PDF_MIME_TYPE,
        bytes: pdfBuffer,
      });
      this.requireExactStorage(stored, sha256, pdfBuffer.length);

      try {
        const artifact = await this.prisma.billingDocumentArtifact.create({
          data: {
            tenantId,
            billingDocumentId,
            artifactType: ARTIFACT_TYPE,
            version: ARTIFACT_VERSION,
            status: "AVAILABLE",
            storageProvider: stored.storageProvider,
            storageKey: stored.storageKey,
            sha256: stored.sha256,
            byteSize: stored.byteSize,
            mimeType: stored.mimeType,
            sourceEtag: null,
            retrievedAt: stored.storedAt,
            storedAt: stored.storedAt,
            terminalErrorCode: null,
            failedAt: null,
          },
          select: ARTIFACT_SELECT,
        });
        return this.exactAvailableResult(
          artifact as ArtifactRow,
          tenantId,
          billingDocumentId,
        );
      } catch (error) {
        if (!isUniqueConstraintViolation(error)) throw error;
        const winner = await this.findArtifact(tenantId, billingDocumentId);
        if (!winner) throw fiscalBillingError("BILLING_DOCUMENT_INVOICE_PDF_CONFLICT");
        return this.exactAvailableResult(winner, tenantId, billingDocumentId);
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (
        error instanceof ImmutableBillingArtifactStorageError &&
        error.code === "IMMUTABLE_BILLING_ARTIFACT_STORAGE_CONFLICT"
      ) {
        throw fiscalBillingError("BILLING_DOCUMENT_INVOICE_PDF_CONFLICT");
      }
      throw fiscalBillingError("BILLING_DOCUMENT_INVOICE_PDF_GENERATION_FAILED");
    }
  }

  private findArtifact(tenantId: string, billingDocumentId: string) {
    return this.prisma.billingDocumentArtifact.findUnique({
      where: {
        tenantId_billingDocumentId_artifactType_version: {
          tenantId,
          billingDocumentId,
          artifactType: ARTIFACT_TYPE,
          version: ARTIFACT_VERSION,
        },
      },
      select: ARTIFACT_SELECT,
    }) as Promise<ArtifactRow | null>;
  }

  private exactAvailableResult(
    artifact: ArtifactRow,
    tenantId: string,
    billingDocumentId: string,
  ): FiscalInvoicePdfArtifactResult {
    if (
      artifact.tenantId !== tenantId ||
      artifact.billingDocumentId !== billingDocumentId ||
      artifact.artifactType !== ARTIFACT_TYPE ||
      artifact.version !== ARTIFACT_VERSION ||
      artifact.status !== "AVAILABLE" ||
      !nonEmpty(artifact.storageProvider) ||
      !nonEmpty(artifact.storageKey) ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? "") ||
      artifact.byteSize === null ||
      artifact.byteSize <= 0n ||
      artifact.mimeType !== PDF_MIME_TYPE ||
      artifact.sourceEtag !== null ||
      !validDate(artifact.retrievedAt) ||
      !validDate(artifact.storedAt) ||
      artifact.storedAt < artifact.retrievedAt ||
      artifact.terminalErrorCode !== null ||
      artifact.failedAt !== null
    ) {
      throw fiscalBillingError("BILLING_DOCUMENT_INVOICE_PDF_CONFLICT");
    }
    return {
      artifactType: ARTIFACT_TYPE,
      version: ARTIFACT_VERSION,
      status: "AVAILABLE",
      mimeType: PDF_MIME_TYPE,
      byteSize: artifact.byteSize.toString(),
      storedAt: artifact.storedAt,
    };
  }

  private requireExactStorage(
    stored: ImmutableBillingArtifactStorageMetadata,
    expectedSha256: string,
    expectedBytes: number,
  ): void {
    if (
      !nonEmpty(stored.storageProvider) ||
      !nonEmpty(stored.storageKey) ||
      stored.sha256 !== expectedSha256 ||
      stored.byteSize !== BigInt(expectedBytes) ||
      stored.mimeType !== PDF_MIME_TYPE ||
      !validDate(stored.storedAt)
    ) {
      throw fiscalBillingError("BILLING_DOCUMENT_INVOICE_PDF_CONFLICT");
    }
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === "P2002";
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

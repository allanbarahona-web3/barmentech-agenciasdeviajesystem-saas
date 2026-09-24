import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentPdfService } from "../documents/document-pdf.service";
import {
  GENERATED_DOCUMENT_OWNER_TYPES,
  GENERATED_DOCUMENT_TYPES,
  GENERATED_DOCUMENT_VARIANTS,
  GeneratedDocumentsService,
} from "../generated-documents";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { TenantService } from "../tenant/tenant.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import { CustomQuotationProposalMapper } from "./custom-quotation-proposal.mapper";
import { customQuotationProposalTemplate } from "./custom-quotation-proposal.template";
import type { CustomQuotationProposalDocument } from "./custom-quotation-proposal.types";

type ProposalTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  customQuotationVersion: Record<string, (...args: any[]) => Promise<any>>;
  tenantBillingConfiguration: Record<string, (...args: any[]) => Promise<any>>;
};

type ProposalDatabase = {
  $transaction<T>(work: (transaction: ProposalTransaction) => Promise<T>): Promise<T>;
};

@Injectable()
export class CustomQuotationProposalService {
  private readonly database: ProposalDatabase;

  constructor(
    prisma: PrismaService,
    private readonly mapper: CustomQuotationProposalMapper,
    private readonly tenants: TenantService,
    private readonly documents: DocumentPdfService,
    private readonly storage: StorageService,
    private readonly generatedDocuments: GeneratedDocumentsService,
    private readonly config: ConfigService,
  ) {
    this.database = prisma as unknown as ProposalDatabase;
  }

  async persist(tenantId: string, quotationId: string, versionId: string) {
    const proposal = await this.prepareDocument(tenantId, quotationId, versionId);
    const html = customQuotationProposalTemplate(proposal);
    const { pdfBuffer } = await this.documents.renderDocumentToBuffer(html);
    const settings = await this.tenants.getTenantConfig(tenantId);
    const objectKey = `${segment(this.config.get<string>("APP_ENV", "dev"))}/${segment(settings.subdomain || "unknown")}/custom-quotations/proposals/${segment(proposal.quotationNumber)}/v${proposal.versionNumber}/proposal.pdf`;
    await this.storage.uploadObject({ objectKey, contentType: "application/pdf", body: pdfBuffer });
    return this.generatedDocuments.register({
      tenantId,
      ownerType: GENERATED_DOCUMENT_OWNER_TYPES.CUSTOM_QUOTATION_VERSION,
      ownerId: versionId,
      documentType: GENERATED_DOCUMENT_TYPES.COMMERCIAL_PROPOSAL,
      variant: GENERATED_DOCUMENT_VARIANTS.GENERATED,
      objectKey,
      fileName: "propuesta-comercial.pdf",
      mimeType: "application/pdf",
      size: pdfBuffer.length,
    });
  }

  async getPersistedPreview(tenantId: string, quotationId: string, versionId: string) {
    const { version } = await this.requireIssuedVersion(tenantId, quotationId, versionId);
    const document = await this.generatedDocuments.findLatest({
      tenantId,
      ownerType: GENERATED_DOCUMENT_OWNER_TYPES.CUSTOM_QUOTATION_VERSION,
      ownerId: versionId,
      documentType: GENERATED_DOCUMENT_TYPES.COMMERCIAL_PROPOSAL,
      variant: GENERATED_DOCUMENT_VARIANTS.GENERATED,
      version: 1,
    });
    if (!document) throw new NotFoundException("CUSTOM_QUOTATION_PROPOSAL_NOT_FOUND");
    const expiresInSeconds = 900;
    const url = await this.generatedDocuments.getSignedUrl(tenantId, document.id, expiresInSeconds);
    return {
      id: document.id,
      fileName: document.fileName,
      mimeType: document.mimeType,
      size: document.size,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      url,
      expiresInSeconds,
      delivery: deliverySummary(version),
    };
  }

  async prepareDocument(tenantId: string, quotationId: string, versionId: string): Promise<CustomQuotationProposalDocument> {
    const { version, timezone } = await this.requireIssuedVersion(tenantId, quotationId, versionId);
    const settings = await this.tenants.getTenantConfig(tenantId);
    return this.mapper.map(version, {
      name: settings.name,
      legalId: settings.legalId,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      logoSrc: settings.logoUrl,
      primaryColor: settings.primaryColor,
    }, timezone);
  }

  private async requireIssuedVersion(tenantId: string, quotationId: string, versionId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const version = await tx.customQuotationVersion.findFirst({
        where: { id: versionId, tenantId, customQuotationId: quotationId },
        select: {
          id: true,
          status: true,
          versionNumber: true,
          title: true,
          currency: true,
          finalSellingPrice: true,
          quotationValidUntil: true,
          paymentConditionType: true,
          paymentTermValue: true,
          paymentTermUnit: true,
          commercialObservations: true,
          recipientFullName: true,
          recipientEmail: true,
          recipientPhone: true,
          recipientCompanyName: true,
          createdAt: true,
          deliverySentAt: true,
          deliveryRecipientEmail: true,
          lines: { orderBy: [{ displayOrder: "asc" }, { id: "asc" }], select: { displayOrder: true, description: true, quantity: true, commercialNote: true } },
          customQuotation: { select: { quotationNumber: true } },
        },
      });
      if (!version) throw new NotFoundException("CUSTOM_QUOTATION_VERSION_NOT_FOUND");
      if (version.status !== "ISSUED") throw new ConflictException("CUSTOM_QUOTATION_VERSION_NOT_ISSUED");
      const configuration = await tx.tenantBillingConfiguration.findUnique({
        where: { tenantId },
        select: { fiscalTimezone: true },
      });
      return { version, timezone: configuration?.fiscalTimezone ?? "America/Costa_Rica" };
    });
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: ProposalTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

function segment(value: string) {
  return String(value || "unknown").trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function deliverySummary(version: any) {
  if (!version.deliverySentAt || !version.deliveryRecipientEmail) return null;
  return { sentAt: version.deliverySentAt, recipientEmail: version.deliveryRecipientEmail };
}

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CommercialProposalPdfMapper } from "./commercial-proposal-pdf.mapper";
import {
  CommercialProposalPdfCompanyDto,
  CommercialProposalPdfDto,
  CommercialProposalPreviewDto,
} from "./dto";
import type { AdditionalServiceOrderRecord } from "./repositories";
import { commercialProposalTemplate } from "./templates";
import { TenantService } from "../tenant/tenant.service";
import { DocumentPdfService } from "../documents/document-pdf.service";
import {
  GENERATED_DOCUMENT_OWNER_TYPES,
  GENERATED_DOCUMENT_TYPES,
  GENERATED_DOCUMENT_VARIANTS,
  GeneratedDocumentRecord,
  GeneratedDocumentsService,
} from "../generated-documents";
import { StorageService } from "../storage/storage.service";

@Injectable()
export class CommercialProposalPdfService {
  constructor(
    private readonly mapper: CommercialProposalPdfMapper,
    private readonly tenantService: TenantService,
    private readonly documentPdfService: DocumentPdfService,
    private readonly storageService: StorageService,
    private readonly generatedDocumentsService: GeneratedDocumentsService,
    private readonly configService: ConfigService,
  ) {}

  async prepareDocument(
    order: AdditionalServiceOrderRecord,
    tenantId: string,
  ): Promise<CommercialProposalPdfDto> {
    const settings = await this.tenantService.getTenantConfig(tenantId);
    const company: CommercialProposalPdfCompanyDto = {
      name: settings.name,
      legalId: settings.legalId,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      logoSrc: settings.logoUrl,
    };

    return this.mapper.map(order, company);
  }

  renderHtml(document: CommercialProposalPdfDto): string {
    return commercialProposalTemplate(document);
  }

  async renderPdf(
    order: AdditionalServiceOrderRecord,
    tenantId: string,
  ): Promise<Buffer> {
    const document = await this.prepareDocument(order, tenantId);
    const html = this.renderHtml(document);
    const { pdfBuffer } = await this.documentPdfService.renderDocumentToBuffer(
      html,
    );
    return pdfBuffer;
  }

  async persist(
    order: AdditionalServiceOrderRecord,
    tenantId: string,
  ): Promise<GeneratedDocumentRecord> {
    if (order.tenantId !== tenantId) {
      throw new ForbiddenException(
        "The commercial proposal does not belong to the authenticated tenant.",
      );
    }
    const pdfBuffer = await this.renderPdf(order, tenantId);
    const settings = await this.tenantService.getTenantConfig(tenantId);
    const appEnv = this.sanitizePathSegment(
      this.configService.get<string>("APP_ENV", "dev"),
    );
    const tenantSubdomain = this.sanitizePathSegment(
      settings.subdomain || "unknown",
    );
    const orderNumber = this.sanitizePathSegment(order.orderNumber);
    const objectKey = `${appEnv}/${tenantSubdomain}/additional-services/proposals/${orderNumber}/proposal.pdf`;

    await this.storageService.uploadObject({
      objectKey,
      contentType: "application/pdf",
      body: pdfBuffer,
    });

    return this.generatedDocumentsService.register({
      tenantId,
      ownerType: GENERATED_DOCUMENT_OWNER_TYPES.ADDITIONAL_SERVICE_ORDER,
      ownerId: order.id,
      documentType: GENERATED_DOCUMENT_TYPES.COMMERCIAL_PROPOSAL,
      variant: GENERATED_DOCUMENT_VARIANTS.GENERATED,
      objectKey,
      fileName: "proposal.pdf",
      mimeType: "application/pdf",
      size: pdfBuffer.length,
    });
  }

  async getPersistedPreview(
    order: AdditionalServiceOrderRecord,
    tenantId: string,
  ): Promise<CommercialProposalPreviewDto> {
    if (order.tenantId !== tenantId) {
      throw new ForbiddenException(
        "The commercial proposal does not belong to the authenticated tenant.",
      );
    }

    const document = await this.generatedDocumentsService.findLatest({
      tenantId,
      ownerType: GENERATED_DOCUMENT_OWNER_TYPES.ADDITIONAL_SERVICE_ORDER,
      ownerId: order.id,
      documentType: GENERATED_DOCUMENT_TYPES.COMMERCIAL_PROPOSAL,
      variant: GENERATED_DOCUMENT_VARIANTS.GENERATED,
      version: 1,
    });
    if (!document) {
      throw new NotFoundException(
        "No persisted commercial proposal PDF exists for this order.",
      );
    }

    const expiresInSeconds = 900;
    const url = await this.generatedDocumentsService.getSignedUrl(
      tenantId,
      document.id,
      expiresInSeconds,
    );

    return {
      id: document.id,
      fileName: document.fileName,
      mimeType: document.mimeType,
      size: document.size,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      url,
      expiresInSeconds,
    };
  }

  private sanitizePathSegment(value: string): string {
    return String(value || "unknown")
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown";
  }
}

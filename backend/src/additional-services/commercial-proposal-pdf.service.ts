import { Injectable } from "@nestjs/common";
import { CommercialProposalPdfMapper } from "./commercial-proposal-pdf.mapper";
import {
  CommercialProposalPdfCompanyDto,
  CommercialProposalPdfDto,
} from "./dto";
import type { AdditionalServiceOrderRecord } from "./repositories";
import { commercialProposalTemplate } from "./templates";
import { TenantService } from "../tenant/tenant.service";
import { DocumentPdfService } from "../documents/document-pdf.service";

@Injectable()
export class CommercialProposalPdfService {
  constructor(
    private readonly mapper: CommercialProposalPdfMapper,
    private readonly tenantService: TenantService,
    private readonly documentPdfService: DocumentPdfService,
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
}

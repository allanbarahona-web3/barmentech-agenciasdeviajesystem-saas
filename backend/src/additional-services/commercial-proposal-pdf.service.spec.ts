import { CommercialProposalPdfMapper } from "./commercial-proposal-pdf.mapper";
import { CommercialProposalPdfService } from "./commercial-proposal-pdf.service";
import type { CommercialProposalPdfDto } from "./dto";
import type { AdditionalServiceOrderRecord } from "./repositories";
import { TenantService } from "../tenant/tenant.service";
import { DocumentPdfService } from "../documents/document-pdf.service";
import {
  AdditionalServiceCurrency,
  PaymentConditionType,
} from "./enums";

describe("CommercialProposalPdfService", () => {
  it("resolves the public company projection from Company Settings", async () => {
    const order = { orderNumber: "AS-2026-0042" } as AdditionalServiceOrderRecord;
    const document = { proposalNumber: order.orderNumber } as CommercialProposalPdfDto;
    const mapper = {
      map: jest.fn().mockReturnValue(document),
    } as unknown as CommercialProposalPdfMapper;
    const tenantService = {
      getTenantConfig: jest.fn().mockResolvedValue({
        id: "tenant-internal-id",
        name: "Viajes Ejemplo",
        legalId: "3-101-123456",
        contactEmail: "ventas@example.com",
        contactPhone: "+506 2222-2222",
        logoUrl: "https://example.com/logo.png",
        businessAddress: "San José",
        primaryColor: "#123456",
      }),
    } as unknown as TenantService;
    const documentPdfService = {
      renderDocumentToBuffer: jest.fn(),
    } as unknown as DocumentPdfService;
    const service = new CommercialProposalPdfService(
      mapper,
      tenantService,
      documentPdfService,
    );

    await expect(service.prepareDocument(order, "tenant-auth-id")).resolves.toBe(
      document,
    );
    expect(tenantService.getTenantConfig).toHaveBeenCalledWith("tenant-auth-id");
    expect(mapper.map).toHaveBeenCalledWith(order, {
      name: "Viajes Ejemplo",
      legalId: "3-101-123456",
      contactEmail: "ventas@example.com",
      contactPhone: "+506 2222-2222",
      logoSrc: "https://example.com/logo.png",
    });
  });

  it("renders the prepared HTML through DocumentPdfService and returns its buffer", async () => {
    const order = { orderNumber: "AS-2026-0042" } as AdditionalServiceOrderRecord;
    const document = buildDocument();
    const pdfBuffer = Buffer.from("valid-pdf-buffer");
    const mapper = {
      map: jest.fn().mockReturnValue(document),
    } as unknown as CommercialProposalPdfMapper;
    const tenantService = {
      getTenantConfig: jest.fn().mockResolvedValue({
        name: document.company.name,
        legalId: document.company.legalId,
        contactEmail: document.company.contactEmail,
        contactPhone: document.company.contactPhone,
        logoUrl: document.company.logoSrc,
      }),
    } as unknown as TenantService;
    const documentPdfService = {
      renderDocumentToBuffer: jest.fn().mockResolvedValue({
        pdfBuffer,
        signatureAnchors: {},
      }),
    } as unknown as DocumentPdfService;
    const service = new CommercialProposalPdfService(
      mapper,
      tenantService,
      documentPdfService,
    );

    await expect(service.renderPdf(order, "tenant-auth-id")).resolves.toBe(
      pdfBuffer,
    );
    expect(documentPdfService.renderDocumentToBuffer).toHaveBeenCalledTimes(1);
    const html = (documentPdfService.renderDocumentToBuffer as jest.Mock).mock
      .calls[0][0] as string;
    expect(html).toContain(document.company.name);
    expect(html).toContain(document.proposalNumber);
    expect(html).toContain(document.customer.fullName);
    expect(html).toContain(document.services[0].name);
    expect(html).toContain("Totales");
    expect(html).toContain("Condiciones comerciales");
    expect(html).toContain('class="doc-footer"');
  });
});

function buildDocument(): CommercialProposalPdfDto {
  return {
    company: {
      name: "Viajes Ejemplo",
      legalId: "3-101-123456",
      contactEmail: "ventas@example.com",
      contactPhone: "+506 2222-2222",
      logoSrc: null,
    },
    proposalNumber: "AS-2026-0042",
    issuedAt: "2026-08-06T15:00:00.000Z",
    validUntil: "2026-08-20T00:00:00.000Z",
    currency: AdditionalServiceCurrency.USD,
    customer: {
      fullName: "Ana Cliente",
      identification: "1-1111-1111",
      email: "ana@example.com",
      phone: "+506 8888-8888",
    },
    travel: null,
    services: [
      {
        name: "Equipaje adicional",
        details: [],
        participants: [],
        notes: null,
        subtotal: "100.00",
        vatPercentage: "13.00",
        vatAmount: "13.00",
        total: "113.00",
      },
    ],
    paymentTerms: {
      condition: PaymentConditionType.CASH,
      termValue: null,
      termUnit: null,
    },
    observations: null,
    subtotal: "100.00",
    vatTotal: "13.00",
    total: "113.00",
  };
}

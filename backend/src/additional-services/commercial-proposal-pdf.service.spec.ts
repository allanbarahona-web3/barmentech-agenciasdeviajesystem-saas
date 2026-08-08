import { CommercialProposalPdfMapper } from "./commercial-proposal-pdf.mapper";
import { CommercialProposalPdfService } from "./commercial-proposal-pdf.service";
import type { CommercialProposalPdfDto } from "./dto";
import type { AdditionalServiceOrderRecord } from "./repositories";
import type { AdditionalServicesRepository } from "./repositories";
import { TenantService } from "../tenant/tenant.service";
import { DocumentPdfService } from "../documents/document-pdf.service";
import { ConfigService } from "@nestjs/config";
import { GeneratedDocumentsService } from "../generated-documents";
import { StorageService } from "../storage/storage.service";
import {
  AdditionalServiceCurrency,
  AdditionalServiceOrderStatus,
  CommercialProposalStatus,
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
      {} as StorageService,
      {} as GeneratedDocumentsService,
      {} as ConfigService,
      {} as AdditionalServicesRepository,
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
      businessAddress: "San José",
      primaryColor: "#123456",
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
        businessAddress: document.company.businessAddress,
        primaryColor: document.company.primaryColor,
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
      {} as StorageService,
      {} as GeneratedDocumentsService,
      {} as ConfigService,
      {} as AdditionalServicesRepository,
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
    expect(html).toContain("TOTAL");
    expect(html).toContain("CONDICIONES COMERCIALES");
    expect(html).toContain('class="quote-footer"');
  });

  it("uploads and registers one deterministic GENERATED proposal", async () => {
    const order = {
      id: "order-1",
      tenantId: "tenant-1",
      orderNumber: "AS 2026/0042",
      status: AdditionalServiceOrderStatus.DRAFT,
      commercialStatus: CommercialProposalStatus.DRAFT,
    } as AdditionalServiceOrderRecord;
    const pdfBuffer = Buffer.from("proposal-pdf");
    const storedDocument = { id: "document-1" };
    const tenantService = {
      getTenantConfig: jest.fn().mockResolvedValue({ subdomain: "acme-travel" }),
    } as unknown as TenantService;
    const storageService = {
      uploadObject: jest.fn().mockResolvedValue(undefined),
    } as unknown as StorageService;
    const generatedDocumentsService = {
      register: jest.fn().mockResolvedValue(storedDocument),
    } as unknown as GeneratedDocumentsService;
    const configService = {
      get: jest.fn().mockReturnValue("production"),
    } as unknown as ConfigService;
    const repository = {
      updateOrderDelivery: jest.fn().mockResolvedValue(order),
    } as unknown as AdditionalServicesRepository;
    const service = new CommercialProposalPdfService(
      {} as CommercialProposalPdfMapper,
      tenantService,
      {} as DocumentPdfService,
      storageService,
      generatedDocumentsService,
      configService,
      repository,
    );
    jest.spyOn(service, "renderPdf").mockResolvedValue(pdfBuffer);

    await expect(service.persist(order, "tenant-1")).resolves.toBe(
      storedDocument,
    );

    const objectKey =
      "production/acme-travel/additional-services/proposals/AS-2026-0042/proposal.pdf";
    expect(storageService.uploadObject).toHaveBeenCalledWith({
      objectKey,
      contentType: "application/pdf",
      body: pdfBuffer,
    });
    expect(generatedDocumentsService.register).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      ownerType: "ADDITIONAL_SERVICE_ORDER",
      ownerId: "order-1",
      documentType: "COMMERCIAL_PROPOSAL",
      variant: "GENERATED",
      objectKey,
      fileName: "proposal.pdf",
      mimeType: "application/pdf",
      size: pdfBuffer.length,
    });
    expect(repository.updateOrderDelivery).toHaveBeenCalledWith(
      "tenant-1",
      "order-1",
      { commercialStatus: CommercialProposalStatus.PDF_GENERATED },
    );
  });

  it("rejects persistence across tenant boundaries before rendering", async () => {
    const service = new CommercialProposalPdfService(
      {} as CommercialProposalPdfMapper,
      {} as TenantService,
      {} as DocumentPdfService,
      {} as StorageService,
      {} as GeneratedDocumentsService,
      {} as ConfigService,
      {} as AdditionalServicesRepository,
    );
    const renderPdf = jest.spyOn(service, "renderPdf");

    await expect(
      service.persist(
        {
          id: "order-1",
          tenantId: "tenant-2",
          orderNumber: "AS-1",
        } as AdditionalServiceOrderRecord,
        "tenant-1",
      ),
    ).rejects.toThrow("authenticated tenant");
    expect(renderPdf).not.toHaveBeenCalled();
  });

  it("returns a safe signed preview for the persisted version-1 document", async () => {
    const document = {
      id: "document-1",
      tenantId: "tenant-1",
      ownerType: "ADDITIONAL_SERVICE_ORDER",
      ownerId: "order-1",
      documentType: "COMMERCIAL_PROPOSAL",
      variant: "GENERATED",
      version: 1,
      objectKey: "production/acme/proposal.pdf",
      fileName: "proposal.pdf",
      mimeType: "application/pdf",
      size: 2048,
      createdAt: new Date("2026-08-06T12:00:00.000Z"),
      updatedAt: new Date("2026-08-06T12:30:00.000Z"),
    };
    const generatedDocumentsService = {
      findLatest: jest.fn().mockResolvedValue(document),
      getSignedUrl: jest.fn().mockResolvedValue("https://signed.example/pdf"),
    } as unknown as GeneratedDocumentsService;
    const service = new CommercialProposalPdfService(
      {} as CommercialProposalPdfMapper,
      {} as TenantService,
      {} as DocumentPdfService,
      {} as StorageService,
      generatedDocumentsService,
      {} as ConfigService,
      {} as AdditionalServicesRepository,
    );

    const result = await service.getPersistedPreview(
      {
        id: "order-1",
        tenantId: "tenant-1",
      } as AdditionalServiceOrderRecord,
      "tenant-1",
    );

    expect(generatedDocumentsService.findLatest).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      ownerType: "ADDITIONAL_SERVICE_ORDER",
      ownerId: "order-1",
      documentType: "COMMERCIAL_PROPOSAL",
      variant: "GENERATED",
      version: 1,
    });
    expect(generatedDocumentsService.getSignedUrl).toHaveBeenCalledWith(
      "tenant-1",
      "document-1",
      900,
    );
    expect(result).toEqual({
      id: "document-1",
      fileName: "proposal.pdf",
      mimeType: "application/pdf",
      size: 2048,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      url: "https://signed.example/pdf",
      expiresInSeconds: 900,
    });
    expect(result).not.toHaveProperty("objectKey");
  });

  it("returns a clear not-found state when no persisted proposal exists", async () => {
    const generatedDocumentsService = {
      findLatest: jest.fn().mockResolvedValue(null),
      getSignedUrl: jest.fn(),
    } as unknown as GeneratedDocumentsService;
    const service = new CommercialProposalPdfService(
      {} as CommercialProposalPdfMapper,
      {} as TenantService,
      {} as DocumentPdfService,
      {} as StorageService,
      generatedDocumentsService,
      {} as ConfigService,
      {} as AdditionalServicesRepository,
    );

    await expect(
      service.getPersistedPreview(
        { id: "order-1", tenantId: "tenant-1" } as AdditionalServiceOrderRecord,
        "tenant-1",
      ),
    ).rejects.toThrow("No persisted commercial proposal PDF");
    expect(generatedDocumentsService.getSignedUrl).not.toHaveBeenCalled();
  });
});

function buildDocument(): CommercialProposalPdfDto {
  return {
    company: {
      name: "Viajes Ejemplo",
      legalId: "3-101-123456",
      contactEmail: "ventas@example.com",
      contactPhone: "+506 2222-2222",
      businessAddress: "San José, Costa Rica",
      primaryColor: "#245a9b",
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

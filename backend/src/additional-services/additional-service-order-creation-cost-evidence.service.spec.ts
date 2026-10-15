import { BadRequestException } from "@nestjs/common";
import { AdditionalServiceCurrency, AdditionalServiceMarginType, AdditionalServiceOrderStatus, AdditionalServiceTravelType } from "./enums";
import { AdditionalServicesService } from "./additional-services.service";
import type { AdditionalServicesRepository, CreateAdditionalServiceOrderData } from "./repositories";
import { PricingEngineService } from "../pricing-engine";
import { FiscalCatalogService } from "../fiscal-catalogs/fiscal-catalog.service";
import { AdditionalServiceCommercialCostEvidenceService } from "./additional-service-commercial-cost-evidence.service";
import type { CreateAdditionalServiceOrderDto } from "./dto";
import type { AdditionalServiceOrderCreationEvidence } from "./additional-services.service";

describe("AdditionalServicesService order-creation cost evidence", () => {
  it("accepts URL-only, image-only, and URL-plus-image sources", async () => {
    const urlOnly = setup();
    await expect(urlOnly.create(order())).resolves.toMatchObject({ status: AdditionalServiceOrderStatus.DRAFT });
    expect(urlOnly.evidence.prepareForOrderCreation).not.toHaveBeenCalled();

    const imageOnly = setup();
    await expect(imageOnly.create(order({ lines: [line({ supplierCostUrl: undefined, temporaryLineKey: "line-a" })] }), [evidence("line-a")])).resolves.toMatchObject({ status: AdditionalServiceOrderStatus.DRAFT });
    expect(imageOnly.evidence.prepareForOrderCreation).toHaveBeenCalledTimes(1);
    expect(imageOnly.repository.create).toHaveBeenCalledWith(expect.objectContaining({
      lines: [expect.objectContaining({
        costEvidenceObjectKey: "additional-services/cost-evidence/tenant-a/order-a/line-a.webp",
        costEvidenceOriginalFilename: "quote.png",
        costEvidenceMimeType: "image/webp",
        costEvidenceByteSize: 12,
      })],
    }));

    const both = setup();
    await expect(both.create(order({ lines: [line({ temporaryLineKey: "line-a" })] }), [evidence("line-a")])).resolves.toMatchObject({ status: AdditionalServiceOrderStatus.DRAFT });
    expect(both.evidence.uploadPreparedForOrderCreation).toHaveBeenCalledTimes(1);
  });

  it("rejects neither-present and malformed non-empty URLs before persistence", async () => {
    const missing = setup();
    await expect(missing.create(order({ lines: [line({ supplierCostUrl: undefined })] }))).rejects.toBeInstanceOf(BadRequestException);
    expect(missing.repository.create).not.toHaveBeenCalled();

    const malformed = setup();
    await expect(malformed.create(order({ lines: [line({ supplierCostUrl: "ftp://supplier.example/cost" })] }))).rejects.toBeInstanceOf(BadRequestException);
    expect(malformed.repository.create).not.toHaveBeenCalled();
  });

  it("maps evidence by temporary key rather than line position and supports mixed multi-line sources", async () => {
    const c = setup();
    const dto = order({
      lines: [
        line({ temporaryLineKey: "url-line", supplierCostUrl: "https://supplier.example/one" }),
        line({ temporaryLineKey: "image-line", supplierCostUrl: undefined }),
      ],
    });

    await c.create(dto, [evidence("image-line")]);

    expect(c.evidence.prepareForOrderCreation).toHaveBeenCalledWith(
      "tenant-a",
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ originalname: "quote.png" }),
    );
    const persisted = c.repository.create.mock.calls[0][0];
    expect(persisted.lines[0]).not.toHaveProperty("costEvidenceObjectKey");
    expect(persisted.lines[1]).toEqual(expect.objectContaining({
      costEvidenceObjectKey: "additional-services/cost-evidence/tenant-a/order-a/line-a.webp",
    }));
  });

  it("rejects evidence for unknown or duplicated temporary keys", async () => {
    const unknown = setup();
    await expect(unknown.create(order({ lines: [line({ temporaryLineKey: "line-a" })] }), [evidence("missing")])).rejects.toBeInstanceOf(BadRequestException);

    const duplicate = setup();
    await expect(duplicate.create(order({ lines: [line({ temporaryLineKey: "line-a" })] }), [evidence("line-a"), evidence("line-a")])).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not create an order when image preparation or upload fails", async () => {
    const invalid = setup();
    invalid.evidence.prepareForOrderCreation.mockRejectedValue(new BadRequestException("Invalid image file."));
    await expect(invalid.create(order({ lines: [line({ supplierCostUrl: undefined, temporaryLineKey: "line-a" })] }), [evidence("line-a")])).rejects.toBeInstanceOf(BadRequestException);
    expect(invalid.repository.create).not.toHaveBeenCalled();

    const uploadFailure = setup();
    uploadFailure.evidence.uploadPreparedForOrderCreation.mockRejectedValue(new Error("storage failed"));
    await expect(uploadFailure.create(order({ lines: [line({ supplierCostUrl: undefined, temporaryLineKey: "line-a" })] }), [evidence("line-a")])).rejects.toThrow("storage failed");
    expect(uploadFailure.repository.create).not.toHaveBeenCalled();
    expect(uploadFailure.evidence.cleanupPreparedForOrderCreation).not.toHaveBeenCalled();
  });

  it("cleans uploaded evidence when database persistence fails and scopes preparation to the authenticated tenant", async () => {
    const c = setup();
    c.repository.create.mockRejectedValue(new Error("database failed"));

    await expect(c.create(order({ lines: [line({ supplierCostUrl: undefined, temporaryLineKey: "line-a" })] }), [evidence("line-a")])).rejects.toThrow("database failed");

    expect(c.evidence.prepareForOrderCreation).toHaveBeenCalledWith(
      "tenant-a",
      expect.any(String),
      expect.any(String),
      expect.any(Object),
    );
    expect(c.evidence.cleanupPreparedForOrderCreation).toHaveBeenCalledWith(
      "additional-services/cost-evidence/tenant-a/order-a/line-a.webp",
    );
  });
});

function setup() {
  const repository = {
    findTenantById: jest.fn().mockResolvedValue({ id: "tenant-a", contractPrefix: "ACME" }),
    findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    executeInTransaction: jest.fn(async (work) => work(repository)),
    create: jest.fn(async (data: CreateAdditionalServiceOrderData) => ({
      id: data.id ?? "order-1",
      orderNumber: "ACME-AS-1",
      status: AdditionalServiceOrderStatus.DRAFT,
    })),
  } as unknown as jest.Mocked<AdditionalServicesRepository>;
  const evidence = {
    prepareForOrderCreation: jest.fn().mockResolvedValue({
      objectKey: "additional-services/cost-evidence/tenant-a/order-a/line-a.webp",
      originalFilename: "quote.png",
      mimeType: "image/webp",
      byteSize: 12,
      contentHash: "a".repeat(64),
      bytes: Buffer.from("webp"),
    }),
    uploadPreparedForOrderCreation: jest.fn().mockResolvedValue(undefined),
    cleanupPreparedForOrderCreation: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AdditionalServicesService(
    repository,
    {} as PricingEngineService,
    {} as FiscalCatalogService,
    evidence as unknown as AdditionalServiceCommercialCostEvidenceService,
  );
  const internals = service as unknown as {
    validateTravelReference: jest.Mock;
    validateAndResolveLines: jest.Mock;
    validateParticipants: jest.Mock;
    validateTravelParticipants: jest.Mock;
  };
  internals.validateTravelReference = jest.fn().mockResolvedValue({ travelPackageId: "travel-1" });
  internals.validateAndResolveLines = jest.fn(async (_repository, _tenant, dto) => ({
    lines: dto.lines.map((input: ReturnType<typeof line>) => resolvedLine(input)),
    participantIds: ["client-1"],
  }));
  internals.validateParticipants = jest.fn().mockResolvedValue([
    { id: "client-1", fullName: "Customer", idNumber: "1-1111-1111", email: null, phone: null },
  ]);
  internals.validateTravelParticipants = jest.fn().mockResolvedValue({
    roles: new Map([["client-1", "HOLDER"]]),
    contractContextSnapshots: new Map([["client-1", null]]),
  });
  return {
    repository,
    evidence,
    create: (dto: CreateAdditionalServiceOrderDto, inputs: AdditionalServiceOrderCreationEvidence[] = []) => service.createOrder(
      "tenant-a",
      { id: "user-a", fullName: "Agent A" },
      dto,
      inputs,
    ),
  };
}

function order(overrides: Partial<ReturnType<typeof baseOrder>> = {}) {
  return { ...baseOrder(), ...overrides };
}

function baseOrder() {
  return {
    idempotencyKey: "workflow-a",
    travelId: "travel-1",
    travelType: AdditionalServiceTravelType.INTERNATIONAL,
    quoteCustomerId: "client-1",
    quotationCurrency: AdditionalServiceCurrency.USD,
    lines: [line()],
  };
}

function line(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    serviceCode: "TOUR",
    serviceDetailsVersion: 1 as const,
    serviceDetails: { serviceDate: "2026-10-20", tourName: "City Tour" },
    supplierId: "supplier-1",
    supplierCostUrl: "https://supplier.example/cost",
    supplierCost: 100,
    supplierCostCurrency: AdditionalServiceCurrency.USD,
    participantIds: ["client-1"],
    ...overrides,
  };
}

function resolvedLine(input: ReturnType<typeof line>) {
  return {
    additionalServiceCatalogId: "catalog-1",
    serviceCode: "TOUR",
    serviceName: "Tour",
    serviceDetailsVersion: 1,
    serviceDetails: input.serviceDetails,
    supplierId: "supplier-1",
    supplierName: "Supplier",
    supplierCostUrl: input.supplierCostUrl,
    supplierCost: 100,
    supplierCostCurrency: AdditionalServiceCurrency.USD,
    quotationCurrency: AdditionalServiceCurrency.USD,
    supplierCostInQuotationCurrency: 100,
    exchangeRateId: null,
    exchangeRateDate: null,
    exchangeRateSource: null,
    exchangeRateBuyRate: null,
    exchangeRateSellRate: null,
    exchangeRateType: null,
    appliedExchangeRate: 1,
    marginType: AdditionalServiceMarginType.FIXED,
    marginValue: 10,
    marginAmount: 10,
    subtotal: 110,
    vatPercentage: 13,
    vatAmount: 14.3,
    finalSellingPrice: 124.3,
    commercialNotes: undefined,
    participantClientIds: ["client-1"],
  };
}

function evidence(temporaryLineKey: string) {
  return {
    temporaryLineKey,
    file: { buffer: Buffer.from("png"), mimetype: "image/png", originalname: "quote.png", size: 3 },
  };
}

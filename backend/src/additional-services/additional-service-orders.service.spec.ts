import { BadRequestException } from "@nestjs/common";
import { PricingEngineService } from "../pricing-engine";
import {
  AdditionalServiceCurrency,
  AdditionalServiceMarginType,
  AdditionalServiceOrderStatus,
  AdditionalServiceTravelType,
} from "./enums";
import {
  AdditionalServiceOrderRecord,
  AdditionalServicesRepository,
} from "./repositories";
import { AdditionalServicesService } from "./additional-services.service";

describe("AdditionalServicesService orders", () => {
  const tenantId = "tenant-1";
  let repository: jest.Mocked<AdditionalServicesRepository>;
  let pricingEngine: jest.Mocked<Pick<PricingEngineService, "calculate">>;
  let service: AdditionalServicesService;

  beforeEach(() => {
    repository = {
      executeInTransaction: jest.fn(),
      findTenantById: jest.fn(),
      findAllTenantIds: jest.fn(),
      findTravelPackageById: jest.fn(),
      findInternalBookingById: jest.fn(),
      findParticipantsByIds: jest.fn(),
      findTravelParticipantIds: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findByTravel: jest.fn(),
      findAdditionalServiceCatalogById: jest.fn(),
      findAdditionalServiceCatalogByCode: jest.fn(),
      findAdditionalServiceCatalogs: jest.fn(),
      findAdditionalServiceCatalogCodes: jest.fn(),
      createAdditionalServiceCatalogItems: jest.fn(),
      findPricingConfigurations: jest.fn(),
      findPricingConfigurationById: jest.fn(),
      findPricingConfigurationByCatalogId: jest.fn(),
      createPricingConfiguration: jest.fn(),
      updatePricingConfiguration: jest.fn(),
      findSuppliers: jest.fn(),
      findSupplierById: jest.fn(),
      findSupplierByName: jest.fn(),
      createSupplier: jest.fn(),
      updateSupplier: jest.fn(),
    };
    repository.executeInTransaction.mockImplementation((work) =>
      work(repository),
    );
    pricingEngine = { calculate: jest.fn() };
    service = new AdditionalServicesService(
      repository,
      pricingEngine as unknown as PricingEngineService,
    );
  });

  it("calculates and persists an official backend pricing snapshot", async () => {
    repository.findTenantById.mockResolvedValue({
      id: tenantId,
      contractPrefix: "ACME",
    });
    repository.findTravelPackageById.mockResolvedValue({
      id: "travel-1",
      tenantId,
    });
    repository.findAdditionalServiceCatalogByCode.mockResolvedValue({
      id: "catalog-1",
      tenantId,
      code: "VISA_ASSISTANCE",
      name: "Visa Assistance",
      isActive: true,
    });
    repository.findSupplierById.mockResolvedValue({
      id: "supplier-1",
      tenantId,
      name: "Supplier One",
      website: null,
      supplierType: "INTERNATIONAL",
      supplierCategory: null,
      notes: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    repository.findParticipantsByIds.mockResolvedValue([
      {
        id: "client-1",
        tenantId,
        fullName: "Customer One",
        idNumber: "1-1111-1111",
        email: "customer@example.com",
        phone: "8888-8888",
      },
    ]);
    repository.findTravelParticipantIds.mockResolvedValue(["client-1"]);
    pricingEngine.calculate.mockResolvedValue({
      supplierCost: 100,
      costCurrency: AdditionalServiceCurrency.USD,
      quotationCurrency: AdditionalServiceCurrency.CRC,
      supplierCostInQuotationCurrency: 52000,
      exchangeRateId: "rate-1",
      exchangeRateDate: new Date("2026-07-28T00:00:00.000Z"),
      exchangeRateSource: "MANUAL",
      exchangeRateBuyRate: 515,
      exchangeRateSellRate: 520,
      exchangeRateType: "SELL",
      appliedExchangeRate: 520,
      marginType: AdditionalServiceMarginType.PERCENTAGE,
      marginValue: 15,
      marginAmount: 7800,
      subtotal: 59800,
      vatPercentage: 13,
      vatAmount: 7774,
      finalSellingPrice: 67574,
    });
    repository.create.mockImplementation(async (data) => ({
      id: "order-1",
      tenantId,
      orderNumber: data.orderNumber,
      idempotencyKey: data.idempotencyKey,
      travelPackageId: "travel-1",
      internalBookingId: null,
      travelType: AdditionalServiceTravelType.INTERNATIONAL,
      quotationCurrency: AdditionalServiceCurrency.CRC,
      commercialSubtotal: "59800",
      totalVat: "7774",
      totalSellingPrice: "67574",
      travel: null,
      status: AdditionalServiceOrderStatus.DRAFT,
      lines: [],
      createdByUserId: "user-1",
      createdByName: "Agent One",
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies AdditionalServiceOrderRecord));

    await service.createOrder(
      tenantId,
      { id: "user-1", fullName: "Agent One" },
      {
        idempotencyKey: "workflow-1",
        travelId: "travel-1",
        travelType: AdditionalServiceTravelType.INTERNATIONAL,
        quotationCurrency: AdditionalServiceCurrency.CRC,
        lines: [
          {
            serviceCode: "visa_assistance",
            supplierId: "supplier-1",
            supplierCostUrl: "https://supplier.example/cost",
            supplierCost: 100,
            supplierCostCurrency: AdditionalServiceCurrency.USD,
            commercialNotes: "Snapshot note",
            participantIds: ["client-1"],
          },
        ],
      },
    );

    expect(pricingEngine.calculate).toHaveBeenCalledWith({
      tenantId,
      additionalServiceId: "catalog-1",
      supplierCost: 100,
      costCurrency: AdditionalServiceCurrency.USD,
      quotationCurrency: AdditionalServiceCurrency.CRC,
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "workflow-1",
        quotationCurrency: AdditionalServiceCurrency.CRC,
        commercialSubtotal: 59800,
        totalVat: 7774,
        totalSellingPrice: 67574,
        lines: [
          expect.objectContaining({
            supplierCostInQuotationCurrency: 52000,
            exchangeRateId: "rate-1",
            exchangeRateType: "SELL",
            appliedExchangeRate: 520,
            marginAmount: 7800,
            vatAmount: 7774,
            finalSellingPrice: 67574,
            participants: [
              {
                clientId: "client-1",
                fullName: "Customer One",
                identification: "1-1111-1111",
                email: "customer@example.com",
                phone: "8888-8888",
              },
            ],
          }),
        ],
      }),
    );
  });

  it("returns the existing order for a repeated idempotency key", async () => {
    const existing = {
      id: "order-1",
      status: AdditionalServiceOrderStatus.DRAFT,
    } as AdditionalServiceOrderRecord;
    repository.findTenantById.mockResolvedValue({
      id: tenantId,
      contractPrefix: "ACME",
    });
    repository.findByIdempotencyKey.mockResolvedValue(existing);

    await expect(
      service.createOrder(
        tenantId,
        { id: "user-1", fullName: "Agent One" },
        {
          idempotencyKey: "workflow-1",
          travelId: "travel-1",
          travelType: AdditionalServiceTravelType.INTERNATIONAL,
          quotationCurrency: AdditionalServiceCurrency.USD,
          lines: [{}] as never,
        },
      ),
    ).resolves.toBe(existing);

    expect(pricingEngine.calculate).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("reads an order using the authenticated tenant scope", async () => {
    const order = {
      id: "order-1",
      status: AdditionalServiceOrderStatus.DRAFT,
    } as AdditionalServiceOrderRecord;
    repository.findById.mockResolvedValue(order);

    await expect(service.getOrder(tenantId, "order-1")).resolves.toBe(
      order,
    );
    expect(repository.findById).toHaveBeenCalledWith(
      tenantId,
      "order-1",
    );
  });

  it("rejects a travel belonging to another tenant", async () => {
    repository.findTenantById.mockResolvedValue({
      id: tenantId,
      contractPrefix: "ACME",
    });
    repository.findTravelPackageById.mockResolvedValue({
      id: "travel-1",
      tenantId: "tenant-2",
    });

    await expect(
      service.createOrder(
        tenantId,
        { id: "user-1", fullName: "Agent One" },
        {
          idempotencyKey: "workflow-2",
          travelId: "travel-1",
          travelType: AdditionalServiceTravelType.INTERNATIONAL,
          quotationCurrency: AdditionalServiceCurrency.USD,
          lines: [{}] as never,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

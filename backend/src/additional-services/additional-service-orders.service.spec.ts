import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PricingEngineService } from "../pricing-engine";
import { CreateAdditionalServiceOrderDto } from "./dto";
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
  let pricingEngine: jest.Mocked<Pick<PricingEngineService, "calculateMany">>;
  let service: AdditionalServicesService;

  beforeEach(() => {
    repository = {
      executeInTransaction: jest.fn(),
      findTenantById: jest.fn(),
      findAllTenantIds: jest.fn(),
      findTravelPackageById: jest.fn(),
      findInternalBookingById: jest.fn(),
      findParticipantsByIds: jest.fn(),
      findTravelParticipants: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findByTravel: jest.fn(),
      findOrderDashboardPage: jest.fn(),
      findAdditionalServiceCatalogById: jest.fn(),
      findAdditionalServiceCatalogByCode: jest.fn(),
      findAdditionalServiceCatalogsByCodes: jest.fn(),
      findAdditionalServiceCatalogs: jest.fn(),
      findAdditionalServiceCatalogCodes: jest.fn(),
      createAdditionalServiceCatalogItems: jest.fn(),
      findPricingConfigurations: jest.fn(),
      findPricingConfigurationById: jest.fn(),
      findPricingConfigurationByCatalogId: jest.fn(),
      findPricingConfigurationsByCatalogIds: jest.fn(),
      createPricingConfiguration: jest.fn(),
      updatePricingConfiguration: jest.fn(),
      findSuppliers: jest.fn(),
      findSupplierById: jest.fn(),
      findSuppliersByIds: jest.fn(),
      findSupplierByName: jest.fn(),
      createSupplier: jest.fn(),
      updateSupplier: jest.fn(),
    };
    repository.executeInTransaction.mockImplementation((work) =>
      work(repository),
    );
    pricingEngine = { calculateMany: jest.fn() };
    service = new AdditionalServicesService(
      repository,
      pricingEngine as unknown as PricingEngineService,
    );
  });

  it("requires a non-empty quoteCustomerId for new orders", async () => {
    const dto = plainToInstance(CreateAdditionalServiceOrderDto, {
      idempotencyKey: "workflow-1",
      travelId: "travel-1",
      travelType: AdditionalServiceTravelType.INTERNATIONAL,
      quoteCustomerId: "   ",
      quotationCurrency: AdditionalServiceCurrency.USD,
      lines: [{}],
    });

    const errors = await validate(dto);

    expect(errors.some(({ property }) => property === "quoteCustomerId")).toBe(
      true,
    );
  });

  it("accepts an internal-travel companion as quote customer", async () => {
    repository.findTenantById.mockResolvedValue({
      id: tenantId,
      contractPrefix: "ACME",
    });
    repository.findByIdempotencyKey.mockResolvedValue(null);
    repository.findParticipantsByIds.mockResolvedValue([
      {
        id: "client-2",
        tenantId,
        fullName: "Paying Companion",
        idNumber: "2-2222-2222",
        email: null,
        phone: null,
      },
    ]);
    repository.findTravelParticipants.mockResolvedValue([
      { clientId: "client-2", role: "COMPANION" },
    ]);
    repository.create.mockResolvedValue({
      id: "order-1",
      quoteCustomerId: "client-2",
      status: AdditionalServiceOrderStatus.DRAFT,
    } as AdditionalServiceOrderRecord);
    const serviceInternals = service as unknown as {
      validateTravelReference: () => Promise<{ internalBookingId: string }>;
      validateAndResolveLines: () => Promise<{
        lines: never[];
        participantIds: string[];
      }>;
    };
    jest
      .spyOn(serviceInternals, "validateTravelReference")
      .mockResolvedValue({ internalBookingId: "booking-1" });
    jest
      .spyOn(serviceInternals, "validateAndResolveLines")
      .mockResolvedValue({ lines: [], participantIds: [] });

    await service.createOrder(
      tenantId,
      { id: "user-1", fullName: "Agent One" },
      {
        idempotencyKey: "workflow-internal",
        travelId: "booking-1",
        travelType: AdditionalServiceTravelType.INTERNAL,
        quoteCustomerId: "client-2",
        quotationCurrency: AdditionalServiceCurrency.CRC,
        lines: [],
      },
    );

    expect(repository.findTravelParticipants).toHaveBeenCalledWith(tenantId, {
      internalBookingId: "booking-1",
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ quoteCustomerId: "client-2" }),
    );
  });

  it("rejects a quote customer who is unrelated to the selected travel", async () => {
    repository.findTenantById.mockResolvedValue({
      id: tenantId,
      contractPrefix: "ACME",
    });
    repository.findByIdempotencyKey.mockResolvedValue(null);
    repository.findParticipantsByIds.mockResolvedValue([
      {
        id: "unrelated-client",
        tenantId,
        fullName: "Unrelated Customer",
        idNumber: "3-3333-3333",
        email: null,
        phone: null,
      },
    ]);
    repository.findTravelParticipants.mockResolvedValue([]);
    const serviceInternals = service as unknown as {
      validateTravelReference: () => Promise<{ travelPackageId: string }>;
      validateAndResolveLines: () => Promise<{
        lines: never[];
        participantIds: string[];
      }>;
    };
    jest
      .spyOn(serviceInternals, "validateTravelReference")
      .mockResolvedValue({ travelPackageId: "travel-1" });
    jest
      .spyOn(serviceInternals, "validateAndResolveLines")
      .mockResolvedValue({ lines: [], participantIds: [] });

    await expect(
      service.createOrder(
        tenantId,
        { id: "user-1", fullName: "Agent One" },
        {
          idempotencyKey: "workflow-unrelated",
          travelId: "travel-1",
          travelType: AdditionalServiceTravelType.INTERNATIONAL,
          quoteCustomerId: "unrelated-client",
          quotationCurrency: AdditionalServiceCurrency.USD,
          lines: [],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
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
    repository.findAdditionalServiceCatalogsByCodes.mockResolvedValue([
      {
        id: "catalog-1",
        tenantId,
        code: "VISA_ASSISTANCE",
        name: "Visa Assistance",
        isActive: true,
      },
    ]);
    repository.findSuppliersByIds.mockResolvedValue([
      {
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
      },
    ]);
    repository.findParticipantsByIds.mockResolvedValue([
      {
        id: "client-1",
        tenantId,
        fullName: "Customer One",
        idNumber: "1-1111-1111",
        email: "customer@example.com",
        phone: "8888-8888",
      },
      {
        id: "client-2",
        tenantId,
        fullName: "Paying Companion",
        idNumber: "2-2222-2222",
        email: null,
        phone: null,
      },
    ]);
    repository.findTravelParticipants.mockResolvedValue([
      { clientId: "client-1", role: "HOLDER" },
      { clientId: "client-2", role: "COMPANION" },
    ]);
    pricingEngine.calculateMany.mockResolvedValue([{
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
    }]);
    repository.create.mockImplementation(async (data) => ({
      id: "order-1",
      tenantId,
      orderNumber: data.orderNumber,
      idempotencyKey: data.idempotencyKey,
      quoteCustomerId: data.quoteCustomerId,
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
        quoteCustomerId: "client-2",
        quotationCurrency: AdditionalServiceCurrency.CRC,
        lines: [
          {
            serviceCode: "visa_assistance",
            serviceDetailsVersion: 1,
            serviceDetails: {
              destinationCountry: "Estados Unidos",
              visaType: "TOURISM",
              expectedTravelDate: null,
            },
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

    expect(pricingEngine.calculateMany).toHaveBeenCalledWith([
      {
        tenantId,
        additionalServiceId: "catalog-1",
        supplierCost: 100,
        costCurrency: AdditionalServiceCurrency.USD,
        quotationCurrency: AdditionalServiceCurrency.CRC,
      },
    ]);
    expect(
      repository.findAdditionalServiceCatalogsByCodes,
    ).toHaveBeenCalledTimes(1);
    expect(repository.findSuppliersByIds).toHaveBeenCalledTimes(1);
    expect(
      repository.findAdditionalServiceCatalogByCode,
    ).not.toHaveBeenCalled();
    expect(repository.findSupplierById).not.toHaveBeenCalled();
    expect(repository.findByIdempotencyKey).toHaveBeenCalledTimes(2);
    expect(repository.findParticipantsByIds).toHaveBeenCalledWith([
      "client-1",
      "client-2",
    ]);
    expect(repository.findTravelParticipants).toHaveBeenCalledWith(
      tenantId,
      { travelPackageId: "travel-1" },
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ quoteCustomerId: "client-2" }),
    );
    expect(
      repository.findTravelPackageById.mock.invocationCallOrder[0],
    ).toBeLessThan(
      repository.executeInTransaction.mock.invocationCallOrder[0],
    );
    expect(
      pricingEngine.calculateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      repository.executeInTransaction.mock.invocationCallOrder[0],
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "workflow-1",
        quotationCurrency: AdditionalServiceCurrency.CRC,
        commercialSubtotal: 59800,
        totalVat: 7774,
        totalSellingPrice: 67574,
        lines: [
          expect.objectContaining({
            serviceDetailsVersion: 1,
            serviceDetails: {
              destinationCountry: "Estados Unidos",
              visaType: "TOURISM",
              expectedTravelDate: null,
            },
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
                role: "HOLDER",
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
          quoteCustomerId: "client-1",
          quotationCurrency: AdditionalServiceCurrency.USD,
          lines: [{}] as never,
        },
      ),
    ).resolves.toBe(existing);

    expect(pricingEngine.calculateMany).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("returns the winning order after a concurrent idempotency collision", async () => {
    const existing = {
      id: "order-winner",
      status: AdditionalServiceOrderStatus.DRAFT,
    } as AdditionalServiceOrderRecord;
    repository.findTenantById.mockResolvedValue({
      id: tenantId,
      contractPrefix: "ACME",
    });
    repository.findTravelPackageById.mockResolvedValue({
      id: "travel-1",
      tenantId,
    });
    repository.findAdditionalServiceCatalogsByCodes.mockResolvedValue([
      {
        id: "catalog-1",
        tenantId,
        code: "VISA_ASSISTANCE",
        name: "Visa Assistance",
        isActive: true,
      },
    ]);
    repository.findSuppliersByIds.mockResolvedValue([
      {
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
      },
    ]);
    repository.findParticipantsByIds.mockResolvedValue([
      {
        id: "client-1",
        tenantId,
        fullName: "Customer One",
        idNumber: "1-1111-1111",
        email: null,
        phone: null,
      },
    ]);
    repository.findTravelParticipants.mockResolvedValue([
      { clientId: "client-1", role: "HOLDER" },
    ]);
    pricingEngine.calculateMany.mockResolvedValue([
      {
        supplierCost: 100,
        costCurrency: AdditionalServiceCurrency.USD,
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
        marginValue: 15,
        marginAmount: 15,
        subtotal: 115,
        vatPercentage: 13,
        vatAmount: 14.95,
        finalSellingPrice: 129.95,
      },
    ]);
    repository.findByIdempotencyKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    repository.create.mockRejectedValue({
      code: "P2002",
      meta: { target: ["tenantId", "idempotencyKey"] },
    });

    await expect(
      service.createOrder(
        tenantId,
        { id: "user-1", fullName: "Agent One" },
        {
          idempotencyKey: "concurrent-workflow",
          travelId: "travel-1",
          travelType: AdditionalServiceTravelType.INTERNATIONAL,
          quoteCustomerId: "client-1",
          quotationCurrency: AdditionalServiceCurrency.USD,
          lines: [
            {
              serviceCode: "VISA_ASSISTANCE",
              serviceDetailsVersion: 1,
              serviceDetails: {
                destinationCountry: "Estados Unidos",
                visaType: "TOURISM",
                expectedTravelDate: null,
              },
              supplierId: "supplier-1",
              supplierCost: 100,
              supplierCostCurrency: AdditionalServiceCurrency.USD,
              participantIds: ["client-1"],
            },
          ],
        },
      ),
    ).resolves.toBe(existing);
    expect(repository.create).toHaveBeenCalledTimes(1);
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

  it("lists a tenant-scoped paginated dashboard read model", async () => {
    const dashboardPage = {
      orders: [
        {
          id: "order-1",
          orderNumber: "ACME-AS-1",
          customerName: "Customer One",
          travelId: "travel-1",
          travelName: "Miami",
          travelType: AdditionalServiceTravelType.INTERNATIONAL,
          createdAt: new Date("2026-07-30T12:00:00.000Z"),
          totalAmount: "129.9500",
          currency: AdditionalServiceCurrency.USD,
          status: AdditionalServiceOrderStatus.DRAFT,
        },
      ],
      total: 1,
      page: 2,
      pageSize: 10,
      totalPages: 1,
    };
    repository.findOrderDashboardPage.mockResolvedValue(dashboardPage);

    await expect(
      service.listOrderDashboard(tenantId, {
        page: 2,
        pageSize: 10,
        search: "  Customer One  ",
        travelId: "  travel-1  ",
        travelNumber: "  CTR-100  ",
        travelType: AdditionalServiceTravelType.INTERNATIONAL,
        createdFrom: "2026-07-01",
        createdTo: "2026-07-30",
        status: AdditionalServiceOrderStatus.DRAFT,
      }),
    ).resolves.toBe(dashboardPage);

    expect(repository.findOrderDashboardPage).toHaveBeenCalledWith(
      tenantId,
      {
        page: 2,
        pageSize: 10,
        search: "Customer One",
        travelId: "travel-1",
        travelNumber: "CTR-100",
        travelType: AdditionalServiceTravelType.INTERNATIONAL,
        createdFrom: expect.any(Date),
        createdTo: expect.any(Date),
        status: AdditionalServiceOrderStatus.DRAFT,
      },
    );
    expect(repository.findById).not.toHaveBeenCalled();
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
          quoteCustomerId: "client-1",
          quotationCurrency: AdditionalServiceCurrency.USD,
          lines: [{}] as never,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

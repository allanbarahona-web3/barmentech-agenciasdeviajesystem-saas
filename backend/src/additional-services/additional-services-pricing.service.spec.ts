import { NotFoundException } from "@nestjs/common";
import {
  PricingConfigurationMissingError,
  PricingEngineService,
} from "../pricing-engine";
import {
  AdditionalServicesRepository,
} from "./repositories";
import { AdditionalServicesPricingService } from "./additional-services-pricing.service";
import { FiscalCatalogService } from "../fiscal-catalogs/fiscal-catalog.service";
import { AdditionalServicePricingConfigurationReader } from "./infrastructure/additional-service-pricing-configuration.reader";

describe("AdditionalServicesPricingService", () => {
  let repository: jest.Mocked<AdditionalServicesRepository>;
  let pricingEngine: jest.Mocked<PricingEngineService>;
  let service: AdditionalServicesPricingService;

  beforeEach(() => {
    repository = {
      findAdditionalServiceCatalogByCode: jest.fn(),
    } as unknown as jest.Mocked<AdditionalServicesRepository>;
    pricingEngine = {
      calculate: jest.fn(),
    } as unknown as jest.Mocked<PricingEngineService>;
    service = new AdditionalServicesPricingService(
      repository,
      pricingEngine,
    );
  });

  it("resolves the tenant catalog code and returns the engine breakdown unchanged", async () => {
    const breakdown = {
      supplierCost: 100,
      costCurrency: "USD" as const,
      quotationCurrency: "USD" as const,
      supplierCostInQuotationCurrency: 100,
      exchangeRateId: null,
      exchangeRateDate: null,
      exchangeRateSource: null,
      exchangeRateBuyRate: null,
      exchangeRateSellRate: null,
      exchangeRateType: null,
      appliedExchangeRate: 1,
      marginType: "PERCENTAGE" as const,
      marginValue: 15,
      marginAmount: 15,
      subtotal: 115,
      vatPercentage: 13,
      vatAmount: 14.95,
      finalSellingPrice: 129.95,
    };
    repository.findAdditionalServiceCatalogByCode.mockResolvedValue({
      id: "catalog-1",
      tenantId: "tenant-1",
      code: "VISA_ASSISTANCE",
      name: "Visa Assistance",
      isActive: true,
    });
    pricingEngine.calculate.mockResolvedValue(breakdown);

    await expect(
      service.calculate("tenant-1", {
        serviceCode: " visa_assistance ",
        supplierCost: 100,
        costCurrency: "USD",
        quotationCurrency: "USD",
      }),
    ).resolves.toBe(breakdown);
    expect(
      repository.findAdditionalServiceCatalogByCode,
    ).toHaveBeenCalledWith("tenant-1", "VISA_ASSISTANCE");
    expect(pricingEngine.calculate).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      additionalServiceId: "catalog-1",
      supplierCost: 100,
      costCurrency: "USD",
      quotationCurrency: "USD",
    });
  });

  it("fails when the tenant catalog code cannot be resolved", async () => {
    repository.findAdditionalServiceCatalogByCode.mockResolvedValue(null);

    await expect(
      service.calculate("tenant-1", {
        serviceCode: "UNKNOWN",
        supplierCost: 100,
        costCurrency: "USD",
        quotationCurrency: "USD",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(pricingEngine.calculate).not.toHaveBeenCalled();
  });

  it("propagates existing pricing-engine business errors", async () => {
    const pricingError = new PricingConfigurationMissingError("catalog-1");
    repository.findAdditionalServiceCatalogByCode.mockResolvedValue({
      id: "catalog-1",
      tenantId: "tenant-1",
      code: "TOUR",
      name: "Tour",
      isActive: true,
    });
    pricingEngine.calculate.mockRejectedValue(pricingError);

    await expect(
      service.calculate("tenant-1", {
        serviceCode: "TOUR",
        supplierCost: 100,
        costCurrency: "USD",
        quotationCurrency: "USD",
      }),
    ).rejects.toBe(pricingError);
  });
});

describe("Additional Services public pricing path fiscal readiness", () => {
  it("returns no calculation for active legacy pricing without a fiscal profile", async () => {
    const repository = {
      findAdditionalServiceCatalogByCode: jest.fn().mockResolvedValue({ id: "catalog-1", tenantId: "tenant-1", code: "LODGING", name: "Acomodación", isActive: true }),
      findPricingConfigurationByCatalogId: jest.fn().mockResolvedValue({ id: "pricing-1", tenantId: "tenant-1", additionalServiceCatalogId: "catalog-1", marginType: "PERCENTAGE", marginValue: "10.0000", taxPercentage: "13.0000", isActive: true, createdAt: new Date(), updatedAt: new Date(), additionalServiceCatalog: { id: "catalog-1", tenantId: "tenant-1", code: "LODGING", name: "Acomodación", isActive: true } }),
      findFiscalProfilesByCatalogIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<AdditionalServicesRepository>;
    const fiscal = { evaluateFiscalProfiles: jest.fn().mockResolvedValue(new Map()), resolveFiscalSelection: jest.fn() };
    const reader = new AdditionalServicePricingConfigurationReader(repository, fiscal as unknown as FiscalCatalogService);
    const engine = new PricingEngineService(reader, { findCurrent: jest.fn() } as never);
    const service = new AdditionalServicesPricingService(repository, engine);

    await expect(service.calculate("tenant-1", { serviceCode: "LODGING", supplierCost: 100, costCurrency: "USD", quotationCurrency: "USD" })).rejects.toMatchObject({ response: { code: "ADDITIONAL_SERVICE_NOT_FISCALLY_READY" } });
    expect(fiscal.evaluateFiscalProfiles).toHaveBeenCalledTimes(1);
    expect(fiscal.resolveFiscalSelection).not.toHaveBeenCalled();
  });
});

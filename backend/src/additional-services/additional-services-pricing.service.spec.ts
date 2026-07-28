import { NotFoundException } from "@nestjs/common";
import {
  PricingConfigurationMissingError,
  PricingEngineService,
} from "../pricing-engine";
import {
  AdditionalServicesRepository,
} from "./repositories";
import { AdditionalServicesPricingService } from "./additional-services-pricing.service";

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
    });
  });

  it("fails when the tenant catalog code cannot be resolved", async () => {
    repository.findAdditionalServiceCatalogByCode.mockResolvedValue(null);

    await expect(
      service.calculate("tenant-1", {
        serviceCode: "UNKNOWN",
        supplierCost: 100,
        costCurrency: "USD",
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
      }),
    ).rejects.toBe(pricingError);
  });
});

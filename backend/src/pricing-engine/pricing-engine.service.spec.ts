import {
  PRICING_CONFIGURATION_READER,
  PricingConfigurationReader,
} from "./pricing-configuration-reader.interface";
import {
  InvalidPricingInputError,
  PricingConfigurationMissingError,
} from "./pricing-engine.errors";
import { PricingEngineService } from "./pricing-engine.service";

describe("PricingEngineService", () => {
  let configurationReader: jest.Mocked<PricingConfigurationReader>;
  let service: PricingEngineService;

  beforeEach(() => {
    configurationReader = {
      findForAdditionalService: jest.fn(),
    };
    service = new PricingEngineService(configurationReader);
  });

  it("calculates percentage margin, subtotal, VAT, and final price", async () => {
    configurationReader.findForAdditionalService.mockResolvedValue({
      marginType: "PERCENTAGE",
      marginValue: 15,
      vatPercentage: 13,
      isActive: true,
    });

    await expect(
      service.calculate({
        tenantId: "tenant-1",
        additionalServiceId: "service-1",
        supplierCost: 100,
        costCurrency: "USD",
      }),
    ).resolves.toEqual({
      supplierCost: 100,
      costCurrency: "USD",
      marginType: "PERCENTAGE",
      marginValue: 15,
      marginAmount: 15,
      subtotal: 115,
      vatPercentage: 13,
      vatAmount: 14.95,
      finalSellingPrice: 129.95,
    });
    expect(
      configurationReader.findForAdditionalService,
    ).toHaveBeenCalledWith("tenant-1", "service-1");
  });

  it("calculates a fixed margin and rounds monetary values", async () => {
    configurationReader.findForAdditionalService.mockResolvedValue({
      marginType: "FIXED",
      marginValue: 10.555,
      vatPercentage: 13,
      isActive: true,
    });

    await expect(
      service.calculate({
        tenantId: "tenant-1",
        additionalServiceId: "service-1",
        supplierCost: 99.999,
        costCurrency: "CRC",
      }),
    ).resolves.toEqual({
      supplierCost: 100,
      costCurrency: "CRC",
      marginType: "FIXED",
      marginValue: 10.555,
      marginAmount: 10.56,
      subtotal: 110.56,
      vatPercentage: 13,
      vatAmount: 14.37,
      finalSellingPrice: 124.93,
    });
  });

  it("fails when pricing configuration is missing", async () => {
    configurationReader.findForAdditionalService.mockResolvedValue(null);

    await expect(
      service.calculate({
        tenantId: "tenant-1",
        additionalServiceId: "service-1",
        supplierCost: 100,
        costCurrency: "USD",
      }),
    ).rejects.toBeInstanceOf(PricingConfigurationMissingError);
  });

  it("fails when pricing configuration is inactive", async () => {
    configurationReader.findForAdditionalService.mockResolvedValue({
      marginType: "FIXED",
      marginValue: 10,
      vatPercentage: 13,
      isActive: false,
    });

    await expect(
      service.calculate({
        tenantId: "tenant-1",
        additionalServiceId: "service-1",
        supplierCost: 100,
        costCurrency: "USD",
      }),
    ).rejects.toBeInstanceOf(PricingConfigurationMissingError);
  });

  it("rejects invalid costs before loading configuration", async () => {
    await expect(
      service.calculate({
        tenantId: "tenant-1",
        additionalServiceId: "service-1",
        supplierCost: -1,
        costCurrency: "USD",
      }),
    ).rejects.toBeInstanceOf(InvalidPricingInputError);
    expect(
      configurationReader.findForAdditionalService,
    ).not.toHaveBeenCalled();
  });
});

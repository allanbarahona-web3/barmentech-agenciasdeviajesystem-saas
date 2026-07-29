import {
  PRICING_CONFIGURATION_READER,
  PricingConfigurationReader,
} from "./pricing-configuration-reader.interface";
import {
  ExchangeRateMissingError,
  InvalidPricingInputError,
  PricingConfigurationMissingError,
} from "./pricing-engine.errors";
import { PricingEngineService } from "./pricing-engine.service";
import { ExchangeRateReader } from "./exchange-rate-reader.interface";

describe("PricingEngineService", () => {
  let configurationReader: jest.Mocked<PricingConfigurationReader>;
  let service: PricingEngineService;
  let exchangeRateReader: jest.Mocked<ExchangeRateReader>;

  beforeEach(() => {
    configurationReader = {
      findForAdditionalService: jest.fn(),
    };
    exchangeRateReader = {
      findCurrent: jest.fn(),
    };
    service = new PricingEngineService(
      configurationReader,
      exchangeRateReader,
    );
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
        quotationCurrency: "USD",
      }),
    ).resolves.toEqual({
      supplierCost: 100,
      costCurrency: "USD",
      quotationCurrency: "USD",
      supplierCostInQuotationCurrency: 100,
      exchangeRateId: null,
      exchangeRateDate: null,
      exchangeRateSource: null,
      exchangeRateBuyRate: null,
      exchangeRateSellRate: null,
      exchangeRateType: null,
      appliedExchangeRate: 1,
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
        quotationCurrency: "CRC",
      }),
    ).resolves.toEqual({
      supplierCost: 100,
      costCurrency: "CRC",
      quotationCurrency: "CRC",
      supplierCostInQuotationCurrency: 100,
      exchangeRateId: null,
      exchangeRateDate: null,
      exchangeRateSource: null,
      exchangeRateBuyRate: null,
      exchangeRateSellRate: null,
      exchangeRateType: null,
      appliedExchangeRate: 1,
      marginType: "FIXED",
      marginValue: 10.555,
      marginAmount: 10.56,
      subtotal: 110.56,
      vatPercentage: 13,
      vatAmount: 14.37,
      finalSellingPrice: 124.93,
    });
  });

  it("converts USD supplier cost to CRC using the current sell rate", async () => {
    const rateDate = new Date("2026-07-28T00:00:00.000Z");
    configurationReader.findForAdditionalService.mockResolvedValue({
      marginType: "PERCENTAGE",
      marginValue: 10,
      vatPercentage: 13,
      isActive: true,
    });
    exchangeRateReader.findCurrent.mockResolvedValue({
      id: "rate-1",
      date: rateDate,
      buyRate: 515,
      sellRate: 520,
      source: "MANUAL",
    });

    await expect(
      service.calculate({
        tenantId: "tenant-1",
        additionalServiceId: "service-1",
        supplierCost: 100,
        costCurrency: "USD",
        quotationCurrency: "CRC",
      }),
    ).resolves.toEqual({
      supplierCost: 100,
      costCurrency: "USD",
      quotationCurrency: "CRC",
      supplierCostInQuotationCurrency: 52000,
      exchangeRateId: "rate-1",
      exchangeRateDate: rateDate,
      exchangeRateSource: "MANUAL",
      exchangeRateBuyRate: 515,
      exchangeRateSellRate: 520,
      exchangeRateType: "SELL",
      appliedExchangeRate: 520,
      marginType: "PERCENTAGE",
      marginValue: 10,
      marginAmount: 5200,
      subtotal: 57200,
      vatPercentage: 13,
      vatAmount: 7436,
      finalSellingPrice: 64636,
    });
  });

  it("converts CRC supplier cost to USD using the reciprocal sell rate", async () => {
    const rateDate = new Date("2026-07-28T00:00:00.000Z");
    configurationReader.findForAdditionalService.mockResolvedValue({
      marginType: "FIXED",
      marginValue: 10,
      vatPercentage: 13,
      isActive: true,
    });
    exchangeRateReader.findCurrent.mockResolvedValue({
      id: "rate-1",
      date: rateDate,
      buyRate: 495,
      sellRate: 500,
      source: "MANUAL",
    });

    await expect(
      service.calculate({
        tenantId: "tenant-1",
        additionalServiceId: "service-1",
        supplierCost: 50000,
        costCurrency: "CRC",
        quotationCurrency: "USD",
      }),
    ).resolves.toEqual({
      supplierCost: 50000,
      costCurrency: "CRC",
      quotationCurrency: "USD",
      supplierCostInQuotationCurrency: 100,
      exchangeRateId: "rate-1",
      exchangeRateDate: rateDate,
      exchangeRateSource: "MANUAL",
      exchangeRateBuyRate: 495,
      exchangeRateSellRate: 500,
      exchangeRateType: "SELL",
      appliedExchangeRate: 0.002,
      marginType: "FIXED",
      marginValue: 10,
      marginAmount: 10,
      subtotal: 110,
      vatPercentage: 13,
      vatAmount: 14.3,
      finalSellingPrice: 124.3,
    });
  });

  it("fails cross-currency pricing when the current rate is missing", async () => {
    configurationReader.findForAdditionalService.mockResolvedValue({
      marginType: "PERCENTAGE",
      marginValue: 10,
      vatPercentage: 13,
      isActive: true,
    });
    exchangeRateReader.findCurrent.mockResolvedValue(null);

    await expect(
      service.calculate({
        tenantId: "tenant-1",
        additionalServiceId: "service-1",
        supplierCost: 100,
        costCurrency: "USD",
        quotationCurrency: "CRC",
      }),
    ).rejects.toBeInstanceOf(ExchangeRateMissingError);
  });

  it("fails when pricing configuration is missing", async () => {
    configurationReader.findForAdditionalService.mockResolvedValue(null);

    await expect(
      service.calculate({
        tenantId: "tenant-1",
        additionalServiceId: "service-1",
        supplierCost: 100,
        costCurrency: "USD",
        quotationCurrency: "USD",
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
        quotationCurrency: "USD",
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
        quotationCurrency: "USD",
      }),
    ).rejects.toBeInstanceOf(InvalidPricingInputError);
    expect(
      configurationReader.findForAdditionalService,
    ).not.toHaveBeenCalled();
  });
});

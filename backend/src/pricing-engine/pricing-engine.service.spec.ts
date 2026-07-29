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
      findForAdditionalServices: jest.fn(),
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

  it("converts a fixed USD margin to CRC using the applied sell rate", async () => {
    const rateDate = new Date("2026-07-28T00:00:00.000Z");
    configurationReader.findForAdditionalService.mockResolvedValue({
      marginType: "FIXED",
      marginValue: 15,
      vatPercentage: 0,
      isActive: true,
    });
    exchangeRateReader.findCurrent.mockResolvedValue({
      id: "rate-1",
      date: rateDate,
      buyRate: 535,
      sellRate: 540,
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
      supplierCostInQuotationCurrency: 54000,
      exchangeRateId: "rate-1",
      exchangeRateDate: rateDate,
      exchangeRateSource: "MANUAL",
      exchangeRateBuyRate: 535,
      exchangeRateSellRate: 540,
      exchangeRateType: "SELL",
      appliedExchangeRate: 540,
      marginType: "FIXED",
      marginValue: 15,
      marginAmount: 8100,
      subtotal: 62100,
      vatPercentage: 0,
      vatAmount: 0,
      finalSellingPrice: 62100,
    });
  });

  it("uses the sell rate for a fixed margin on a CRC quotation when supplier cost is already CRC", async () => {
    const rateDate = new Date("2026-07-28T00:00:00.000Z");
    configurationReader.findForAdditionalService.mockResolvedValue({
      marginType: "FIXED",
      marginValue: 15,
      vatPercentage: 0,
      isActive: true,
    });
    exchangeRateReader.findCurrent.mockResolvedValue({
      id: "rate-1",
      date: rateDate,
      buyRate: 505,
      sellRate: 510,
      source: "MANUAL",
    });

    await expect(
      service.calculate({
        tenantId: "tenant-1",
        additionalServiceId: "service-1",
        supplierCost: 54000,
        costCurrency: "CRC",
        quotationCurrency: "CRC",
      }),
    ).resolves.toEqual({
      supplierCost: 54000,
      costCurrency: "CRC",
      quotationCurrency: "CRC",
      supplierCostInQuotationCurrency: 54000,
      exchangeRateId: "rate-1",
      exchangeRateDate: rateDate,
      exchangeRateSource: "MANUAL",
      exchangeRateBuyRate: 505,
      exchangeRateSellRate: 510,
      exchangeRateType: "SELL",
      appliedExchangeRate: 1,
      marginType: "FIXED",
      marginValue: 15,
      marginAmount: 7650,
      subtotal: 61650,
      vatPercentage: 0,
      vatAmount: 0,
      finalSellingPrice: 61650,
    });
  });

  it("batch calculates mixed currencies with one configuration read and one exchange-rate read", async () => {
    const rateDate = new Date("2026-07-28T00:00:00.000Z");
    configurationReader.findForAdditionalServices.mockResolvedValue(
      new Map([
        [
          "service-1",
          {
            marginType: "PERCENTAGE",
            marginValue: 10,
            vatPercentage: 13,
            isActive: true,
          },
        ],
        [
          "service-2",
          {
            marginType: "FIXED",
            marginValue: 15,
            vatPercentage: 13,
            isActive: true,
          },
        ],
      ]),
    );
    exchangeRateReader.findCurrent.mockResolvedValue({
      id: "rate-1",
      date: rateDate,
      buyRate: 505,
      sellRate: 510,
      source: "MANUAL",
    });

    const results = await service.calculateMany([
      {
        tenantId: "tenant-1",
        additionalServiceId: "service-1",
        supplierCost: 100,
        costCurrency: "USD",
        quotationCurrency: "CRC",
      },
      {
        tenantId: "tenant-1",
        additionalServiceId: "service-2",
        supplierCost: 10000,
        costCurrency: "CRC",
        quotationCurrency: "CRC",
      },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      supplierCostInQuotationCurrency: 51000,
      marginAmount: 5100,
      exchangeRateSellRate: 510,
    });
    expect(results[1]).toMatchObject({
      supplierCostInQuotationCurrency: 10000,
      marginAmount: 7650,
      exchangeRateSellRate: 510,
    });
    expect(
      configurationReader.findForAdditionalServices,
    ).toHaveBeenCalledTimes(1);
    expect(exchangeRateReader.findCurrent).toHaveBeenCalledTimes(1);
    expect(
      configurationReader.findForAdditionalService,
    ).not.toHaveBeenCalled();
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

import { Inject, Injectable } from "@nestjs/common";
import {
  PRICING_CONFIGURATION_READER,
  PricingConfigurationReader,
} from "./pricing-configuration-reader.interface";
import {
  EXCHANGE_RATE_READER,
  ExchangeRateReader,
} from "./exchange-rate-reader.interface";
import {
  ExchangeRateMissingError,
  InvalidPricingInputError,
  PricingConfigurationMissingError,
} from "./pricing-engine.errors";
import {
  PricingBreakdown,
  PricingCalculationInput,
} from "./pricing-engine.types";

@Injectable()
export class PricingEngineService {
  private static readonly ADDITIONAL_SERVICE_EXCHANGE_RATE_TYPE =
    "SELL" as const;

  constructor(
    @Inject(PRICING_CONFIGURATION_READER)
    private readonly configurationReader: PricingConfigurationReader,
    @Inject(EXCHANGE_RATE_READER)
    private readonly exchangeRateReader: ExchangeRateReader,
  ) {}

  async calculate(
    input: PricingCalculationInput,
  ): Promise<PricingBreakdown> {
    this.validateInput(input);

    const configuration =
      await this.configurationReader.findForAdditionalService(
        input.tenantId,
        input.additionalServiceId,
      );

    if (!configuration?.isActive) {
      throw new PricingConfigurationMissingError(
        input.additionalServiceId,
      );
    }

    const supplierCost = this.roundMoney(input.supplierCost);
    const conversion = await this.convertSupplierCost(
      input.tenantId,
      supplierCost,
      input.costCurrency,
      input.quotationCurrency,
    );
    const marginValue = configuration.marginValue;
    const marginAmount = this.roundMoney(
      configuration.marginType === "PERCENTAGE"
        ? conversion.amount * (marginValue / 100)
        : marginValue,
    );
    const subtotal = this.roundMoney(conversion.amount + marginAmount);
    const vatAmount = this.roundMoney(
      subtotal * (configuration.vatPercentage / 100),
    );
    const finalSellingPrice = this.roundMoney(subtotal + vatAmount);

    return {
      supplierCost,
      costCurrency: input.costCurrency,
      quotationCurrency: input.quotationCurrency,
      supplierCostInQuotationCurrency: conversion.amount,
      exchangeRateId: conversion.exchangeRateId,
      exchangeRateDate: conversion.exchangeRateDate,
      exchangeRateSource: conversion.exchangeRateSource,
      exchangeRateBuyRate: conversion.exchangeRateBuyRate,
      exchangeRateSellRate: conversion.exchangeRateSellRate,
      exchangeRateType: conversion.exchangeRateType,
      appliedExchangeRate: conversion.appliedExchangeRate,
      marginType: configuration.marginType,
      marginValue,
      marginAmount,
      subtotal,
      vatPercentage: configuration.vatPercentage,
      vatAmount,
      finalSellingPrice,
    };
  }

  private validateInput(input: PricingCalculationInput): void {
    if (!input.tenantId.trim()) {
      throw new InvalidPricingInputError("Tenant ID is required.");
    }
    if (!input.additionalServiceId.trim()) {
      throw new InvalidPricingInputError(
        "Additional service ID is required.",
      );
    }
    if (!Number.isFinite(input.supplierCost) || input.supplierCost < 0) {
      throw new InvalidPricingInputError(
        "Supplier cost must be a finite non-negative number.",
      );
    }
    if (input.costCurrency !== "USD" && input.costCurrency !== "CRC") {
      throw new InvalidPricingInputError(
        "Cost currency must be USD or CRC.",
      );
    }
    if (
      input.quotationCurrency !== "USD" &&
      input.quotationCurrency !== "CRC"
    ) {
      throw new InvalidPricingInputError(
        "Quotation currency must be USD or CRC.",
      );
    }
  }

  private async convertSupplierCost(
    tenantId: string,
    supplierCost: number,
    costCurrency: "USD" | "CRC",
    quotationCurrency: "USD" | "CRC",
  ) {
    if (costCurrency === quotationCurrency) {
      return {
        amount: supplierCost,
        exchangeRateId: null,
        exchangeRateDate: null,
        exchangeRateSource: null,
        exchangeRateBuyRate: null,
        exchangeRateSellRate: null,
        exchangeRateType: null,
        appliedExchangeRate: 1,
      };
    }

    const exchangeRate =
      await this.exchangeRateReader.findCurrent(tenantId);
    if (!exchangeRate || exchangeRate.sellRate <= 0) {
      throw new ExchangeRateMissingError(tenantId);
    }

    // Additional Service quotations always use the configured SELL rate:
    // the agency must purchase the supplier's foreign currency to fulfill
    // the service after receiving payment in the quotation currency.
    const appliedExchangeRate =
      costCurrency === "USD"
        ? exchangeRate.sellRate
        : 1 / exchangeRate.sellRate;
    const amount = this.roundMoney(
      supplierCost * appliedExchangeRate,
    );

    return {
      amount,
      exchangeRateId: exchangeRate.id,
      exchangeRateDate: exchangeRate.date,
      exchangeRateSource: exchangeRate.source,
      exchangeRateBuyRate: exchangeRate.buyRate,
      exchangeRateSellRate: exchangeRate.sellRate,
      exchangeRateType:
        PricingEngineService.ADDITIONAL_SERVICE_EXCHANGE_RATE_TYPE,
      appliedExchangeRate,
    };
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}

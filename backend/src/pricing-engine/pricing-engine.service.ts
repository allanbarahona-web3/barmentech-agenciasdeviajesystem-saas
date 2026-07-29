import { Inject, Injectable } from "@nestjs/common";
import {
  PRICING_CONFIGURATION_READER,
  PricingConfigurationReader,
} from "./pricing-configuration-reader.interface";
import {
  CurrentExchangeRate,
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
  PricingConfiguration,
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

    const exchangeRate = this.requiresExchangeRate(input, configuration)
      ? await this.getCurrentExchangeRate(input.tenantId)
      : null;

    return this.calculateResolved(input, configuration, exchangeRate);
  }

  async calculateMany(
    inputs: PricingCalculationInput[],
  ): Promise<PricingBreakdown[]> {
    if (inputs.length === 0) {
      return [];
    }

    inputs.forEach((input) => this.validateInput(input));
    const tenantId = inputs[0].tenantId;
    if (inputs.some((input) => input.tenantId !== tenantId)) {
      throw new InvalidPricingInputError(
        "All pricing inputs must belong to the same tenant.",
      );
    }

    const configurations =
      await this.configurationReader.findForAdditionalServices(
        tenantId,
        [...new Set(inputs.map((input) => input.additionalServiceId))],
      );
    const resolved = inputs.map((input) => {
      const configuration = configurations.get(input.additionalServiceId);
      if (!configuration?.isActive) {
        throw new PricingConfigurationMissingError(
          input.additionalServiceId,
        );
      }
      return { input, configuration };
    });
    const exchangeRate = resolved.some(({ input, configuration }) =>
      this.requiresExchangeRate(input, configuration),
    )
      ? await this.getCurrentExchangeRate(tenantId)
      : null;

    return resolved.map(({ input, configuration }) =>
      this.calculateResolved(input, configuration, exchangeRate),
    );
  }

  private calculateResolved(
    input: PricingCalculationInput,
    configuration: PricingConfiguration,
    exchangeRate: CurrentExchangeRate | null,
  ): PricingBreakdown {
    const supplierCost = this.roundMoney(input.supplierCost);
    let conversion = this.convertSupplierCost(
      input.tenantId,
      supplierCost,
      input.costCurrency,
      input.quotationCurrency,
      exchangeRate,
    );
    const marginValue = configuration.marginValue;

    if (
      configuration.marginType === "FIXED" &&
      input.quotationCurrency === "CRC" &&
      conversion.exchangeRateSellRate === null
    ) {
      if (!exchangeRate) {
        throw new ExchangeRateMissingError(input.tenantId);
      }
      conversion = {
        ...conversion,
        exchangeRateId: exchangeRate.id,
        exchangeRateDate: exchangeRate.date,
        exchangeRateSource: exchangeRate.source,
        exchangeRateBuyRate: exchangeRate.buyRate,
        exchangeRateSellRate: exchangeRate.sellRate,
        exchangeRateType:
          PricingEngineService.ADDITIONAL_SERVICE_EXCHANGE_RATE_TYPE,
      };
    }

    const marginAmount = this.roundMoney(
      configuration.marginType === "PERCENTAGE"
        ? conversion.amount * (marginValue / 100)
        : marginValue *
          (input.quotationCurrency === "CRC"
            ? conversion.exchangeRateSellRate!
            : 1),
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

  private requiresExchangeRate(
    input: PricingCalculationInput,
    configuration: {
      marginType: "FIXED" | "PERCENTAGE";
    },
  ): boolean {
    return (
      input.costCurrency !== input.quotationCurrency ||
      (configuration.marginType === "FIXED" &&
        input.quotationCurrency === "CRC")
    );
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

  private convertSupplierCost(
    tenantId: string,
    supplierCost: number,
    costCurrency: "USD" | "CRC",
    quotationCurrency: "USD" | "CRC",
    exchangeRate: CurrentExchangeRate | null,
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

    if (!exchangeRate) {
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

  private async getCurrentExchangeRate(tenantId: string) {
    const exchangeRate =
      await this.exchangeRateReader.findCurrent(tenantId);
    if (!exchangeRate || exchangeRate.sellRate <= 0) {
      throw new ExchangeRateMissingError(tenantId);
    }

    return exchangeRate;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}

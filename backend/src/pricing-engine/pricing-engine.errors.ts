export class PricingConfigurationMissingError extends Error {
  readonly code = "PRICING_CONFIGURATION_MISSING";

  constructor(additionalServiceId: string) {
    super(
      `Pricing configuration is missing or inactive for additional service ${additionalServiceId}.`,
    );
    this.name = "PricingConfigurationMissingError";
  }
}

export class InvalidPricingInputError extends Error {
  readonly code = "INVALID_PRICING_INPUT";

  constructor(message: string) {
    super(message);
    this.name = "InvalidPricingInputError";
  }
}

export class ExchangeRateMissingError extends Error {
  readonly code = "EXCHANGE_RATE_MISSING";

  constructor(tenantId: string) {
    super(`Current exchange rate is missing for tenant ${tenantId}.`);
    this.name = "ExchangeRateMissingError";
  }
}

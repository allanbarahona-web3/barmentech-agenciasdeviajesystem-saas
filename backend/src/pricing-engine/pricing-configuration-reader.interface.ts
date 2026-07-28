import { PricingConfiguration } from "./pricing-engine.types";

export const PRICING_CONFIGURATION_READER = Symbol(
  "PRICING_CONFIGURATION_READER",
);

export interface PricingConfigurationReader {
  findForAdditionalService(
    tenantId: string,
    additionalServiceId: string,
  ): Promise<PricingConfiguration | null>;
}

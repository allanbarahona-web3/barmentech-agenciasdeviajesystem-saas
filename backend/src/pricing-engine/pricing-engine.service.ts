import { Inject, Injectable } from "@nestjs/common";
import {
  PRICING_CONFIGURATION_READER,
  PricingConfigurationReader,
} from "./pricing-configuration-reader.interface";
import {
  InvalidPricingInputError,
  PricingConfigurationMissingError,
} from "./pricing-engine.errors";
import {
  PricingBreakdown,
  PricingCalculationInput,
} from "./pricing-engine.types";

@Injectable()
export class PricingEngineService {
  constructor(
    @Inject(PRICING_CONFIGURATION_READER)
    private readonly configurationReader: PricingConfigurationReader,
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
    const marginValue = configuration.marginValue;
    const marginAmount = this.roundMoney(
      configuration.marginType === "PERCENTAGE"
        ? supplierCost * (marginValue / 100)
        : marginValue,
    );
    const subtotal = this.roundMoney(supplierCost + marginAmount);
    const vatAmount = this.roundMoney(
      subtotal * (configuration.vatPercentage / 100),
    );
    const finalSellingPrice = this.roundMoney(subtotal + vatAmount);

    return {
      supplierCost,
      costCurrency: input.costCurrency,
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
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}

export type PricingCurrency = "USD" | "CRC";
export type PricingMarginType = "FIXED" | "PERCENTAGE";

export interface PricingCalculationInput {
  tenantId: string;
  additionalServiceId: string;
  supplierCost: number;
  costCurrency: PricingCurrency;
}

export interface PricingBreakdown {
  supplierCost: number;
  costCurrency: PricingCurrency;
  marginType: PricingMarginType;
  marginValue: number;
  marginAmount: number;
  subtotal: number;
  vatPercentage: number;
  vatAmount: number;
  finalSellingPrice: number;
}

export interface PricingConfiguration {
  marginType: PricingMarginType;
  marginValue: number;
  vatPercentage: number;
  isActive: boolean;
}

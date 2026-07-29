export type PricingCurrency = "USD" | "CRC";
export type PricingMarginType = "FIXED" | "PERCENTAGE";
export type PricingExchangeRateType = "SELL";

export interface PricingCalculationInput {
  tenantId: string;
  additionalServiceId: string;
  supplierCost: number;
  costCurrency: PricingCurrency;
  quotationCurrency: PricingCurrency;
}

export interface PricingBreakdown {
  supplierCost: number;
  costCurrency: PricingCurrency;
  quotationCurrency: PricingCurrency;
  supplierCostInQuotationCurrency: number;
  exchangeRateId: string | null;
  exchangeRateDate: Date | null;
  exchangeRateSource: string | null;
  exchangeRateBuyRate: number | null;
  exchangeRateSellRate: number | null;
  exchangeRateType: PricingExchangeRateType | null;
  appliedExchangeRate: number;
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

import { apiPost } from '@/lib/api-client';

export type AdditionalServicePricingCurrency = 'USD' | 'CRC';

export interface CalculateAdditionalServicePriceInput {
  serviceCode: string;
  supplierCost: number | null;
  costCurrency: AdditionalServicePricingCurrency | null;
  quotationCurrency: AdditionalServicePricingCurrency;
}

export interface AdditionalServicePricingBreakdown {
  supplierCost: number;
  costCurrency: AdditionalServicePricingCurrency;
  quotationCurrency: AdditionalServicePricingCurrency;
  supplierCostInQuotationCurrency: number;
  marginType: 'FIXED' | 'PERCENTAGE';
  marginValue: number;
  marginAmount: number;
  subtotal: number;
  vatPercentage: number;
  vatAmount: number;
  finalSellingPrice: number;
}

export function calculateAdditionalServicePrice(
  input: CalculateAdditionalServicePriceInput,
): Promise<AdditionalServicePricingBreakdown> {
  return apiPost<AdditionalServicePricingBreakdown>(
    '/additional-services/pricing/calculate',
    input,
  );
}

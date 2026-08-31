import { apiPost, fetchApi } from '@/lib/api-client';

export class AdditionalServicePricingApiError extends Error {
  constructor(public readonly code: string | null) {
    super('No se pudieron calcular los precios.');
    this.name = 'AdditionalServicePricingApiError';
  }
}

export type AdditionalServicePricingCurrency = 'USD' | 'CRC';

export interface CalculateAdditionalServicePriceInput {
  serviceCode: string;
  supplierCost: number | null;
  costCurrency: AdditionalServicePricingCurrency | null;
  quotationCurrency: AdditionalServicePricingCurrency;
}

export interface CalculateAdditionalServicePriceBatchLineInput
  extends CalculateAdditionalServicePriceInput {
  lineId: string;
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

export function calculateAdditionalServicePrices(
  lines: CalculateAdditionalServicePriceBatchLineInput[],
): Promise<Array<{ lineId: string; breakdown: AdditionalServicePricingBreakdown }>> {
  return fetchApi('/additional-services/pricing/calculate-many', {
    method: 'POST',
    body: JSON.stringify({ lines }),
  }).then(async (response) => {
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const code = payload && typeof payload === 'object'
        ? (payload as { code?: unknown }).code
        : null;
      throw new AdditionalServicePricingApiError(
        typeof code === 'string' ? code : null,
      );
    }
    return response.json();
  });
}

import { apiPost } from '@/lib/api-client';
import type {
  TemporaryAdditionalServiceLine,
  TemporaryLineCurrency,
} from '@/lib/additional-services-temporary-store';

export interface CreateAdditionalServiceOrderLineInput {
  serviceCode: TemporaryAdditionalServiceLine['serviceType'];
  supplierId: string;
  supplierCostUrl?: string;
  supplierCost: number;
  supplierCostCurrency: TemporaryLineCurrency;
  commercialNotes?: string;
  participantIds: string[];
}

export interface CreateAdditionalServiceOrderInput {
  idempotencyKey: string;
  travelId: string;
  travelType: 'INTERNATIONAL' | 'INTERNAL';
  quotationCurrency: TemporaryLineCurrency;
  lines: CreateAdditionalServiceOrderLineInput[];
}

export interface CreateAdditionalServiceOrderResponse {
  orderId: string;
  status: 'DRAFT';
}

export function createAdditionalServiceOrder(
  input: CreateAdditionalServiceOrderInput,
): Promise<CreateAdditionalServiceOrderResponse> {
  return apiPost<CreateAdditionalServiceOrderResponse>(
    '/additional-services/orders',
    input,
  );
}

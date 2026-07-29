import { apiGet, apiPost } from '@/lib/api-client';
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

export type AdditionalServiceOrderParticipantRole =
  | 'HOLDER'
  | 'COMPANION'
  | 'MINOR';

export type AdditionalServiceOrderCurrency = 'USD' | 'CRC';

export interface AdditionalServiceOrderParticipant {
  clientId: string | null;
  role: AdditionalServiceOrderParticipantRole;
  fullName: string;
  identification: string;
  email: string | null;
  phone: string | null;
}

export interface AdditionalServiceOrderTravel {
  type: 'TRAVEL_PACKAGE' | 'INTERNAL_TRIP';
  id: string;
  code: string;
  name: string;
  destination: string;
  departureDate: string;
  returnDate: string;
}

export interface AdditionalServiceOrderLine {
  id: string;
  serviceCode: string;
  serviceName: string;
  supplierId: string;
  supplierName: string;
  supplierCostUrl: string | null;
  supplierCost: string;
  supplierCostCurrency: AdditionalServiceOrderCurrency;
  quotationCurrency: AdditionalServiceOrderCurrency;
  supplierCostInQuotationCurrency: string;
  marginType: 'PERCENTAGE' | 'FIXED';
  marginValue: string;
  marginAmount: string;
  subtotal: string;
  vatPercentage: string;
  vatAmount: string;
  finalSellingPrice: string;
  commercialNotes: string | null;
  participants: AdditionalServiceOrderParticipant[];
}

export interface AdditionalServiceOrder {
  id: string;
  orderNumber: string;
  travelPackageId: string | null;
  internalBookingId: string | null;
  travelType: 'INTERNATIONAL' | 'INTERNAL';
  quotationCurrency: AdditionalServiceOrderCurrency;
  commercialSubtotal: string;
  totalVat: string;
  totalSellingPrice: string;
  travel: AdditionalServiceOrderTravel | null;
  status: 'DRAFT';
  lines: AdditionalServiceOrderLine[];
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export function createAdditionalServiceOrder(
  input: CreateAdditionalServiceOrderInput,
): Promise<CreateAdditionalServiceOrderResponse> {
  return apiPost<CreateAdditionalServiceOrderResponse>(
    '/additional-services/orders',
    input,
  );
}

export function getAdditionalServiceOrder(
  orderId: string,
): Promise<AdditionalServiceOrder> {
  return apiGet<AdditionalServiceOrder>(
    `/additional-services/orders/${encodeURIComponent(orderId)}`,
  );
}

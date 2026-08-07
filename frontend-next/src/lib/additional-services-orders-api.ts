import { apiGet, apiPost, fetchApi } from '@/lib/api-client';
import type {
  BaggageType,
  BaggageTripScope,
  AccommodationType,
  FlightTripType,
  InsuranceCoverage,
  LodgingType,
  SeatPreference,
  TemporaryAdditionalServiceLine,
  TemporaryLineCurrency,
  TransportationType,
  VisaType,
} from '@/lib/additional-services-temporary-store';
import type { Airport } from '@/shared/airports';

export type AdditionalServiceDetails =
  | {
      baggageTypes: BaggageType[];
      tripScope: BaggageTripScope;
      pieceQuantity: number;
      weightKg: number;
    }
  | {
      lodgingType: LodgingType;
      checkInDate: string;
      checkOutDate: string;
    }
  | { accommodationType: AccommodationType }
  | {
      coverage: InsuranceCoverage;
      customCoverageAmount: number | null;
      currency: 'USD';
    }
  | {
      transportationType: TransportationType;
      tripType: FlightTripType;
      serviceDate: string;
      origin: string;
      destination: string;
    }
  | { tourName: string; serviceDate: string }
  | {
      tripType: FlightTripType;
      originAirport: Airport;
      destinationAirport: Airport;
      departureDate: string;
      returnDate: string | null;
      quantity: number;
    }
  | {
      seatPreference: SeatPreference;
      otherPreferenceDescription: string | null;
      quantity: number;
    }
  | {
      eventName: string;
      serviceDate: string;
      quantity: number;
      venueOrCity: string;
    }
  | { newReturnDate: string; quantity: number }
  | {
      destinationCountry: string;
      visaType: VisaType;
      expectedTravelDate: string | null;
    };

export interface CreateAdditionalServiceOrderLineInput {
  serviceCode: TemporaryAdditionalServiceLine['serviceType'];
  serviceDetailsVersion: 1;
  serviceDetails: AdditionalServiceDetails;
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
  quoteCustomerId: string;
  quotationCurrency: TemporaryLineCurrency;
  paymentConditionType?: AdditionalServicePaymentConditionType;
  paymentTermValue?: number;
  paymentTermUnit?: AdditionalServicePaymentTermUnit;
  quotationValidUntil?: string;
  commercialObservations?: string;
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
export type AdditionalServicePaymentConditionType =
  | 'CASH'
  | 'CREDIT';
export type AdditionalServicePaymentTermUnit = 'DAYS' | 'MONTHS';
export type AdditionalServiceOrderStatus =
  | 'DRAFT'
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'CANCELLED';
export type AdditionalServiceOrderTravelType = 'INTERNATIONAL' | 'INTERNAL';

export interface AdditionalServiceOrderDashboardItem {
  id: string;
  orderNumber: string;
  customerName: string | null;
  travelId: string | null;
  travelName: string | null;
  travelType: AdditionalServiceOrderTravelType;
  createdAt: string;
  totalAmount: string;
  currency: AdditionalServiceOrderCurrency;
  status: AdditionalServiceOrderStatus;
}

export interface AdditionalServiceOrdersDashboardResponse {
  orders: AdditionalServiceOrderDashboardItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ListAdditionalServiceOrdersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  travelNumber?: string;
  travelType?: AdditionalServiceOrderTravelType;
  createdFrom?: string;
  createdTo?: string;
  status?: AdditionalServiceOrderStatus;
}

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
  serviceDetailsVersion: number | null;
  serviceDetails: AdditionalServiceDetails | null;
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
  paymentConditionType: AdditionalServicePaymentConditionType | null;
  paymentTermValue: number | null;
  paymentTermUnit: AdditionalServicePaymentTermUnit | null;
  quotationValidUntil: string | null;
  commercialObservations: string | null;
  travel: AdditionalServiceOrderTravel | null;
  status: 'DRAFT';
  lines: AdditionalServiceOrderLine[];
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialProposalPreview {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  url: string;
  expiresInSeconds: number;
}

export function createAdditionalServiceOrder(
  input: CreateAdditionalServiceOrderInput,
): Promise<CreateAdditionalServiceOrderResponse> {
  return apiPost<CreateAdditionalServiceOrderResponse>(
    '/additional-services/orders',
    input,
  );
}

export function getAdditionalServiceOrders(
  params: ListAdditionalServiceOrdersParams,
  signal?: AbortSignal,
): Promise<AdditionalServiceOrdersDashboardResponse> {
  return apiGet<AdditionalServiceOrdersDashboardResponse>(
    '/additional-services/orders',
    {
      params: {
        ...(params.page ? { page: params.page } : {}),
        ...(params.pageSize ? { pageSize: params.pageSize } : {}),
        ...(params.search ? { search: params.search } : {}),
        ...(params.travelNumber
          ? { travelNumber: params.travelNumber }
          : {}),
        ...(params.travelType ? { travelType: params.travelType } : {}),
        ...(params.createdFrom ? { createdFrom: params.createdFrom } : {}),
        ...(params.createdTo ? { createdTo: params.createdTo } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      signal,
    },
  );
}

export function getAdditionalServiceOrder(
  orderId: string,
): Promise<AdditionalServiceOrder> {
  return apiGet<AdditionalServiceOrder>(
    `/additional-services/orders/${encodeURIComponent(orderId)}`,
  );
}

export async function getCommercialProposalPreview(
  orderId: string,
): Promise<CommercialProposalPreview | null> {
  const response = await fetchApi(
    `/additional-services/orders/${encodeURIComponent(orderId)}/commercial-proposal`,
    { method: 'GET' },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || `API Error: ${response.statusText}`,
    );
  }
  return response.json();
}

import { apiGet, apiPost } from '@/lib/api-client';
import type {
  BaggageType,
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

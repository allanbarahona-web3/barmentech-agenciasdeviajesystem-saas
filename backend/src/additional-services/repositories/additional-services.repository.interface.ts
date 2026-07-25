import {
  AdditionalServiceCurrency,
  AdditionalServiceMarginType,
  AdditionalServiceOrderStatus,
  AdditionalServiceType,
} from "../enums";

export interface AdditionalServiceOrderLineRecord {
  id: string;
  tenantId: string;
  orderId: string;
  serviceType: AdditionalServiceType;
  detail: string;
  notes: string;
  serviceDate: Date | null;
  quantity: number;
  currency: AdditionalServiceCurrency;
  exchangeRate: string;
  cost: string;
  salePrice: string;
  marginType: AdditionalServiceMarginType;
  marginValue: string;
  taxPercentage: string;
  taxAmount: string;
  subtotal: string;
  total: string;
  supplierName: string | null;
  sourceUrl: string | null;
  participants: AdditionalServiceOrderParticipantDetails[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AdditionalServiceOrderParticipantDetails {
  clientId: string;
  fullName: string;
}

export interface AdditionalServiceOrderTravelDetails {
  type: "TRAVEL_PACKAGE" | "INTERNAL_TRIP";
  id: string;
  code: string;
  name: string;
  destination: string;
  departureDate: Date;
  returnDate: Date;
}

export interface AdditionalServiceOrderRecord {
  id: string;
  tenantId: string;
  orderNumber: string;
  travelPackageId: string | null;
  internalTripId: string | null;
  travel: AdditionalServiceOrderTravelDetails | null;
  status: AdditionalServiceOrderStatus;
  lines: AdditionalServiceOrderLineRecord[];
  createdByUserId: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdditionalServiceTravelReference {
  travelPackageId?: string;
  internalTripId?: string;
}

export interface AdditionalServiceTenantRecord {
  id: string;
  contractPrefix: string;
}

export interface AdditionalServiceTravelRecord {
  id: string;
  tenantId: string;
}

export interface AdditionalServiceParticipantRecord {
  id: string;
  tenantId: string;
}

export interface CreateAdditionalServiceOrderLineData {
  serviceType: AdditionalServiceType;
  detail: string;
  notes: string;
  serviceDate?: Date;
  quantity: number;
  currency: AdditionalServiceCurrency;
  exchangeRate: number;
  cost: number;
  salePrice: number;
  marginType: AdditionalServiceMarginType;
  marginValue: number;
  taxPercentage: number;
  taxAmount: number;
  subtotal: number;
  total: number;
  supplierName?: string;
  sourceUrl?: string;
  participantClientIds: string[];
}

export interface CreateAdditionalServiceOrderData
  extends AdditionalServiceTravelReference {
  tenantId: string;
  orderNumber: string;
  createdByUserId: string;
  createdByName: string;
  lines: CreateAdditionalServiceOrderLineData[];
}

export interface AdditionalServicesRepository {
  executeInTransaction<T>(
    work: (repository: AdditionalServicesRepository) => Promise<T>,
  ): Promise<T>;

  findTenantById(
    tenantId: string,
  ): Promise<AdditionalServiceTenantRecord | null>;

  findTravelPackageById(
    id: string,
  ): Promise<AdditionalServiceTravelRecord | null>;

  findInternalTripById(
    id: string,
  ): Promise<AdditionalServiceTravelRecord | null>;

  findParticipantsByIds(
    ids: string[],
  ): Promise<AdditionalServiceParticipantRecord[]>;

  create(
    data: CreateAdditionalServiceOrderData,
  ): Promise<AdditionalServiceOrderRecord>;

  findById(
    tenantId: string,
    id: string,
  ): Promise<AdditionalServiceOrderRecord | null>;

  findByTravel(
    tenantId: string,
    travel: AdditionalServiceTravelReference,
  ): Promise<AdditionalServiceOrderRecord[]>;
}

export const ADDITIONAL_SERVICES_REPOSITORY =
  Symbol("ADDITIONAL_SERVICES_REPOSITORY");

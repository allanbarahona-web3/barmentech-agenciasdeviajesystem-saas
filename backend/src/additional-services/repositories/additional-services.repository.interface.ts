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
  participantClientIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AdditionalServiceOrderRecord {
  id: string;
  tenantId: string;
  orderNumber: string;
  travelPackageId: string | null;
  internalTripId: string | null;
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

export interface AdditionalServicesRepository {
  findById(
    tenantId: string,
    id: string,
  ): Promise<AdditionalServiceOrderRecord | null>;

  findByTravel(
    tenantId: string,
    travel: AdditionalServiceTravelReference,
  ): Promise<AdditionalServiceOrderRecord[]>;
}

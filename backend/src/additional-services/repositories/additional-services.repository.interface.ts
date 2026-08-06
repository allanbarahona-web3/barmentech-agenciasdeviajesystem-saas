import {
  AdditionalServiceCurrency,
  AdditionalServiceMarginType,
  AdditionalServiceOrderStatus,
  AdditionalServiceTravelType,
  PaymentConditionType,
  PaymentTermUnit,
} from "../enums";
import type { AdditionalServiceDetails } from "../service-details";

export interface AdditionalServiceOrderLineRecord {
  id: string;
  tenantId: string;
  orderId: string;
  additionalServiceCatalogId: string;
  serviceCode: string;
  serviceName: string;
  serviceDetailsVersion: number | null;
  serviceDetails: AdditionalServiceDetails | null;
  supplierId: string;
  supplierName: string;
  supplierCostUrl: string | null;
  supplierCost: string;
  supplierCostCurrency: AdditionalServiceCurrency;
  quotationCurrency: AdditionalServiceCurrency;
  supplierCostInQuotationCurrency: string;
  exchangeRateId: string | null;
  exchangeRateDate: Date | null;
  exchangeRateSource: string | null;
  exchangeRateBuyRate: string | null;
  exchangeRateSellRate: string | null;
  exchangeRateType: "SELL" | null;
  appliedExchangeRate: string;
  marginType: AdditionalServiceMarginType;
  marginValue: string;
  marginAmount: string;
  subtotal: string;
  vatPercentage: string;
  vatAmount: string;
  finalSellingPrice: string;
  commercialNotes: string | null;
  participants: AdditionalServiceOrderParticipantDetails[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AdditionalServiceOrderParticipantDetails {
  clientId: string | null;
  role: AdditionalServiceParticipantRole;
  fullName: string;
  identification: string;
  email: string | null;
  phone: string | null;
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
  idempotencyKey: string;
  quoteCustomerId: string | null;
  travelPackageId: string | null;
  internalBookingId: string | null;
  travelType: AdditionalServiceTravelType;
  quotationCurrency: AdditionalServiceCurrency;
  commercialSubtotal: string;
  totalVat: string;
  totalSellingPrice: string;
  paymentConditionType: PaymentConditionType | null;
  paymentTermValue: number | null;
  paymentTermUnit: PaymentTermUnit | null;
  quotationValidUntil: Date | null;
  commercialObservations: string | null;
  travel: AdditionalServiceOrderTravelDetails | null;
  status: AdditionalServiceOrderStatus;
  lines: AdditionalServiceOrderLineRecord[];
  createdByUserId: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdditionalServiceOrderDashboardQuery {
  page: number;
  pageSize: number;
  search?: string;
  travelId?: string;
  travelNumber?: string;
  travelType?: AdditionalServiceTravelType;
  createdFrom?: Date;
  createdTo?: Date;
  status?: AdditionalServiceOrderStatus;
}

export interface AdditionalServiceOrderDashboardItemRecord {
  id: string;
  orderNumber: string;
  customerName: string | null;
  travelId: string | null;
  travelName: string | null;
  travelType: AdditionalServiceTravelType;
  createdAt: Date;
  totalAmount: string;
  currency: AdditionalServiceCurrency;
  status: AdditionalServiceOrderStatus;
}

export interface AdditionalServiceOrderDashboardPageRecord {
  orders: AdditionalServiceOrderDashboardItemRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdditionalServiceTravelReference {
  travelPackageId?: string;
  internalBookingId?: string;
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
  fullName: string;
  idNumber: string;
  email: string | null;
  phone: string | null;
}

export type AdditionalServiceParticipantRole =
  | "HOLDER"
  | "COMPANION"
  | "MINOR";

export interface AdditionalServiceTravelParticipantRecord {
  clientId: string;
  role: AdditionalServiceParticipantRole;
}

export interface AdditionalServiceCatalogRecord {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface AdditionalServiceCatalogPricingRecord {
  id: string;
  marginType: AdditionalServiceMarginType;
  marginValue: string;
  taxPercentage: string;
  isActive: boolean;
}

export interface AdditionalServiceCatalogAdminRecord
  extends AdditionalServiceCatalogRecord {
  pricingConfiguration: AdditionalServiceCatalogPricingRecord | null;
}

export interface CreateAdditionalServiceCatalogItemData {
  code: string;
  name: string;
  displayOrder: number;
}

export interface AdditionalServicePricingConfigurationRecord {
  id: string;
  tenantId: string;
  additionalServiceCatalogId: string;
  marginType: AdditionalServiceMarginType;
  marginValue: string;
  taxPercentage: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  additionalServiceCatalog: AdditionalServiceCatalogRecord;
}

export interface AdditionalServicePricingConfigurationFilters {
  additionalServiceCatalogId?: string;
  isActive?: boolean;
}

export interface CreateAdditionalServicePricingConfigurationData {
  tenantId: string;
  additionalServiceCatalogId: string;
  marginType: AdditionalServiceMarginType;
  marginValue: number;
  taxPercentage: number;
  isActive: boolean;
}

export interface UpdateAdditionalServicePricingConfigurationData {
  marginType?: AdditionalServiceMarginType;
  marginValue?: number;
  taxPercentage?: number;
  isActive?: boolean;
}

export interface SupplierRecord {
  id: string;
  tenantId: string;
  name: string;
  website: string | null;
  supplierType: string | null;
  supplierCategory: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSupplierData {
  tenantId: string;
  name: string;
  website: string | null;
  supplierType: string | null;
  supplierCategory: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface UpdateSupplierData {
  name?: string;
  website?: string | null;
  supplierType?: string | null;
  supplierCategory?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export interface CreateAdditionalServiceOrderLineData {
  additionalServiceCatalogId: string;
  serviceCode: string;
  serviceName: string;
  serviceDetailsVersion: number;
  serviceDetails: AdditionalServiceDetails;
  supplierId: string;
  supplierName: string;
  supplierCostUrl?: string;
  supplierCost: number;
  supplierCostCurrency: AdditionalServiceCurrency;
  quotationCurrency: AdditionalServiceCurrency;
  supplierCostInQuotationCurrency: number;
  exchangeRateId: string | null;
  exchangeRateDate: Date | null;
  exchangeRateSource: string | null;
  exchangeRateBuyRate: number | null;
  exchangeRateSellRate: number | null;
  exchangeRateType: "SELL" | null;
  appliedExchangeRate: number;
  marginType: AdditionalServiceMarginType;
  marginValue: number;
  marginAmount: number;
  subtotal: number;
  vatPercentage: number;
  vatAmount: number;
  finalSellingPrice: number;
  commercialNotes?: string;
  participants: Array<{
    clientId: string;
    role: AdditionalServiceParticipantRole;
    fullName: string;
    identification: string;
    email: string | null;
    phone: string | null;
  }>;
}

export interface CreateAdditionalServiceOrderData
  extends AdditionalServiceTravelReference {
  tenantId: string;
  orderNumber: string;
  idempotencyKey: string;
  quoteCustomerId: string;
  createdByUserId: string;
  createdByName: string;
  travelType: AdditionalServiceTravelType;
  quotationCurrency: AdditionalServiceCurrency;
  commercialSubtotal: number;
  totalVat: number;
  totalSellingPrice: number;
  paymentConditionType: PaymentConditionType | null;
  paymentTermValue: number | null;
  paymentTermUnit: PaymentTermUnit | null;
  quotationValidUntil: Date | null;
  commercialObservations: string | null;
  lines: CreateAdditionalServiceOrderLineData[];
}

export interface AdditionalServicesRepository {
  executeInTransaction<T>(
    work: (repository: AdditionalServicesRepository) => Promise<T>,
  ): Promise<T>;

  findTenantById(
    tenantId: string,
  ): Promise<AdditionalServiceTenantRecord | null>;

  findAllTenantIds(): Promise<string[]>;

  findTravelPackageById(
    id: string,
  ): Promise<AdditionalServiceTravelRecord | null>;

  findInternalBookingById(
    id: string,
  ): Promise<AdditionalServiceTravelRecord | null>;

  findParticipantsByIds(
    ids: string[],
  ): Promise<AdditionalServiceParticipantRecord[]>;

  findTravelParticipants(
    tenantId: string,
    travel: AdditionalServiceTravelReference,
  ): Promise<AdditionalServiceTravelParticipantRecord[]>;

  create(
    data: CreateAdditionalServiceOrderData,
  ): Promise<AdditionalServiceOrderRecord>;

  findById(
    tenantId: string,
    id: string,
  ): Promise<AdditionalServiceOrderRecord | null>;

  findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<AdditionalServiceOrderRecord | null>;

  findByTravel(
    tenantId: string,
    travel: AdditionalServiceTravelReference,
  ): Promise<AdditionalServiceOrderRecord[]>;

  findOrderDashboardPage(
    tenantId: string,
    query: AdditionalServiceOrderDashboardQuery,
  ): Promise<AdditionalServiceOrderDashboardPageRecord>;

  findAdditionalServiceCatalogById(
    id: string,
  ): Promise<AdditionalServiceCatalogRecord | null>;

  findAdditionalServiceCatalogByCode(
    tenantId: string,
    code: string,
  ): Promise<AdditionalServiceCatalogRecord | null>;

  findAdditionalServiceCatalogsByCodes(
    tenantId: string,
    codes: string[],
  ): Promise<AdditionalServiceCatalogRecord[]>;

  findAdditionalServiceCatalogs(
    tenantId: string,
  ): Promise<AdditionalServiceCatalogAdminRecord[]>;

  findAdditionalServiceCatalogCodes(tenantId: string): Promise<string[]>;

  createAdditionalServiceCatalogItems(
    tenantId: string,
    items: readonly CreateAdditionalServiceCatalogItemData[],
  ): Promise<number>;

  findPricingConfigurations(
    tenantId: string,
    filters?: AdditionalServicePricingConfigurationFilters,
  ): Promise<AdditionalServicePricingConfigurationRecord[]>;

  findPricingConfigurationById(
    tenantId: string,
    id: string,
  ): Promise<AdditionalServicePricingConfigurationRecord | null>;

  findPricingConfigurationByCatalogId(
    tenantId: string,
    additionalServiceCatalogId: string,
  ): Promise<AdditionalServicePricingConfigurationRecord | null>;

  findPricingConfigurationsByCatalogIds(
    tenantId: string,
    additionalServiceCatalogIds: string[],
  ): Promise<AdditionalServicePricingConfigurationRecord[]>;

  createPricingConfiguration(
    data: CreateAdditionalServicePricingConfigurationData,
  ): Promise<AdditionalServicePricingConfigurationRecord>;

  updatePricingConfiguration(
    tenantId: string,
    id: string,
    data: UpdateAdditionalServicePricingConfigurationData,
  ): Promise<AdditionalServicePricingConfigurationRecord>;

  findSuppliers(tenantId: string): Promise<SupplierRecord[]>;

  findSupplierById(
    tenantId: string,
    id: string,
  ): Promise<SupplierRecord | null>;

  findSuppliersByIds(
    tenantId: string,
    ids: string[],
  ): Promise<SupplierRecord[]>;

  findSupplierByName(
    tenantId: string,
    name: string,
    excludeId?: string,
  ): Promise<SupplierRecord | null>;

  createSupplier(data: CreateSupplierData): Promise<SupplierRecord>;

  updateSupplier(
    tenantId: string,
    id: string,
    data: UpdateSupplierData,
  ): Promise<SupplierRecord>;
}

export const ADDITIONAL_SERVICES_REPOSITORY =
  Symbol("ADDITIONAL_SERVICES_REPOSITORY");

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

  findAllTenantIds(): Promise<string[]>;

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

  findAdditionalServiceCatalogById(
    id: string,
  ): Promise<AdditionalServiceCatalogRecord | null>;

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

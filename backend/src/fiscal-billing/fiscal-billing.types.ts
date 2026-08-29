import type { FiscalItemCategory } from "@prisma/client";

export interface SalesOrderSourceLine {
  id: string;
  additionalServiceCatalogId: string | null;
  fiscalItemCategory: FiscalItemCategory | null;
  serviceCode: string;
  serviceName: string;
  serviceDetailsVersion: number | null;
  serviceDetails: unknown;
  commercialNotes: string | null;
  subtotal: string;
  vatPercentage: string;
  vatAmount: string;
  total: string;
  participants: unknown;
}

export interface SalesOrderSource {
  id: string;
  tenantId: string;
  orderNumber: string;
  status: string;
  sourceType: string;
  customerId: string | null;
  customerName: string;
  customerEmail: string | null;
  customerFiscalIdentity: {
    id: string;
    idType: string | null;
    idNumber: string;
  } | null;
  currency: string;
  commercialSubtotal: string;
  totalVat: string;
  total: string;
  paymentConditionType: string | null;
  paymentTermValue: number | null;
  paymentTermUnit: string | null;
  commercialObservations: string | null;
  createdAt: Date;
  lines: SalesOrderSourceLine[];
}

export interface FiscalProfileSnapshot {
  additionalServiceCatalogId: string;
  cabysCode: string;
  unitOfMeasureCode: string;
  taxCode: string | null;
  taxRateCode: string | null;
  taxPercentage: string | null;
  isActive: boolean;
}

export interface BillingConfigurationSnapshot {
  billingEnabled: boolean;
  electronicIssuanceEnabled: boolean;
  countryCode: string;
  fiscalSchemaVersion: string;
}

export interface IssuerActivitySnapshot {
  economicActivityCode: string;
  description: string | null;
  isPrimary: boolean;
  displayOrder: number;
}

export interface FiscalIssuerSnapshot {
  id: string;
  tenantId: string;
  displayName: string;
  isActive: boolean;
  legalName: string;
  identificationTypeCode: string;
  identificationNumber: string;
  email: string;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  provinceCode: string;
  cantonCode: string;
  districtCode: string;
  neighborhoodCode: string | null;
  otherAddressDetails: string;
  establishmentCode: string | null;
  terminalCode: string | null;
  economicActivities: IssuerActivitySnapshot[];
}

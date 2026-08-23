import type { BillingMode, BillingDocumentSourceRole } from "@prisma/client";

export interface BillingDocumentSourceIdentity {
  sourceType: string;
  sourceId: string;
  sourceNumber: string | null;
  sourceRole: BillingDocumentSourceRole;
  creationDeduplicationKey: string | null;
}

export interface BillingDocumentIssuerSnapshot {
  name: string;
  identificationType: string;
  identification: string;
  economicActivityCode: string | null;
  establishmentCode: string | null;
  terminalCode: string | null;
  email: string | null;
  phone: string | null;
  address: Record<string, unknown> | null;
}

export interface BillingDocumentReceiverSnapshot {
  name: string | null;
  identificationType: string | null;
  identification: string | null;
  economicActivityCode: string | null;
  email: string | null;
  phone: string | null;
  address: Record<string, unknown> | null;
}

export interface BillingDocumentTotalsSnapshot {
  grossSubtotal: string;
  discountTotal: string;
  taxableTotal: string;
  exemptTotal: string;
  exoneratedTotal: string;
  grossTaxTotal: string;
  exoneratedTaxTotal: string;
  netTaxTotal: string;
  total: string;
}

export interface BillingDocumentDraftLineSnapshot {
  lineNumber: number;
  cabysCode: string | null;
  itemCode: string | null;
  description: string;
  quantity: string;
  unitOfMeasureCode: string;
  unitPrice: string;
  grossAmount: string;
  discountAmount: string;
  discountCode: string | null;
  discountReason: string | null;
  taxableBase: string;
  taxAmount: string;
  exoneratedTaxAmount: string;
  netTaxAmount: string;
  lineSubtotal: string;
  lineTotal: string;
  taxes: BillingDocumentDraftTaxSnapshot[];
}

export interface BillingDocumentDraftTaxSnapshot {
  taxOrder: number;
  taxCode: string;
  rateCode: string;
  ratePercentage: string;
  taxableBase: string;
  taxAmount: string;
  calculationFactor: string | null;
  netTaxAmount: string;
}

export interface BillingDocumentPaymentMethodSnapshot {
  paymentMethodOrder: number;
  paymentMethodCode: string;
  description: null;
  declaredAmount: null;
}

export interface BillingDocumentDraftCommand {
  tenantId: string;
  fiscalIssuerId: string | null;
  internalNumber: string;
  documentTypeCode: string;
  billingMode: BillingMode;
  source: BillingDocumentSourceIdentity | null;
  schemaVersion: string;
  countryCode: string;
  currencyCode: string;
  paymentConditionCode: string;
  creditTermDays: number | null;
  issuer: BillingDocumentIssuerSnapshot;
  receiver: BillingDocumentReceiverSnapshot;
  totals: BillingDocumentTotalsSnapshot;
  paymentMethods: BillingDocumentPaymentMethodSnapshot[];
  lines: BillingDocumentDraftLineSnapshot[];
  createdByUserId: string;
}

export interface PrimaryDocumentSummary {
  id: string;
  internalNumber: string;
  lifecycleStatus: string;
  documentTypeCode: string;
}

export interface BillingDocumentFiscalAllocationResult {
  billingDocumentId: string;
  sequenceId: string;
  allocatedSequenceNumber: string;
  providerBase: string;
  fiscalNumber: string;
  issuanceIdempotencyKey: string;
  outboxEventId: string;
  outboxDeduplicationKey: string;
  lifecycleStatus: string;
  providerStatus: string;
  newlyAllocated: boolean;
}

export interface BillingDocumentIssuancePreflight {
  id: string;
  billingMode: string;
  lifecycleStatus: string;
  providerStatus: string;
  taxAuthorityStatus: string;
  currencyCode: string;
  fiscalNumber: string | null;
  providerDocumentId: string | null;
  billingDocumentNumberSequenceId: string | null;
  allocatedSequenceNumber: bigint | null;
  issuanceIdempotencyKey: string | null;
  fiscalEmissionAt: Date | null;
  fiscalIssueDate: Date | null;
  exchangeRate: string | null;
  officialExchangeRateObservationId: string | null;
  fiscalExchangeRateEffectiveDate: Date | null;
  fiscalExchangeRateSourceAuthority: string | null;
  fiscalExchangeRateIndicatorCode: string | null;
}

export interface BillingDocumentOfficialRatePreparation {
  observationId: string;
  value: string;
  effectiveDate: string;
  sourceAuthority: string;
  sourceIndicatorCode: string;
}

export interface BillingDocumentFiscalPreparation {
  expectedCurrencyCode: "CRC" | "USD";
  fiscalEmissionAt: Date;
  fiscalIssueDate: string;
  officialRate: BillingDocumentOfficialRatePreparation | null;
}

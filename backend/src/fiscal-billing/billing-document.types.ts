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

export interface CrV44SalesOrderDraftCommand {
  tenantId: string;
  salesOrderId: string;
  fiscalIssuerId: string;
  internalNumber: string;
  documentTypeCode: string;
  receiverIdentificationType: string | null;
  receiverIdentification: string | null;
  paymentMethods: BillingDocumentPaymentMethodSnapshot[];
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

export interface BillingDocumentWorkspace {
  id: string;
  billingMode: string;
  internalNumber: string;
  documentTypeCode: string;
  sourceType: string | null;
  sourceId: string | null;
  sourceNumber: string | null;
  sourceRole: string;
  schemaVersion: string;
  fiscalCalculationPolicyVersion: string | null;
  countryCode: string;
  currencyCode: string;
  exchangeRate: string | null;
  fiscalEmissionAt: Date | null;
  fiscalIssueDate: string | null;
  dueDate: string | null;
  confirmedAt: Date | null;
  submittedAt: Date | null;
  issuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  paymentConditionCode: string | null;
  creditTermDays: number | null;
  lifecycleStatus: string;
  providerStatus: string;
  taxAuthorityStatus: string;
  artifactStatus: string;
  fiscalNumber: string | null;
  allocatedSequenceNumber: string | null;
  haciendaKey: string | null;
  haciendaRejectionDetail: string | null;
  providerEnvironment: string | null;
  providerDocumentId: string | null;
  providerLastErrorCode: string | null;
  providerLastErrorAt: Date | null;
  issuerName: string;
  issuerIdentificationType: string;
  issuerIdentification: string;
  issuerEconomicActivityCode: string | null;
  issuerEstablishmentCode: string | null;
  issuerTerminalCode: string | null;
  issuerEmail: string | null;
  issuerPhone: string | null;
  issuerAddressSnapshot: unknown;
  receiverName: string | null;
  receiverIdentificationType: string | null;
  receiverIdentification: string | null;
  receiverEconomicActivityCode: string | null;
  receiverEmail: string | null;
  receiverPhone: string | null;
  receiverAddressSnapshot: unknown;
  grossSubtotal: string;
  discountTotal: string;
  taxableTotal: string;
  exemptTotal: string;
  exoneratedTotal: string;
  grossTaxTotal: string;
  exoneratedTaxTotal: string;
  netTaxTotal: string;
  total: string;
  paymentMethods: BillingDocumentWorkspacePaymentMethod[];
  references: BillingDocumentWorkspaceReference[];
  lines: BillingDocumentWorkspaceLine[];
  readiness: {
    receiverFiscalIdentityMissing: boolean;
    exchangeRateMissing: boolean;
  };
}

export interface BillingDocumentWorkspacePaymentMethod {
  id: string;
  paymentMethodOrder: number;
  paymentMethodCode: string;
  description: string | null;
  declaredAmount: string | null;
}

export interface BillingDocumentWorkspaceReference {
  id: string;
  referenceOrder: number;
  referencedBillingDocumentId: string | null;
  externalDocumentKey: string | null;
  externalDocumentNumber: string | null;
  referencedDocumentTypeCode: string;
  reasonCode: string;
  reasonDescription: string | null;
  referenceDate: string;
}

export interface BillingDocumentWorkspaceLine {
  id: string;
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
  taxes: BillingDocumentWorkspaceTax[];
}

export interface BillingDocumentWorkspaceTax {
  id: string;
  taxOrder: number;
  taxCode: string;
  rateCode: string;
  ratePercentage: string;
  taxableBase: string;
  taxAmount: string;
  calculationFactor: string | null;
  netTaxAmount: string;
  exemption: BillingDocumentWorkspaceTaxExemption | null;
}

export interface BillingDocumentWorkspaceTaxExemption {
  id: string;
  documentTypeCode: string;
  documentNumber: string;
  legalArticle: string | null;
  legalSection: string | null;
  issuingInstitutionCode: string | null;
  issuingInstitutionName: string | null;
  otherInstitutionDescription: string | null;
  issueDate: string;
  exemptedPercentage: string;
  exemptedAmount: string;
}

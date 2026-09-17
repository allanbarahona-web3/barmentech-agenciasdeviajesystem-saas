/** Generic, persistence- and country-agnostic reporting contracts. */

export type ReportKey = "SALES" | "SALES_TAX" | "RECEIVABLES";

export type ReportDocumentEffect = "INCREASE" | "DECREASE";

export type ReportDocumentStatus = "ACCEPTED";

/** Generic presentation request. Country adapters decide whether they can supply it. */
export type ReportingProjection =
  | { mode: "ORIGINAL" }
  | { mode: "TARGET_CURRENCY"; targetCurrencyCode: string };

export type ReportProjectionOperation = "IDENTITY" | "MULTIPLY" | "DIVIDE";

/** Immutable, adapter-supplied evidence needed to present one document in a target currency. */
export interface ReportDocumentProjection {
  sourceCurrencyCode: string;
  targetCurrencyCode: string;
  rate: ExactDecimalString;
  operation: ReportProjectionOperation;
  rateAuthority: string;
  effectiveOn: string;
}

/** Exact fiscal decimal lexical value. Never coerce reporting money to Number. */
export type ExactDecimalString = string;

export interface ReportCustomer {
  name: string | null;
  identificationType: string | null;
  identification: string | null;
}

export interface ReportAmounts {
  grossSales: ExactDecimalString;
  discounts: ExactDecimalString;
  taxableSales: ExactDecimalString;
  exemptSales: ExactDecimalString;
  exoneratedSales: ExactDecimalString;
  grossTax: ExactDecimalString;
  exoneratedTax: ExactDecimalString;
  taxCollected: ExactDecimalString;
  total: ExactDecimalString;
}

export interface ReportTaxLine {
  taxCode: string;
  rateCode?: string;
  rate: ExactDecimalString;
  taxableBase: ExactDecimalString;
  exemptBase?: ExactDecimalString;
  exoneratedBase?: ExactDecimalString;
  grossTaxAmount: ExactDecimalString;
  exemptionAmount?: ExactDecimalString;
  taxCollected: ExactDecimalString;
}

export interface ReportDocument {
  documentId: string;
  documentNumber: string;
  authorityKey?: string;
  documentTypeCode: string;
  effect: ReportDocumentEffect;
  status: ReportDocumentStatus;
  /** Tenant fiscal calendar date in YYYY-MM-DD form. */
  issuedOn: string;
  acceptedAt?: string;
  customer: ReportCustomer;
  currencyCode: string;
  projection: ReportDocumentProjection;
  amounts: ReportAmounts;
  taxes: readonly ReportTaxLine[];
}

/** Context is created by the outer authorized application layer. */
export interface ReportExecutionContext {
  tenantId: string;
  actorUserId: string;
  reportKey: ReportKey;
  timezone: string;
}

export interface ResolvedReportingPeriod {
  startOn: string;
  endOn: string;
}

export interface ReportDocumentReadFilter {
  documentTypeCodes?: readonly string[];
  saleCondition?: "CASH" | "CREDIT" | "OTHER";
  currencyCode?: string;
  taxCode?: string;
  rateCode?: string;
  rate?: ExactDecimalString;
}

export interface ReportDocumentAggregate {
  currencyCode: string;
  projection: ReportDocumentProjection;
  effect: ReportDocumentEffect;
  documentCount: number;
  amounts: ReportAmounts;
}

export interface ReportDocumentPageRequest {
  page: number;
  pageSize: number;
  filter?: ReportDocumentReadFilter;
  /** Bounded detail consumers may request the generic persisted tax lines. */
  includeTaxes?: boolean;
}

export interface ReportDocumentPage {
  items: readonly ReportDocument[];
  totalItems: number;
}

export const REPORT_DOCUMENT_READER = Symbol("REPORT_DOCUMENT_READER");

/** Port implemented by an ERP or invoicing-specific reporting adapter. */
export interface ReportDocumentReader {
  readDocuments(
    context: ReportExecutionContext,
    period: ResolvedReportingPeriod,
    filter?: ReportDocumentReadFilter,
  ): Promise<readonly ReportDocument[]>;

  readDocumentAggregates(
    context: ReportExecutionContext,
    period: ResolvedReportingPeriod,
    filter?: ReportDocumentReadFilter,
  ): Promise<readonly ReportDocumentAggregate[]>;

  readDocumentPage(
    context: ReportExecutionContext,
    period: ResolvedReportingPeriod,
    request: ReportDocumentPageRequest,
  ): Promise<ReportDocumentPage>;
}

/**
 * Separate future port for adapters that can aggregate tax rows set-wise.
 * RPT-01 defines the boundary only; RPT-04 supplies its implementation.
 */
export interface ReportTaxAggregation {
  currencyCode: string;
  projection: ReportDocumentProjection;
  effect: ReportDocumentEffect;
  documentCount: number;
  tax: ReportTaxLine;
}

export const REPORT_TAX_AGGREGATION_READER = Symbol("REPORT_TAX_AGGREGATION_READER");

export interface ReportTaxAggregationReader {
  readTaxAggregation(
    context: ReportExecutionContext,
    period: ResolvedReportingPeriod,
    filter?: ReportDocumentReadFilter,
  ): Promise<readonly ReportTaxAggregation[]>;
}

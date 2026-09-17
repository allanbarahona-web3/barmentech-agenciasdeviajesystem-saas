import type { ExactDecimalString, ReportExecutionContext } from "./reporting.contracts";

/** Generic categories; the outer persistence adapter chooses the authority behind each row. */
export type ReceivableReportCategory = "RECOGNIZED_RECEIVABLE" | "PROJECTED_RECEIVABLE";
export type ReceivableCollectionTiming = "OVERDUE" | "CURRENT" | "FUTURE" | "NO_PROJECTABLE_DATE";
export type ReceivableReportStatus = "OPEN" | "PARTIALLY_SETTLED";
export type ReceivableDueDatePreset = "ALL" | "OVERDUE" | "DUE_TODAY" | "NEXT_7_DAYS" | "NEXT_15_DAYS" | "CURRENT_MONTH" | "CUSTOM";
export type ReceivableDueDateSelection =
  | { preset: Exclude<ReceivableDueDatePreset, "CUSTOM"> }
  | { preset: "CUSTOM"; dateFrom: string; dateTo: string };

export interface ReceivableReportCustomer {
  name: string | null;
  identificationType: string | null;
  identification: string | null;
}

/**
 * A domain-neutral, readonly receivable presentation row. opaqueId is solely a
 * stable opaque cursor/tie-breaker and must not be displayed as a business ID.
 */
export interface ReceivableReportRow {
  opaqueId: string;
  category: ReceivableReportCategory;
  customer: ReceivableReportCustomer;
  reference: string | null;
  sourceLabel: string;
  createdOn: string;
  dueOn?: string;
  currencyCode: string;
  originalAmount: ExactDecimalString;
  appliedAmount: ExactDecimalString;
  outstandingAmount: ExactDecimalString;
  status: ReceivableReportStatus;
  collectionTiming: ReceivableCollectionTiming;
}

/** Filter shape is shared by future detail and monthly aggregation readers. */
export interface ReceivableReportReadFilter {
  category?: ReceivableReportCategory;
  currencyCode?: string;
  customerSearch?: string;
  timing?: ReceivableCollectionTiming;
}

/** Date-only scope assembled by the outer reporting application layer. */
export interface ReceivableReportWindow {
  /** Omitted for the complete outstanding portfolio. */
  dueDateFrom?: string;
  dueDateTo?: string;
  currentOn: string;
  currentWindowEndOn: string;
  monthlyStartOn: string;
}

export interface ReceivableReportReadRequest {
  window: ReceivableReportWindow;
  filter?: ReceivableReportReadFilter;
}

export interface ReceivableReportPageRequest {
  page: number;
  pageSize: number;
  /** Optional only for the adapter-foundation reader; report execution supplies it. */
  window?: ReceivableReportWindow;
  filter?: ReceivableReportReadFilter;
}

export interface ReceivableReportPage {
  items: readonly ReceivableReportRow[];
  totalItems: number;
}

export const RECEIVABLE_REPORT_READER = Symbol("RECEIVABLE_REPORT_READER");

/** Adapter port only: core remains persistence- and domain-independent. */
export interface ReceivableReportReader {
  readPage(context: ReportExecutionContext, request: ReceivableReportPageRequest): Promise<ReceivableReportPage>;
}

export interface ReceivableReportSummaryGroup {
  category: ReceivableReportCategory;
  currencyCode: string;
  collectionTiming: ReceivableCollectionTiming;
  outstandingAmount: ExactDecimalString;
  rowCount: number;
}

export const RECEIVABLE_REPORT_SUMMARY_READER = Symbol("RECEIVABLE_REPORT_SUMMARY_READER");

export interface ReceivableReportSummaryReader {
  readSummary(
    context: ReportExecutionContext,
    request: ReceivableReportReadRequest,
  ): Promise<readonly ReceivableReportSummaryGroup[]>;
}

/**
 * Future-only port. Monthly expected cashflow requires an authoritative Expected
 * Collection Schedule; current payment allocations remain against the parent
 * receivable/obligation unless a separate business decision changes that.
 */
export interface ReceivableMonthlyProjection {
  dueMonth: string;
  category: ReceivableReportCategory;
  currencyCode: string;
  outstandingAmount: ExactDecimalString;
  rowCount: number;
}

export const RECEIVABLE_MONTHLY_PROJECTION_READER = Symbol("RECEIVABLE_MONTHLY_PROJECTION_READER");

export interface ReceivableMonthlyProjectionReader {
  readMonthlyProjection(
    context: ReportExecutionContext,
    request: ReceivableReportReadRequest,
  ): Promise<readonly ReceivableMonthlyProjection[]>;
}

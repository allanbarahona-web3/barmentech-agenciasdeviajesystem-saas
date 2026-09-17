import { fetchApi } from "@/lib/api-client";

export type ReportingPeriodPreset =
  | "TODAY"
  | "LAST_7_DAYS"
  | "LAST_15_DAYS"
  | "CURRENT_MONTH"
  | "PREVIOUS_MONTH"
  | "CUSTOM";

export type SalesReportQuery = {
  periodPreset: ReportingPeriodPreset;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  saleCondition?: "CASH" | "CREDIT" | "OTHER";
  currencyCode?: string;
  taxCode?: string;
  rateCode?: string;
  rate?: string;
  projectionMode?: "ORIGINAL" | "CRC";
};

export type ReportAmounts = {
  grossSales: string;
  discounts: string;
  taxableSales: string;
  exemptSales: string;
  exoneratedSales: string;
  grossTax: string;
  exoneratedTax: string;
  taxCollected: string;
  total: string;
};

export type SalesReportResult = {
  reportKey: "SALES";
  period: { startOn: string; endOn: string };
  generatedAt: string;
  projectionMode: "ORIGINAL" | "CRC";
  presentationCurrencyCode?: string;
  currencies: Array<{ currencyCode: string; documentCount: number } & ReportAmounts>;
  documents: Array<{
    documentId: string;
    documentNumber: string;
    documentTypeCode: string;
    issuedOn: string;
    customer: { name: string | null; identificationType: string | null; identification: string | null };
    currencyCode: string;
    originalCurrencyCode: string;
    originalAmounts: ReportAmounts;
    projection: { sourceCurrencyCode: string; targetCurrencyCode: string; rate: string; operation: "IDENTITY" | "MULTIPLY" | "DIVIDE"; rateAuthority: string; effectiveOn: string };
    effect: "INCREASE" | "DECREASE";
  } & ReportAmounts>;
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};

export type SalesTaxReportTaxGroup = {
  taxCode: string;
  rateCode?: string;
  rate: string;
  documentCount: number;
  taxableBase: string;
  grossTaxAmount: string;
  exemptionAmount?: string;
  taxCollected: string;
};

export type SalesTaxReportResult = {
  reportKey: "SALES_TAX";
  period: { startOn: string; endOn: string };
  generatedAt: string;
  projectionMode: "ORIGINAL" | "CRC";
  presentationCurrencyCode?: string;
  headerTotalsScope: "ALL_FILTERED_DOCUMENTS" | "DOCUMENTS_MATCHING_TAX_FILTER";
  currencies: Array<{
    currencyCode: string;
    documentCount: number;
    exemptSales: string;
    exoneratedSales: string;
    grossTax: string;
    exoneratedTax: string;
    taxCollected: string;
    taxGroups: SalesTaxReportTaxGroup[];
  }>;
  documents: Array<{
    documentId: string;
    documentNumber: string;
    documentTypeCode: string;
    issuedOn: string;
    customer: { name: string | null; identificationType: string | null; identification: string | null };
    currencyCode: string;
    originalCurrencyCode: string;
    originalAmounts: ReportAmounts;
    projection: { sourceCurrencyCode: string; targetCurrencyCode: string; rate: string; operation: "IDENTITY" | "MULTIPLY" | "DIVIDE"; rateAuthority: string; effectiveOn: string };
    effect: "INCREASE" | "DECREASE";
    taxableSales: string;
    exemptSales: string;
    exoneratedSales: string;
    grossTax: string;
    exoneratedTax: string;
    taxCollected: string;
    total: string;
    taxes: Array<{
      taxCode: string;
      rateCode?: string;
      rate: string;
      taxableBase: string;
      grossTaxAmount: string;
      exemptionAmount?: string;
      taxCollected: string;
    }>;
  }>;
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};

export type ReceivablesReportCategory = "RECOGNIZED_RECEIVABLE" | "PROJECTED_RECEIVABLE";
export type ReceivablesCollectionTiming = "OVERDUE" | "CURRENT" | "FUTURE" | "NO_PROJECTABLE_DATE";
export type ReceivablesDueDatePreset = "ALL" | "OVERDUE" | "DUE_TODAY" | "NEXT_7_DAYS" | "NEXT_15_DAYS" | "CURRENT_MONTH" | "CUSTOM";

export type ReceivablesReportQuery = {
  dueDatePreset: ReceivablesDueDatePreset;
  dateFrom?: string;
  dateTo?: string;
  customerSearch?: string;
  currencyCode?: string;
  category?: ReceivablesReportCategory;
  timing?: ReceivablesCollectionTiming;
  page?: number;
  pageSize?: number;
};

export type ReceivablesReportResult = {
  reportKey: "RECEIVABLES";
  period: { startOn: string; endOn: string };
  generatedAt: string;
  asOfDate: string;
  currencies: Array<{
    currencyCode: string;
    recognizedOutstanding: string;
    projectedOutstanding: string;
    overdueRecognized: string;
    overdueProjected: string;
    noDateRecognized: string;
    noDateProjected: string;
  }>;
  rows: Array<{
    opaqueId: string;
    category: ReceivablesReportCategory;
    customer: { name: string | null; identificationType: string | null; identification: string | null };
    reference: string | null;
    sourceLabel: string;
    createdOn: string;
    dueOn?: string;
    currencyCode: string;
    originalAmount: string;
    appliedAmount: string;
    outstandingAmount: string;
    status: "OPEN" | "PARTIALLY_SETTLED";
    collectionTiming: ReceivablesCollectionTiming;
  }>;
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};

export class ReportingApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ReportingApiError";
  }
}

export async function getSalesReport(query: SalesReportQuery, signal?: AbortSignal): Promise<SalesReportResult> {
  const response = await fetchApi("/reporting/sales", { params: query, signal });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ReportingApiError(payload.message || "No se pudo cargar el reporte de ventas.", response.status);
  }
  return response.json() as Promise<SalesReportResult>;
}

export async function getSalesTaxReport(query: SalesReportQuery, signal?: AbortSignal): Promise<SalesTaxReportResult> {
  const response = await fetchApi("/reporting/sales-tax", { params: query, signal });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ReportingApiError(payload.message || "No se pudo cargar el reporte de impuestos sobre ventas.", response.status);
  }
  return response.json() as Promise<SalesTaxReportResult>;
}

export async function getReceivablesReport(query: ReceivablesReportQuery, signal?: AbortSignal): Promise<ReceivablesReportResult> {
  const response = await fetchApi("/reporting/receivables", { params: query, signal });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ReportingApiError(payload.message || "No se pudo cargar el reporte de cuentas por cobrar.", response.status);
  }
  return response.json() as Promise<ReceivablesReportResult>;
}

export async function downloadReportingExport(reportKey: "SALES" | "SALES_TAX" | "RECEIVABLES", format: "PDF" | "XLSX" | "CSV", query: SalesReportQuery | ReceivablesReportQuery): Promise<{ blob: Blob; fileName: string }> {
  const path = reportKey === "SALES" ? "/reporting/sales/export" : reportKey === "SALES_TAX" ? "/reporting/sales-tax/export" : "/reporting/receivables/export";
  const response = await fetchApi(path, { params: { ...query, format } });
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new ReportingApiError(payload.message || "No se pudo exportar el reporte.", response.status); }
  const disposition = response.headers.get("content-disposition") ?? "";
  return { blob: await response.blob(), fileName: /filename="([^"]+)"/.exec(disposition)?.[1] ?? `reporte.${format.toLowerCase()}` };
}

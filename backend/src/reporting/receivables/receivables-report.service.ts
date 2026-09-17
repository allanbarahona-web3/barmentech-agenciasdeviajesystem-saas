import { Inject, Injectable } from "@nestjs/common";
import type {
  ReceivableReportPageRequest,
  ReceivableReportReadRequest,
  ReceivableReportRow,
  ReceivableReportSummaryReader,
} from "../contracts/receivables-reporting.contracts";
import {
  RECEIVABLE_REPORT_READER,
  RECEIVABLE_REPORT_SUMMARY_READER,
  type ReceivableReportReader,
} from "../contracts/receivables-reporting.contracts";
import type { ReportExecutionContext, ResolvedReportingPeriod } from "../contracts/reporting.contracts";
import { addDecimal } from "../core/exact-decimal";

export interface ReceivablesReportRequest extends Omit<ReceivableReportPageRequest, "window"> {
  read: ReceivableReportReadRequest;
}

export interface ReceivablesReportResult {
  reportKey: "RECEIVABLES";
  period: ResolvedReportingPeriod;
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
  rows: readonly ReceivableReportRow[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/** Generic aggregation over Finance reader ports; it imports no ERP persistence model. */
@Injectable()
export class ReceivablesReportService {
  constructor(
    @Inject(RECEIVABLE_REPORT_READER) private readonly rows: ReceivableReportReader,
    @Inject(RECEIVABLE_REPORT_SUMMARY_READER) private readonly summary: ReceivableReportSummaryReader,
  ) {}

  async execute(context: ReportExecutionContext, period: ResolvedReportingPeriod, request: ReceivablesReportRequest): Promise<ReceivablesReportResult> {
    const pageRequest: ReceivableReportPageRequest = { page: request.page, pageSize: request.pageSize, window: request.read.window, ...(request.read.filter ? { filter: request.read.filter } : {}) };
    const [summary, page] = await Promise.all([
      this.summary.readSummary(context, request.read),
      this.rows.readPage(context, pageRequest),
    ]);
    const currencies = new Map<string, CurrencySummary>();
    for (const row of summary) {
      const current = currencies.get(row.currencyCode) ?? emptyCurrency();
      if (row.category === "RECOGNIZED_RECEIVABLE") {
        current.recognizedOutstanding = addDecimal(current.recognizedOutstanding, row.outstandingAmount);
        if (row.collectionTiming === "OVERDUE") current.overdueRecognized = addDecimal(current.overdueRecognized, row.outstandingAmount);
        if (row.collectionTiming === "NO_PROJECTABLE_DATE") current.noDateRecognized = addDecimal(current.noDateRecognized, row.outstandingAmount);
      } else {
        current.projectedOutstanding = addDecimal(current.projectedOutstanding, row.outstandingAmount);
        if (row.collectionTiming === "OVERDUE") current.overdueProjected = addDecimal(current.overdueProjected, row.outstandingAmount);
        if (row.collectionTiming === "NO_PROJECTABLE_DATE") current.noDateProjected = addDecimal(current.noDateProjected, row.outstandingAmount);
      }
      currencies.set(row.currencyCode, current);
    }
    return {
      reportKey: "RECEIVABLES", period, generatedAt: new Date().toISOString(), asOfDate: request.read.window.currentOn,
      currencies: [...currencies.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currencyCode, value]) => ({ currencyCode, ...value })),
      rows: page.items,
      pagination: { page: request.page, pageSize: request.pageSize, totalItems: page.totalItems, totalPages: page.totalItems === 0 ? 0 : Math.ceil(page.totalItems / request.pageSize) },
    };
  }
}

type CurrencySummary = Omit<ReceivablesReportResult["currencies"][number], "currencyCode">;
function emptyCurrency(): CurrencySummary { return { recognizedOutstanding: "0", projectedOutstanding: "0", overdueRecognized: "0", overdueProjected: "0", noDateRecognized: "0", noDateProjected: "0" }; }

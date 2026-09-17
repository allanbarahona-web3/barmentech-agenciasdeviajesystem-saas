import { Inject, Injectable } from "@nestjs/common";
import {
  REPORT_DOCUMENT_READER,
  type ReportAmounts,
  type ReportDocumentReader,
  type ReportDocumentReadFilter,
  type ReportExecutionContext,
  type ReportingProjection,
  type ResolvedReportingPeriod,
} from "../contracts/reporting.contracts";
import { addAmounts, applyEffect, ZERO_AMOUNTS } from "../core/exact-decimal";
import { presentationCurrency, projectAmounts } from "../core/report-projection";

export interface SalesReportRequest { page: number; pageSize: number; filter?: ReportDocumentReadFilter; projection?: ReportingProjection; }

export interface SalesReportResult {
  reportKey: "SALES";
  period: ResolvedReportingPeriod;
  generatedAt: string;
  projectionMode: "ORIGINAL" | "CRC";
  presentationCurrencyCode?: string;
  currencies: Array<{ currencyCode: string; documentCount: number } & ReportAmounts>;
  documents: Array<{
    documentId: string; documentNumber: string; documentTypeCode: string; issuedOn: string;
    customer: { name: string | null; identificationType: string | null; identification: string | null };
    currencyCode: string; originalCurrencyCode: string; originalAmounts: ReportAmounts; projection: import("../contracts/reporting.contracts").ReportDocumentProjection; effect: "INCREASE" | "DECREASE";
  } & ReportAmounts>;
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/** Generic sales aggregation over the reader port; it has no ERP persistence knowledge. */
@Injectable()
export class SalesReportService {
  constructor(@Inject(REPORT_DOCUMENT_READER) private readonly reader: ReportDocumentReader) {}

  async execute(
    context: ReportExecutionContext,
    period: ResolvedReportingPeriod,
    request: SalesReportRequest,
  ): Promise<SalesReportResult> {
    const projection = request.projection ?? { mode: "ORIGINAL" } as const;
    const [aggregates, documentPage] = await Promise.all([
      this.reader.readDocumentAggregates(context, period, request.filter),
      this.reader.readDocumentPage(context, period, { page: request.page, pageSize: request.pageSize, ...(request.filter ? { filter: request.filter } : {}) }),
    ]);
    const currencies = new Map<string, { documentCount: number; amounts: ReportAmounts }>();
    for (const aggregate of aggregates) {
      const currencyCode = presentationCurrency(aggregate.currencyCode, projection);
      const current = currencies.get(currencyCode) ?? { documentCount: 0, amounts: ZERO_AMOUNTS };
      currencies.set(currencyCode, {
        documentCount: current.documentCount + aggregate.documentCount,
        amounts: addAmounts(current.amounts, applyEffect(projectAmounts(aggregate.amounts, aggregate.projection, projection), aggregate.effect)),
      });
    }

    return {
      reportKey: "SALES",
      projectionMode: projection.mode === "ORIGINAL" ? "ORIGINAL" : "CRC",
      ...(projection.mode === "TARGET_CURRENCY" ? { presentationCurrencyCode: projection.targetCurrencyCode } : {}),
      period,
      generatedAt: new Date().toISOString(),
      currencies: [...currencies.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currencyCode, summary]) => ({
        currencyCode, documentCount: summary.documentCount, ...summary.amounts,
      })),
      documents: documentPage.items.map((document) => {
        const amounts = projectAmounts(document.amounts, document.projection, projection);
        return ({
        documentId: document.documentId, documentNumber: document.documentNumber, documentTypeCode: document.documentTypeCode,
        issuedOn: document.issuedOn, customer: document.customer, currencyCode: presentationCurrency(document.currencyCode, projection), originalCurrencyCode: document.currencyCode, originalAmounts: document.amounts, projection: document.projection, effect: document.effect,
        ...amounts,
      }); }),
      pagination: {
        page: request.page,
        pageSize: request.pageSize,
        totalItems: documentPage.totalItems,
        totalPages: documentPage.totalItems === 0 ? 0 : Math.ceil(documentPage.totalItems / request.pageSize),
      },
    };
  }
}

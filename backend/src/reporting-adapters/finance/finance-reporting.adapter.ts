import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  ReceivableMonthlyProjection,
  ReceivableMonthlyProjectionReader,
  ReceivableReportPage,
  ReceivableReportPageRequest,
  ReceivableReportReader,
  ReceivableReportReadRequest,
  ReceivableReportRow,
  ReceivableReportSummaryGroup,
  ReceivableReportSummaryReader,
  ReceivableReportWindow,
} from "../../reporting/contracts/receivables-reporting.contracts";
import type { ReportExecutionContext } from "../../reporting/contracts/reporting.contracts";

/**
 * Current authority boundary: accepted invoice receivables live in
 * AccountReceivable; Contract commitments live in CommercialObligation.
 * Contract-payment fiscal documents never enter this adapter: they do not
 * create AccountReceivable and their allocations already reduce the obligation.
 * If a future flow makes one Contract debt directly recognized as an AR, an
 * explicit provenance link is required before these authorities are combined.
 */
export const CURRENT_RECEIVABLES_ANTI_DOUBLE_COUNTING_POLICY =
  "Separate current authorities only; no fuzzy cross-category deduplication.";

/** ERP Finance persistence adapter. It exposes only generic receivable rows. */
@Injectable()
export class FinanceReportingAdapter implements ReceivableReportReader, ReceivableReportSummaryReader, ReceivableMonthlyProjectionReader {
  constructor(private readonly prisma: PrismaService) {}

  async readPage(context: ReportExecutionContext, request: ReceivableReportPageRequest): Promise<ReceivableReportPage> {
    assertPage(request);
    const query = filteredRows(context, { window: request.window ?? defaultWindow(context.timezone), ...(request.filter ? { filter: request.filter } : {}) });
    const offset = (request.page - 1) * request.pageSize;
    const rows = await this.prisma.$queryRaw<ReceivablePersistenceRow[]>(Prisma.sql`
      ${query}
      SELECT filtered.*, COUNT(*) OVER() AS "totalItems"
      FROM filtered
      ORDER BY
        filtered."createdOn" DESC, filtered."dueOn" DESC NULLS LAST, filtered."opaqueId" DESC
      LIMIT ${request.pageSize} OFFSET ${offset}
    `);
    return { items: rows.map(mapRow), totalItems: rows.length ? exactCount(rows[0]!.totalItems) : 0 };
  }

  async readSummary(context: ReportExecutionContext, request: ReceivableReportReadRequest): Promise<readonly ReceivableReportSummaryGroup[]> {
    const rows = await this.prisma.$queryRaw<ReceivableSummaryPersistenceRow[]>(Prisma.sql`
      ${filteredRows(context, request)}
      SELECT filtered."category", filtered."currencyCode", filtered."collectionTiming", COALESCE(SUM(filtered."outstandingAmount"), 0) AS "outstandingAmount", COUNT(*) AS "rowCount"
      FROM filtered
      GROUP BY filtered."category", filtered."currencyCode", filtered."collectionTiming"
      ORDER BY filtered."currencyCode" ASC, filtered."category" ASC, filtered."collectionTiming" ASC
    `);
    return rows.map((row) => ({ category: row.category, currencyCode: row.currencyCode, collectionTiming: row.collectionTiming, outstandingAmount: exact(row.outstandingAmount), rowCount: exactCount(row.rowCount) }));
  }

  async readMonthlyProjection(context: ReportExecutionContext, request: ReceivableReportReadRequest): Promise<readonly ReceivableMonthlyProjection[]> {
    const rows = await this.prisma.$queryRaw<ReceivableMonthlyPersistenceRow[]>(Prisma.sql`
      ${filteredRows(context, request)}
      SELECT TO_CHAR(filtered."dueOn", 'YYYY-MM') AS "dueMonth", filtered."category", filtered."currencyCode", COALESCE(SUM(filtered."outstandingAmount"), 0) AS "outstandingAmount", COUNT(*) AS "rowCount"
      FROM filtered
      WHERE filtered."dueOn" IS NOT NULL
        AND filtered."dueOn" >= ${dateOnly(request.window.monthlyStartOn)}
        AND filtered."dueOn" <= ${dateOnly(request.window.dueDateTo ?? "9999-12-31")}
      GROUP BY TO_CHAR(filtered."dueOn", 'YYYY-MM'), filtered."category", filtered."currencyCode"
      ORDER BY "dueMonth" ASC, filtered."currencyCode" ASC, filtered."category" ASC
    `);
    return rows.map((row) => ({ dueMonth: row.dueMonth, category: row.category, currencyCode: row.currencyCode, outstandingAmount: exact(row.outstandingAmount), rowCount: exactCount(row.rowCount) }));
  }
}

function filteredRows(context: ReportExecutionContext, request: ReceivableReportReadRequest): Prisma.Sql {
  assertWindow(request.window);
  const filter = request.filter;
  const categoryClause = filter?.category ? Prisma.sql`AND classified."category" = ${filter.category}` : Prisma.empty;
  const currencyClause = filter?.currencyCode ? Prisma.sql`AND classified."currencyCode" = ${filter.currencyCode}` : Prisma.empty;
  const timingClause = filter?.timing ? Prisma.sql`AND classified."collectionTiming" = ${filter.timing}` : Prisma.empty;
  const customerClause = filter?.customerSearch?.trim()
    ? Prisma.sql`AND (COALESCE(classified."customerName", '') ILIKE ${`%${filter.customerSearch.trim()}%`} OR COALESCE(classified."customerIdentification", '') ILIKE ${`%${filter.customerSearch.trim()}%`})`
    : Prisma.empty;
  const window = request.window;
  const dueDateClause = window.dueDateFrom && window.dueDateTo
    ? Prisma.sql`AND classified."dueOn" >= ${dateOnly(window.dueDateFrom)} AND classified."dueOn" <= ${dateOnly(window.dueDateTo)}`
    : Prisma.empty;
  return Prisma.sql`
    WITH rows AS (
      SELECT ar."id" AS "opaqueId", 'RECOGNIZED_RECEIVABLE' AS "category", ar."debtorDisplayName" AS "customerName", ar."debtorIdentificationType" AS "customerIdentificationType", ar."debtorIdentificationNumber" AS "customerIdentification", ar."sourceNumber" AS "reference", 'Documento fiscal' AS "sourceLabel", ar."recognizedAt" AS "createdOn", ar."dueDate" AS "dueOn", ar."currencyCode" AS "currencyCode", ar."originalAmount" AS "originalAmount", ar."originalAmount" - ar."outstandingAmount" AS "appliedAmount", ar."outstandingAmount" AS "outstandingAmount", ar."status"::text AS "status"
      FROM "account_receivables" ar
      WHERE ar."tenantId" = ${context.tenantId} AND ar."status" IN ('OPEN', 'PARTIALLY_SETTLED') AND ar."outstandingAmount" > 0
      UNION ALL
      SELECT obligation."id" AS "opaqueId", 'PROJECTED_RECEIVABLE' AS "category", customer."fullName" AS "customerName", customer."idType" AS "customerIdentificationType", customer."idNumber" AS "customerIdentification", obligation."sourceReference" AS "reference", 'Compromiso comercial' AS "sourceLabel", obligation."createdAt" AS "createdOn", obligation."dueDate" AS "dueOn", obligation."currencyCode" AS "currencyCode", obligation."originalAmount" AS "originalAmount", obligation."originalAmount" - obligation."outstandingAmount" AS "appliedAmount", obligation."outstandingAmount" AS "outstandingAmount", obligation."status"::text AS "status"
      FROM "commercial_obligations" obligation
      INNER JOIN "Client" customer ON customer."id" = obligation."customerId" AND customer."tenantId" = obligation."tenantId"
      WHERE obligation."tenantId" = ${context.tenantId} AND obligation."sourceType" = 'CONTRACT' AND obligation."status" IN ('OPEN', 'PARTIALLY_SETTLED') AND obligation."outstandingAmount" > 0
    ), classified AS (
      SELECT rows.*, CASE
        WHEN rows."dueOn" IS NULL THEN 'NO_PROJECTABLE_DATE'
        WHEN rows."dueOn" < ${dateOnly(window.currentOn)} THEN 'OVERDUE'
        WHEN rows."dueOn" <= ${dateOnly(window.currentWindowEndOn)} THEN 'CURRENT'
        ELSE 'FUTURE'
      END AS "collectionTiming"
      FROM rows
    ), filtered AS (
      SELECT classified.* FROM classified
      WHERE 1 = 1
      ${dueDateClause} ${categoryClause} ${currencyClause} ${timingClause} ${customerClause}
    )
  `;
}

type DecimalValue = { toFixed(): string };
type BasePersistenceRow = {
  opaqueId: string; category: "RECOGNIZED_RECEIVABLE" | "PROJECTED_RECEIVABLE";
  customerName: string | null; customerIdentificationType: string | null; customerIdentification: string | null;
  reference: string | null; sourceLabel: string; createdOn: Date; dueOn: Date | null; currencyCode: string;
  originalAmount: DecimalValue; appliedAmount: DecimalValue; outstandingAmount: DecimalValue;
  status: "OPEN" | "PARTIALLY_SETTLED"; collectionTiming: "OVERDUE" | "CURRENT" | "FUTURE" | "NO_PROJECTABLE_DATE";
};
type ReceivablePersistenceRow = BasePersistenceRow & { totalItems: number | bigint };
type ReceivableSummaryPersistenceRow = Pick<BasePersistenceRow, "category" | "currencyCode" | "collectionTiming"> & { outstandingAmount: DecimalValue; rowCount: number | bigint };
type ReceivableMonthlyPersistenceRow = Pick<BasePersistenceRow, "category" | "currencyCode"> & { dueMonth: string; outstandingAmount: DecimalValue; rowCount: number | bigint };

function mapRow(row: ReceivablePersistenceRow): ReceivableReportRow {
  const dueOn = row.dueOn ? calendarDate(row.dueOn) : undefined;
  return { opaqueId: row.opaqueId, category: row.category, customer: { name: row.customerName, identificationType: row.customerIdentificationType, identification: row.customerIdentification }, reference: row.reference, sourceLabel: row.sourceLabel, createdOn: calendarDate(row.createdOn), ...(dueOn ? { dueOn } : {}), currencyCode: row.currencyCode, originalAmount: exact(row.originalAmount), appliedAmount: exact(row.appliedAmount), outstandingAmount: exact(row.outstandingAmount), status: row.status, collectionTiming: row.collectionTiming };
}
function exact(value: DecimalValue): string { return value.toFixed(); }
function exactCount(value: number | bigint): number { const count = typeof value === "bigint" ? value : BigInt(value); if (count > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("REPORTING_COUNT_UNSAFE"); return Number(count); }
function calendarDate(value: Date): string { return value.toISOString().slice(0, 10); }
function dateOnly(value: string): Date { return new Date(`${value}T00:00:00.000Z`); }
function defaultWindow(timezone: string): ReceivableReportWindow { const currentOn = currentCalendarDate(timezone); return { currentOn, currentWindowEndOn: currentOn, monthlyStartOn: `${currentOn.slice(0, 7)}-01` }; }
function currentCalendarDate(timezone: string): string {
  try { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value; const year = part("year"), month = part("month"), day = part("day"); if (!year || !month || !day) throw new Error("missing date"); return `${year}-${month}-${day}`; } catch { throw new Error("REPORTING_TIMEZONE_INVALID"); }
}
function assertPage(request: ReceivableReportPageRequest): void { if (!Number.isInteger(request.page) || request.page < 1 || !Number.isInteger(request.pageSize) || request.pageSize < 1) throw new Error("RECEIVABLE_REPORT_PAGE_INVALID"); }
function assertWindow(window: ReceivableReportWindow): void { if ((window.dueDateFrom === undefined) !== (window.dueDateTo === undefined)) throw new Error("RECEIVABLE_REPORT_WINDOW_INVALID"); for (const value of [window.dueDateFrom, window.dueDateTo, window.currentOn, window.currentWindowEndOn, window.monthlyStartOn]) if (value !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("RECEIVABLE_REPORT_WINDOW_INVALID"); if (window.dueDateFrom && window.dueDateTo && window.dueDateFrom > window.dueDateTo) throw new Error("RECEIVABLE_REPORT_WINDOW_INVALID"); }

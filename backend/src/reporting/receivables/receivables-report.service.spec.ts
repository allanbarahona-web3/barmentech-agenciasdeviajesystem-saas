import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ReceivablesReportService } from "./receivables-report.service";

describe("ReceivablesReportService", () => {
  const context = { tenantId: "tenant-a", actorUserId: "user-a", reportKey: "RECEIVABLES" as const, timezone: "UTC" };
  const period = { startOn: "2026-09-16", endOn: "2026-09-16" };
  const read = { window: { currentOn: "2026-09-16", currentWindowEndOn: "2026-09-16", monthlyStartOn: "2026-09-01" } };

  it("keeps the ALL portfolio's overdue, future, null-date, recognized, and contractual balances distinct by currency", async () => {
    const readers = readersWith({
      summary: [
        summary("RECOGNIZED_RECEIVABLE", "USD", "OVERDUE", "10.12345"),
        summary("RECOGNIZED_RECEIVABLE", "USD", "CURRENT", "20"),
        summary("RECOGNIZED_RECEIVABLE", "CRC", "CURRENT", "5"),
        summary("PROJECTED_RECEIVABLE", "USD", "FUTURE", "30.25"),
        summary("PROJECTED_RECEIVABLE", "CRC", "NO_PROJECTABLE_DATE", "40"),
      ],
      page: { items: [row("RECOGNIZED_RECEIVABLE", "OVERDUE"), row("PROJECTED_RECEIVABLE", "FUTURE")], totalItems: 2 },
    });
    const result = await service(readers).execute(context, period, { page: 1, pageSize: 25, read });
    expect(result.currencies).toEqual([
      expect.objectContaining({ currencyCode: "CRC", recognizedOutstanding: "5", projectedOutstanding: "40", noDateProjected: "40" }),
      expect.objectContaining({ currencyCode: "USD", recognizedOutstanding: "30.12345", projectedOutstanding: "30.25", overdueRecognized: "10.12345" }),
    ]);
    expect(result.rows.map((item) => item.category)).toEqual(["RECOGNIZED_RECEIVABLE", "PROJECTED_RECEIVABLE"]);
  });

  it("uses one identical read scope for summary and paginated detail", async () => {
    const readers = readersWith({ summary: [], page: { items: [], totalItems: 0 } });
    const filter = { category: "PROJECTED_RECEIVABLE" as const, currencyCode: "USD", timing: "FUTURE" as const, customerSearch: "Ana" };
    const scopedRead = { ...read, filter };
    const result = await service(readers).execute(context, period, { page: 2, pageSize: 25, read: scopedRead });
    expect(readers.summary.readSummary).toHaveBeenCalledWith(context, scopedRead);
    expect(readers.rows.readPage).toHaveBeenCalledWith(context, expect.objectContaining({ page: 2, pageSize: 25, window: read.window, filter }));
    expect(result).toMatchObject({ reportKey: "RECEIVABLES", currencies: [], rows: [], pagination: { page: 2, pageSize: 25, totalItems: 0, totalPages: 0 } });
  });

  it("remains an adapter-only due-date report with no exposed monthly cashflow", () => {
    const source = readFileSync(join(__dirname, "receivables-report.service.ts"), "utf8");
    for (const forbidden of ["@prisma/client", "AccountReceivable", "CommercialObligation", "BillingInvoice", "findMany", "BillingDocument"]) expect(source).not.toContain(forbidden);
    expect(source).not.toContain("monthlyProjection");
    expect(source).not.toContain("RECEIVABLE_MONTHLY_PROJECTION_READER");
  });
});

function service(readers: ReturnType<typeof readersWith>) { return new ReceivablesReportService(readers.rows as never, readers.summary as never); }
function readersWith(value: { summary: unknown[]; page: unknown }) { return { rows: { readPage: jest.fn().mockResolvedValue(value.page) }, summary: { readSummary: jest.fn().mockResolvedValue(value.summary) } }; }
function summary(category: "RECOGNIZED_RECEIVABLE" | "PROJECTED_RECEIVABLE", currencyCode: string, collectionTiming: "OVERDUE" | "CURRENT" | "FUTURE" | "NO_PROJECTABLE_DATE", outstandingAmount: string) { return { category, currencyCode, collectionTiming, outstandingAmount, rowCount: 1 }; }
function row(category: "RECOGNIZED_RECEIVABLE" | "PROJECTED_RECEIVABLE", collectionTiming: "OVERDUE" | "CURRENT" | "FUTURE" | "NO_PROJECTABLE_DATE") { return { opaqueId: category, category, customer: { name: "Ana", identificationType: "01", identification: "123" }, reference: "REF", sourceLabel: "Fuente", createdOn: "2026-09-01", dueOn: "2026-09-16", currencyCode: "USD", originalAmount: "10", appliedAmount: "0", outstandingAmount: "10", status: "OPEN" as const, collectionTiming }; }

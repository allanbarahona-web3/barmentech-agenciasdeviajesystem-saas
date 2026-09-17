import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FinanceReportingAdapter } from "./finance-reporting.adapter";
import { classifyReceivableTiming } from "../../reporting/core/receivable-timing";

describe("FinanceReportingAdapter", () => {
  const context = { tenantId: "tenant-a", actorUserId: "user-a", reportKey: "RECEIVABLES" as const, timezone: "UTC" };

  it("maps a modern AccountReceivable into a recognized row with exact applied money", async () => {
    const adapter = adapterWith([recognized()]);
    const page = await adapter.readPage(context, { page: 1, pageSize: 25 });
    expect(page).toEqual({ totalItems: 1, items: [expect.objectContaining({
      category: "RECOGNIZED_RECEIVABLE", reference: "FE-001", sourceLabel: "Documento fiscal",
      dueOn: "2099-09-16", originalAmount: "100.12345", appliedAmount: "60.00001", outstandingAmount: "40.12344",
    })] });
  });

  it("maps a Contract commercial obligation into a projected row", async () => {
    const adapter = adapterWith([projected()]);
    const page = await adapter.readPage(context, { page: 1, pageSize: 25 });
    expect(page.items[0]).toEqual(expect.objectContaining({
      category: "PROJECTED_RECEIVABLE", reference: "CT-001", sourceLabel: "Compromiso comercial", dueOn: "2026-12-31", outstandingAmount: "40.12344",
    }));
  });

  it("orders the mixed portfolio newest-first with stable due-date and opaque-id ties", () => {
    const source = readFileSync(join(__dirname, "finance-reporting.adapter.ts"), "utf8");
    expect(source).toContain('filtered."createdOn" DESC, filtered."dueOn" DESC NULLS LAST, filtered."opaqueId" DESC');
    expect(source).not.toContain("CASE filtered.\"collectionTiming\"");
  });

  it("keeps null due dates unprojectable and classifies due dates using tenant current date", async () => {
    const adapter = adapterWith([{ ...projected(), dueOn: null, collectionTiming: "NO_PROJECTABLE_DATE" }]);
    expect((await adapter.readPage(context, { page: 1, pageSize: 25 })).items[0]!.collectionTiming).toBe("NO_PROJECTABLE_DATE");
    expect(classifyReceivableTiming("2026-08-15", "2026-09-16")).toBe("OVERDUE");
    expect(classifyReceivableTiming("2026-09-16", "2026-09-16")).toBe("CURRENT");
    expect(classifyReceivableTiming("2026-09-17", "2026-09-16")).toBe("FUTURE");
  });

  it("keeps null due dates in the ALL portfolio and excludes them from explicit due-date ranges", () => {
    const source = readFileSync(join(__dirname, "finance-reporting.adapter.ts"), "utf8");
    expect(source).toContain(`WHEN rows."dueOn" IS NULL THEN 'NO_PROJECTABLE_DATE'`);
    expect(source).toContain('const dueDateClause = window.dueDateFrom && window.dueDateTo');
    expect(source).toContain('AND classified."dueOn" >= ${dateOnly(window.dueDateFrom)} AND classified."dueOn" <= ${dateOnly(window.dueDateTo)}');
  });

  it("accepts historical report windows while retaining overdue timing", async () => {
    const adapter = adapterWith([{ ...recognized(), dueOn: new Date("2026-08-15T00:00:00.000Z"), collectionTiming: "OVERDUE" }]);
    await expect(adapter.readPage(context, {
      page: 1,
      pageSize: 25,
      window: { dueDateFrom: "2026-08-01", dueDateTo: "2027-02-28", currentOn: "2026-09-16", currentWindowEndOn: "2026-08-31", monthlyStartOn: "2026-09-01" },
    })).resolves.toMatchObject({ items: [expect.objectContaining({ collectionTiming: "OVERDUE" })] });
  });

  it("continues rejecting reversed due-date ranges", async () => {
    const adapter = adapterWith([]);
    await expect(adapter.readPage(context, {
      page: 1,
      pageSize: 25,
      window: { dueDateFrom: "2026-09-30", dueDateTo: "2026-09-01", currentOn: "2026-09-16", currentWindowEndOn: "2026-09-30", monthlyStartOn: "2026-09-01" },
    })).rejects.toThrow("RECEIVABLE_REPORT_WINDOW_INVALID");
  });

  it("uses set-based tenant-scoped authority reads for every qualifying currency and Contract obligation", () => {
    const source = readFileSync(join(__dirname, "finance-reporting.adapter.ts"), "utf8");
    for (const required of [
      'FROM "account_receivables" ar', 'ar."tenantId" = ${context.tenantId}', 'UNION ALL',
      "ar.\"status\" IN ('OPEN', 'PARTIALLY_SETTLED')", 'ar."outstandingAmount" > 0',
      'FROM "commercial_obligations" obligation', 'obligation."tenantId" = ${context.tenantId}',
      "obligation.\"sourceType\" = 'CONTRACT'", "obligation.\"status\" IN ('OPEN', 'PARTIALLY_SETTLED')",
      'INNER JOIN "Client" customer', 'COUNT(*) OVER()', 'CURRENT_RECEIVABLES_ANTI_DOUBLE_COUNTING_POLICY',
      'classified."currencyCode" = ${filter.currencyCode}', 'WHERE 1 = 1', 'COUNT(*) OVER()',
    ]) expect(source).toContain(required);
    for (const forbidden of ["BillingInvoice", "BillingPayment", "BillingCreditNote", 'FROM "billing_documents"', "findMany"]) expect(source).not.toContain(forbidden);
  });

  it("documents that Contract-payment fiscal documents are not a recognized receivable source", () => {
    const source = readFileSync(join(__dirname, "finance-reporting.adapter.ts"), "utf8");
    expect(source).toContain("Contract-payment fiscal documents never enter this adapter");
    expect(source).toContain("explicit provenance link is required");
  });
});

function adapterWith(rows: unknown[]) { return new FinanceReportingAdapter({ $queryRaw: jest.fn().mockResolvedValue(rows) } as never); }
function decimal(value: string) { return { toFixed: () => value }; }
function recognized() { return {
  opaqueId: "ar-a", category: "RECOGNIZED_RECEIVABLE", customerName: "Ana", customerIdentificationType: "01", customerIdentification: "123",
  reference: "FE-001", sourceLabel: "Documento fiscal", createdOn: new Date("2026-09-16T00:00:00.000Z"), dueOn: new Date("2099-09-16T00:00:00.000Z"), currencyCode: "USD",
  originalAmount: decimal("100.12345"), appliedAmount: decimal("60.00001"), outstandingAmount: decimal("40.12344"), status: "OPEN", collectionTiming: "FUTURE", totalItems: 1,
}; }
function projected() { return {
  ...recognized(), opaqueId: "obligation-a", category: "PROJECTED_RECEIVABLE", reference: "CT-001", sourceLabel: "Compromiso comercial", dueOn: new Date("2026-12-31T00:00:00.000Z"), status: "PARTIALLY_SETTLED",
}; }

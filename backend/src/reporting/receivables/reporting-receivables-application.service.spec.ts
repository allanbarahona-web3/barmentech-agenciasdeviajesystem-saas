import { UserRole } from "@prisma/client";
import { ReportingReceivablesApplicationService } from "./reporting-receivables-application.service";

describe("ReportingReceivablesApplicationService", () => {
  it("uses ALL as the complete outstanding portfolio without a due-date predicate", async () => {
    const execute = jest.fn().mockResolvedValue({ reportKey: "RECEIVABLES" });
    await application(execute).execute(request({ preset: "ALL" }));
    expect(execute).toHaveBeenCalledWith(expect.anything(), { startOn: "2026-09-16", endOn: "2026-09-16" }, expect.objectContaining({ read: { window: { currentOn: "2026-09-16", currentWindowEndOn: "2026-09-16", monthlyStartOn: "2026-09-01" } } }));
  });

  it.each([
    ["OVERDUE", { preset: "OVERDUE" }, { dueDateFrom: "0001-01-01", dueDateTo: "2026-09-15" }],
    ["DUE_TODAY", { preset: "DUE_TODAY" }, { dueDateFrom: "2026-09-16", dueDateTo: "2026-09-16" }],
    ["NEXT_7_DAYS", { preset: "NEXT_7_DAYS" }, { dueDateFrom: "2026-09-16", dueDateTo: "2026-09-23" }],
    ["NEXT_15_DAYS", { preset: "NEXT_15_DAYS" }, { dueDateFrom: "2026-09-16", dueDateTo: "2026-10-01" }],
    ["CURRENT_MONTH", { preset: "CURRENT_MONTH" }, { dueDateFrom: "2026-09-01", dueDateTo: "2026-09-30" }],
    ["CUSTOM", { preset: "CUSTOM", dateFrom: "2026-08-01", dateTo: "2026-08-31" }, { dueDateFrom: "2026-08-01", dueDateTo: "2026-08-31" }],
  ] as const)("scopes %s to its due-date range", async (_, dueDate, expectedWindow) => {
    const execute = jest.fn().mockResolvedValue({ reportKey: "RECEIVABLES" });
    await application(execute).execute(request(dueDate));
    expect(execute.mock.calls[0]![2].read.window).toMatchObject({ ...expectedWindow, currentOn: "2026-09-16", currentWindowEndOn: "2026-09-16" });
  });
});

function application(execute: jest.Mock) {
  return new ReportingReceivablesApplicationService(
    { tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "UTC" }) } } as never,
    { createReadContext: jest.fn((identity, reportKey) => ({ ...identity, reportKey })) } as never,
    { resolve: jest.fn(() => ({ startOn: "2026-09-16", endOn: "2026-09-16" })) } as never,
    { execute } as never,
  );
}

function request(dueDate: { preset: "ALL" | "OVERDUE" | "DUE_TODAY" | "NEXT_7_DAYS" | "NEXT_15_DAYS" | "CURRENT_MONTH" } | { preset: "CUSTOM"; dateFrom: string; dateTo: string }) {
  return { tenantId: "tenant-a", actorUserId: "user-a", role: UserRole.ADMIN, dueDate, page: 1, pageSize: 25 };
}

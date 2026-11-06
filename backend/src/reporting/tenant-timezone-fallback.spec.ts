import { UserRole } from "@prisma/client";
import {
  DEFAULT_TENANT_TIME_ZONE,
  resolveTenantTimeZone,
} from "../common/utils/tenant-timezone";
import { ReportingPeriodResolver } from "./period/reporting-period.resolver";
import { AccountingCostsService } from "./accounting-costs/accounting-costs.service";
import { ReportingReceivablesApplicationService } from "./receivables/reporting-receivables-application.service";
import { ReportingSalesApplicationService } from "./sales/reporting-sales-application.service";
import { ReportingSalesTaxApplicationService } from "./sales-tax/reporting-sales-tax-application.service";

describe("reporting tenant timezone fallback", () => {
  it.each([
    [null, DEFAULT_TENANT_TIME_ZONE],
    ["America/Costa_Rica", "America/Costa_Rica"],
    ["America/Lima", "America/Lima"],
    ["America/Argentina/Buenos_Aires", "America/Argentina/Buenos_Aires"],
    ["UTC", "UTC"],
  ] as const)("uses %s as %s across reporting readers", async (stored, expected) => {
    const billing = billingConfiguration(stored);
    const access = {
      createReadContext: jest.fn((identity, reportKey) => ({ ...identity, reportKey })),
    };
    const periods = {
      resolve: jest.fn(() => ({ startOn: "2026-09-19", endOn: "2026-09-19" })),
    };
    const sales = { execute: jest.fn().mockResolvedValue({ reportKey: "SALES" }) };
    const salesTax = { execute: jest.fn().mockResolvedValue({ reportKey: "SALES_TAX" }) };
    const receivables = { execute: jest.fn().mockResolvedValue({ reportKey: "RECEIVABLES" }) };
    const accountingSource = {
      sourceType: "OPERATIONAL_PURCHASE" as const,
      readPage: jest.fn().mockResolvedValue({ items: [], totalItems: 0 }),
      readSummary: jest.fn().mockResolvedValue([]),
    };
    const fx = { projectRows: jest.fn().mockResolvedValue([]) };

    await new ReportingSalesApplicationService(
      { tenantBillingConfiguration: billing } as never,
      access as never,
      periods as never,
      sales as never,
    ).execute(salesRequest());
    await new ReportingSalesTaxApplicationService(
      { tenantBillingConfiguration: billing } as never,
      access as never,
      periods as never,
      salesTax as never,
    ).execute(salesRequest());
    await new ReportingReceivablesApplicationService(
      { tenantBillingConfiguration: billing } as never,
      access as never,
      periods as never,
      receivables as never,
    ).execute(receivablesRequest());
    const accounting = await new AccountingCostsService(
      { tenantBillingConfiguration: billing } as never,
      access as never,
      periods as never,
      accountingSource as never,
      fx as never,
    ).execute({
      tenantId: "tenant-a",
      actorUserId: "user-a",
      role: UserRole.CONTADOR,
      period: { kind: "TODAY" },
      read: { page: 1, pageSize: 20 },
    });

    expect(sales.execute).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: expected }),
      expect.anything(),
      expect.anything(),
    );
    expect(salesTax.execute).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: expected }),
      expect.anything(),
      expect.anything(),
    );
    expect(receivables.execute).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: expected }),
      expect.anything(),
      expect.anything(),
    );
    expect(accounting.timezone).toBe(expected);
    expect(billing.upsert).not.toHaveBeenCalled();
    expect(billing.update).not.toHaveBeenCalled();
    expect(billing.create).not.toHaveBeenCalled();
  });

  it("projects report day boundaries from the resolved timezone, not UTC fallback", () => {
    const instant = new Date("2026-09-20T03:30:00.000Z");
    const periods = new ReportingPeriodResolver();

    expect(periods.resolve({ kind: "TODAY" }, resolveTenantTimeZone(null), instant))
      .toEqual({ startOn: "2026-09-19", endOn: "2026-09-19" });
    expect(periods.resolve({ kind: "TODAY" }, resolveTenantTimeZone("America/Lima"), instant))
      .toEqual({ startOn: "2026-09-19", endOn: "2026-09-19" });
    expect(periods.resolve({ kind: "TODAY" }, resolveTenantTimeZone("America/Argentina/Buenos_Aires"), instant))
      .toEqual({ startOn: "2026-09-20", endOn: "2026-09-20" });
    expect(periods.resolve({ kind: "TODAY" }, resolveTenantTimeZone("UTC"), instant))
      .toEqual({ startOn: "2026-09-20", endOn: "2026-09-20" });
  });

  it("preserves invalid stored values for the existing reader-level compatibility behavior", () => {
    expect(resolveTenantTimeZone("legacy/invalid")).toBe("legacy/invalid");
    expect(resolveTenantTimeZone("")).toBe("");
  });
});

function billingConfiguration(fiscalTimezone: string | null) {
  return {
    findUnique: jest.fn().mockResolvedValue(
      fiscalTimezone === null ? null : { fiscalTimezone, accountingCurrencyCode: null },
    ),
    upsert: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
}

function salesRequest() {
  return {
    tenantId: "tenant-a",
    actorUserId: "user-a",
    role: UserRole.ADMIN,
    period: { kind: "TODAY" as const },
    page: 1,
    pageSize: 20,
  };
}

function receivablesRequest() {
  return {
    tenantId: "tenant-a",
    actorUserId: "user-a",
    role: UserRole.ADMIN,
    dueDate: { preset: "ALL" as const },
    page: 1,
    pageSize: 20,
  };
}

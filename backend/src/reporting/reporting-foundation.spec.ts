import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ReportingAccessPolicy } from "./access/reporting-access-policy";
import { ReportingCoreService } from "./core/reporting-core.service";
import { ReportingPeriodResolver } from "./period/reporting-period.resolver";

describe("Reporting foundation", () => {
  const identity = {
    tenantId: "tenant-a",
    actorUserId: "user-a",
    role: UserRole.ADMIN,
    timezone: "America/Guatemala",
  };

  it("keeps generic contracts and core free of travel and fiscal adapter imports", () => {
    const contracts = readFileSync(join(__dirname, "contracts", "reporting.contracts.ts"), "utf8");
    const receivables = readFileSync(join(__dirname, "contracts", "receivables-reporting.contracts.ts"), "utf8");
    const core = readFileSync(join(__dirname, "core", "reporting-core.service.ts"), "utf8");
    for (const forbidden of ["Contract", "TravelPackage", "Reservation", "AdditionalService", "CustomerProfile", "@prisma/client", "fiscal-billing", "reporting-adapters"]) {
      expect(contracts).not.toContain(forbidden);
      expect(receivables).not.toContain(forbidden);
      expect(core).not.toContain(forbidden);
    }
  });

  it.each(["SALES", "SALES_TAX", "RECEIVABLES"] as const)("allows ADMIN and CONTADOR to read %s", (reportKey) => {
    const policy = new ReportingAccessPolicy();
    for (const role of [UserRole.ADMIN, UserRole.CONTADOR]) {
      expect(policy.createReadContext({ ...identity, role }, reportKey)).toMatchObject({
        tenantId: "tenant-a",
        actorUserId: "user-a",
        reportKey,
      });
    }
  });

  it.each([UserRole.FACTURACION_COBROS, UserRole.OPERACIONES, UserRole.AGENT])("denies non-reporting role %s", (role) => {
    expect(() => new ReportingAccessPolicy().createReadContext({ ...identity, role }, "SALES")).toThrow(ForbiddenException);
    expect(() => new ReportingAccessPolicy().createReadContext({ ...identity, role }, "RECEIVABLES")).toThrow(ForbiddenException);
  });

  it("requires authenticated tenant context before report execution", async () => {
    const policy = new ReportingAccessPolicy();
    expect(() => policy.createReadContext({ ...identity, tenantId: "" }, "SALES")).toThrow(ForbiddenException);

    const core = new ReportingCoreService();
    await expect(core.readDocuments({ readDocuments: jest.fn() } as never, {
      tenantId: "",
      actorUserId: "user-a",
      reportKey: "SALES",
      timezone: "America/Guatemala",
    }, { startOn: "2026-02-01", endOn: "2026-02-28" })).rejects.toThrow("REPORTING_EXECUTION_CONTEXT_INVALID");
  });

  it("resolves periods in tenant timezone and validates custom periods", () => {
    const resolver = new ReportingPeriodResolver();
    const now = new Date("2026-03-01T01:30:00.000Z");
    expect(resolver.resolve({ kind: "TODAY" }, "America/Guatemala", now)).toEqual({
      startOn: "2026-02-28",
      endOn: "2026-02-28",
    });
    expect(resolver.resolve({ kind: "LAST_7_DAYS" }, "America/Guatemala", now)).toEqual({
      startOn: "2026-02-22",
      endOn: "2026-02-28",
    });
    expect(resolver.resolve({ kind: "CUSTOM", startOn: "2026-02-02", endOn: "2026-02-11" }, "America/Guatemala", now)).toEqual({
      startOn: "2026-02-02",
      endOn: "2026-02-11",
    });
    expect(() => resolver.resolve({ kind: "CUSTOM", startOn: "2026-02-30", endOn: "2026-03-01" }, "America/Guatemala", now)).toThrow("REPORTING_CUSTOM_PERIOD_INVALID");
    expect(() => resolver.resolve({ kind: "CUSTOM", startOn: "2026-03-02", endOn: "2026-03-01" }, "America/Guatemala", now)).toThrow("REPORTING_CUSTOM_PERIOD_INVALID");
  });
});

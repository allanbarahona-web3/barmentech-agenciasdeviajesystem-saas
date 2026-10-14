import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Prisma, UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { parseAdminDashboardPeriod } from "./admin-dashboard-query.dto";
import { AdminDashboardService } from "./admin-dashboard.service";

const decimal = (value: string) => new Prisma.Decimal(value);
const now = new Date("2026-10-13T03:30:00.000Z");

describe("AdminDashboardService", () => {
  it("accepts the bounded dashboard period contract without accepting an unbounded history", () => {
    expect(parseAdminDashboardPeriod({ period: "LAST_30_DAYS" })).toEqual({ kind: "LAST_30_DAYS", selection: { kind: "LAST_30_DAYS" } });
    expect(parseAdminDashboardPeriod({ period: "THIS_MONTH" })).toEqual({ kind: "THIS_MONTH", selection: { kind: "CURRENT_MONTH" } });
    expect(parseAdminDashboardPeriod({ period: "CUSTOM", dateFrom: "2026-10-01", dateTo: "2026-10-12" })).toEqual({ kind: "CUSTOM", selection: { kind: "CUSTOM", startOn: "2026-10-01", endOn: "2026-10-12" } });
    expect(() => parseAdminDashboardPeriod({ period: "ALL" })).toThrow("ADMIN_DASHBOARD_PERIOD_INVALID");
  });

  it("projects only tenant-scoped modern authorities with tenant-local dates and currency groups", async () => {
    const prisma = dashboardPrisma();
    const costs = {
      execute: jest.fn().mockResolvedValue({
        summaries: {
          byCurrency: [
            { currency: "CRC", count: 1, subtotal: "250", tax: "32.5", total: "282.5" },
            { currency: "USD", count: 2, subtotal: "19", tax: "1", total: "20" },
          ],
        },
      }),
    };
    const result = await new AdminDashboardService(prisma as never, costs as never).execute(request(), now);

    expect(result.period).toEqual({ kind: "TODAY", startOn: "2026-10-12", endOn: "2026-10-12", timezone: "America/Costa_Rica" });
    expect(result.receivables).toEqual({
      outstandingByCurrency: [{ currencyCode: "CRC", amount: "500", count: 1 }, { currencyCode: "USD", amount: "20", count: 2 }],
      overdueByCurrency: [{ currencyCode: "CRC", amount: "125", count: 1 }, { currencyCode: "USD", amount: "12.5", count: 1 }],
      openCount: 3,
      overdueCount: 2,
    });
    expect(result.payments).toEqual({
      receivedByCurrency: [{ currencyCode: "CRC", amount: "1200", count: 1 }, { currencyCode: "USD", amount: "17.25", count: 2 }],
      receivedCount: 3,
      pendingVerificationCount: 4,
    });
    expect(result.fiscal).toEqual({
      submittedDocumentCount: 5,
      acceptedDocumentCount: 3,
      netSalesByCurrency: [
        { currencyCode: "CRC", amount: "1000.00001" },
        { currencyCode: "USD", amount: "137.62345" },
      ],
    });
    expect(result.dailyPayments).toEqual([
      { date: "2026-10-12", currencyCode: "CRC", amount: "1200", paymentCount: 1 },
      { date: "2026-10-12", currencyCode: "USD", amount: "17.25", paymentCount: 2 },
    ]);
    expect(result.sales).toEqual({
      orderCount: 3,
      totalByCurrency: [{ currencyCode: "CRC", amount: "10000", count: 1 }, { currencyCode: "USD", amount: "300", count: 2 }],
    });
    expect(result.commercial).toEqual({
      contractedSales: {
        obligationCount: 4,
        totalByCurrency: [{ currencyCode: "CRC", amount: "10000", count: 1 }, { currencyCode: "USD", amount: "100", count: 3 }],
      },
      averageContractTicketByCurrency: [
        { currencyCode: "CRC", amount: "10000.00000", obligationCount: 1 },
        { currencyCode: "USD", amount: "33.33333", obligationCount: 3 },
      ],
      passengerTrend: [
        { month: "2025-11", passengerCount: 2 },
        { month: "2025-12", passengerCount: 0 },
        { month: "2026-01", passengerCount: 0 },
        { month: "2026-02", passengerCount: 0 },
        { month: "2026-03", passengerCount: 0 },
        { month: "2026-04", passengerCount: 0 },
        { month: "2026-05", passengerCount: 0 },
        { month: "2026-06", passengerCount: 0 },
        { month: "2026-07", passengerCount: 0 },
        { month: "2026-08", passengerCount: 0 },
        { month: "2026-09", passengerCount: 0 },
        { month: "2026-10", passengerCount: 3 },
      ],
    });
    expect(result.operations).toEqual({ activeTripsCount: 2, activePassengersCount: 4 });
    expect(result.topOverdueCustomers).toEqual([
      { customerId: "customer-a", customerName: "Ana", currencyCode: "USD", outstandingAmount: "12.5", receivableCount: 1, rank: 1 },
    ]);
    expect(result.operationalCosts.actualByCurrency).toEqual([
      { currencyCode: "CRC", purchaseCount: 1, subtotal: "250", tax: "32.5", total: "282.5" },
      { currencyCode: "USD", purchaseCount: 2, subtotal: "19", tax: "1", total: "20" },
    ]);

    expect(prisma.accountReceivable.groupBy).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-a", status: { in: ["OPEN", "PARTIALLY_SETTLED"] } }) }));
    expect(prisma.accountReceivable.groupBy).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-a", dueDate: { lt: new Date("2026-10-12T06:00:00.000Z") } }) }));
    expect(prisma.payment.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-a", status: { in: ["RECEIVED", "PARTIALLY_ALLOCATED", "FULLY_ALLOCATED"] } }) }));
    expect(prisma.payment.count).toHaveBeenCalledWith({ where: { tenantId: "tenant-a", status: "PENDING_VERIFICATION" } });
    expect(prisma.billingDocument.count).toHaveBeenNthCalledWith(1, { where: expect.objectContaining({ tenantId: "tenant-a", lifecycleStatus: "SUBMITTED" }) });
    expect(prisma.billingDocument.count).toHaveBeenNthCalledWith(2, { where: expect.objectContaining({ tenantId: "tenant-a", taxAuthorityStatus: "ACCEPTED" }) });
    expect(prisma.billingDocument.groupBy).toHaveBeenCalledWith({
      by: ["currencyCode", "documentTypeCode"],
      where: {
        tenantId: "tenant-a",
        taxAuthorityStatus: "ACCEPTED",
        fiscalIssueDate: { gte: new Date("2026-10-12T00:00:00.000Z"), lte: new Date("2026-10-12T00:00:00.000Z") },
        documentTypeCode: { in: ["01", "03", "04"] },
      },
      _sum: { total: true },
    });
    expect(prisma.salesOrder.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-a" }) }));
    expect(costs.execute).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a", role: UserRole.ADMIN, period: { kind: "TODAY" }, read: { page: 1, pageSize: 1, filter: { sourceType: "OPERATIONAL_PURCHASE" } } }));

    const dailySql = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: readonly unknown[] };
    const contractedSalesSql = prisma.$queryRaw.mock.calls[1][0] as { strings: readonly string[]; values: readonly unknown[] };
    const passengerTrendSql = prisma.$queryRaw.mock.calls[2][0] as { strings: readonly string[]; values: readonly unknown[] };
    const activePassengersSql = prisma.$queryRaw.mock.calls[3][0] as { strings: readonly string[]; values: readonly unknown[] };
    const topSql = prisma.$queryRaw.mock.calls[4][0] as { strings: readonly string[]; values: readonly unknown[] };
    expect(dailySql.strings.join(" ")).toContain("AT TIME ZONE");
    expect(dailySql.values).toContain("America/Costa_Rica");
    expect(dailySql.values).toContain("tenant-a");
    expect(topSql.values).toContain("tenant-a");
    expect(topSql.strings.join(" ")).toContain("PARTITION BY \"currencyCode\"");
    expect(contractedSalesSql.values).toContain("tenant-a");
    expect(contractedSalesSql.strings.join(" ")).toContain('obligation."sourceType" = \'CONTRACT\'');
    expect(contractedSalesSql.strings.join(" ")).toContain('obligation."originalAmount"');
    expect(contractedSalesSql.strings.join(" ")).toContain('contract."cancelledAt" IS NULL');
    expect(contractedSalesSql.strings.join(" ")).toContain('contract."status" <> \'CANCELLED\'');
    expect(contractedSalesSql.strings.join(" ")).not.toContain("SalesOrder");
    expect(contractedSalesSql.strings.join(" ")).not.toContain("BillingDocument");
    expect(passengerTrendSql.values).toContain("tenant-a");
    expect(passengerTrendSql.values).toContain("America/Costa_Rica");
    expect(passengerTrendSql.strings.join(" ")).toContain("COUNT(DISTINCT (source.\"contractId\", source.\"travelPackageParticipantId\"))");
    expect(passengerTrendSql.strings.join(" ")).toContain("AT TIME ZONE");
    expect(passengerTrendSql.strings.join(" ")).not.toContain('contract."cancelledAt"');
    expect(passengerTrendSql.strings.join(" ")).not.toContain('source."sourceRole"');
    expect(prisma.travelPackage.count).toHaveBeenCalledWith({ where: { tenantId: "tenant-a", status: "OPEN" } });
    expect(activePassengersSql.values).toContain("tenant-a");
    expect(activePassengersSql.strings.join(" ")).toContain('COUNT(DISTINCT participant."id")');
    expect(activePassengersSql.strings.join(" ")).toContain('travel_package."status" = \'OPEN\'');
    expect(activePassengersSql.strings.join(" ")).toContain('obligation."sourceType" = \'CONTRACT\'');
    expect(activePassengersSql.strings.join(" ")).toContain('contract."cancelledAt" IS NULL');
    expect(activePassengersSql.strings.join(" ")).not.toContain('participant."role"');
    expect(activePassengersSql.strings.join(" ")).not.toContain("InternalTrip");
    expect(activePassengersSql.strings.join(" ")).not.toContain("OperationalFulfillment");
  });

  it("keeps all tenant B values out of tenant A query predicates", async () => {
    const prisma = dashboardPrisma();
    const costs = accountingCosts();
    await new AdminDashboardService(prisma as never, costs as never).execute(request(), now);

    for (const call of prisma.accountReceivable.groupBy.mock.calls) {
      expect(call[0].where.tenantId).toBe("tenant-a");
    }
    expect(prisma.payment.groupBy.mock.calls[0][0].where.tenantId).toBe("tenant-a");
    expect(prisma.payment.count.mock.calls[0][0].where.tenantId).toBe("tenant-a");
    for (const call of prisma.billingDocument.count.mock.calls) {
      expect(call[0].where.tenantId).toBe("tenant-a");
    }
    expect(prisma.billingDocument.groupBy.mock.calls[0][0].where.tenantId).toBe("tenant-a");
    expect(prisma.salesOrder.groupBy.mock.calls[0][0].where.tenantId).toBe("tenant-a");
    expect(prisma.travelPackage.count.mock.calls[0][0].where.tenantId).toBe("tenant-a");
    for (const call of prisma.$queryRaw.mock.calls) {
      expect((call[0] as { values: readonly unknown[] }).values).toContain("tenant-a");
    }
    expect(costs.execute).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a" }));
  });

  it("keeps the endpoint ADMIN-only behind JWT and Roles guards", () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminDashboardController)).toBe("reporting/admin-dashboard");
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminDashboardController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, AdminDashboardController)).toEqual([UserRole.ADMIN]);
  });

  it("derives the dashboard tenant only from the authenticated request", async () => {
    const dashboard = { execute: jest.fn().mockResolvedValue({ period: {} }) };
    const controller = new AdminDashboardController(dashboard as never);
    await controller.getDashboard(
      { user: { id: "user-a", tenantId: "tenant-a", role: UserRole.ADMIN } },
      { period: "TODAY" },
    );
    expect(dashboard.execute).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      actorUserId: "user-a",
      role: UserRole.ADMIN,
      period: { kind: "TODAY", selection: { kind: "TODAY" } },
    });
  });
});

function request() {
  return { tenantId: "tenant-a", actorUserId: "user-a", role: UserRole.ADMIN, period: { kind: "TODAY" as const, selection: { kind: "TODAY" as const } } };
}

function accountingCosts() {
  return { execute: jest.fn().mockResolvedValue({ summaries: { byCurrency: [] } }) };
}

function dashboardPrisma() {
  return {
    tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) },
    accountReceivable: {
      groupBy: jest.fn()
        .mockResolvedValueOnce([
          { currencyCode: "USD", _sum: { outstandingAmount: decimal("20") }, _count: { id: 2 } },
          { currencyCode: "CRC", _sum: { outstandingAmount: decimal("500") }, _count: { id: 1 } },
        ])
        .mockResolvedValueOnce([
          { currencyCode: "USD", _sum: { outstandingAmount: decimal("12.5") }, _count: { id: 1 } },
          { currencyCode: "CRC", _sum: { outstandingAmount: decimal("125") }, _count: { id: 1 } },
        ]),
    },
    payment: {
      groupBy: jest.fn().mockResolvedValue([
        { currencyCode: "USD", _sum: { receivedAmount: decimal("17.25") }, _count: { id: 2 } },
        { currencyCode: "CRC", _sum: { receivedAmount: decimal("1200") }, _count: { id: 1 } },
      ]),
      count: jest.fn().mockResolvedValue(4),
    },
    billingDocument: {
      count: jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(3),
      groupBy: jest.fn().mockResolvedValue([
        { currencyCode: "USD", documentTypeCode: "01", _sum: { total: decimal("100.12345") } },
        { currencyCode: "USD", documentTypeCode: "04", _sum: { total: decimal("50") } },
        { currencyCode: "USD", documentTypeCode: "03", _sum: { total: decimal("12.5") } },
        { currencyCode: "CRC", documentTypeCode: "01", _sum: { total: decimal("1000.00001") } },
      ]),
    },
    salesOrder: {
      groupBy: jest.fn().mockResolvedValue([
        { currency: "USD", _sum: { total: decimal("300") }, _count: { id: 2 } },
        { currency: "CRC", _sum: { total: decimal("10000") }, _count: { id: 1 } },
      ]),
    },
    travelPackage: { count: jest.fn().mockResolvedValue(2) },
    $queryRaw: jest.fn()
      .mockResolvedValueOnce([
        { date: "2026-10-12", currencyCode: "CRC", amount: decimal("1200"), paymentCount: 1n },
        { date: "2026-10-12", currencyCode: "USD", amount: decimal("17.25"), paymentCount: 2n },
      ])
      .mockResolvedValueOnce([
        { currencyCode: "CRC", amount: decimal("10000"), obligationCount: 1n },
        { currencyCode: "USD", amount: decimal("100"), obligationCount: 3n },
      ])
      .mockResolvedValueOnce([
        { month: "2025-11", passengerCount: 2n },
        { month: "2026-10", passengerCount: 3n },
      ])
      .mockResolvedValueOnce([
        { activePassengersCount: 4n },
      ])
      .mockResolvedValueOnce([
        { customerId: "customer-a", customerName: "Ana", currencyCode: "USD", outstandingAmount: decimal("12.5"), receivableCount: 1n, rank: 1n },
      ]),
  };
}

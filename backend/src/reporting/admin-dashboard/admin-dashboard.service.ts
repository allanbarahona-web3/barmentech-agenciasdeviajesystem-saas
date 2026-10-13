import { Injectable } from "@nestjs/common";
import {
  AccountReceivableStatus,
  BillingDocumentLifecycleStatus,
  BillingTaxAuthorityStatus,
  PaymentStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import { DEFAULT_FISCAL_TIMEZONE, nextTenantCalendarDate, tenantCalendarDateStartAsUtc } from "../../finance/tenant-fiscal-date";
import { PrismaService } from "../../prisma/prisma.service";
import { AccountingCostsService } from "../accounting-costs/accounting-costs.service";
import { ReportingPeriodResolver } from "../period/reporting-period.resolver";
import type { AdminDashboardPeriodKind } from "./admin-dashboard-query.dto";
import type { AdminDashboardResponse } from "./admin-dashboard.types";

const OPEN_RECEIVABLE_STATUSES = [AccountReceivableStatus.OPEN, AccountReceivableStatus.PARTIALLY_SETTLED] as const;
const RECEIVED_PAYMENT_STATUSES = [PaymentStatus.RECEIVED, PaymentStatus.PARTIALLY_ALLOCATED, PaymentStatus.FULLY_ALLOCATED] as const;
const TOP_OVERDUE_PER_CURRENCY = 10;

type Request = {
  tenantId: string;
  actorUserId: string;
  role: UserRole;
  period: { kind: AdminDashboardPeriodKind; selection: Parameters<ReportingPeriodResolver["resolve"]>[0] };
};

type DailyPaymentRow = { date: string; currencyCode: string; amount: Prisma.Decimal | string | null; paymentCount: bigint | number };
type TopOverdueCustomerRow = { customerId: string; customerName: string; currencyCode: string; outstandingAmount: Prisma.Decimal | string | null; receivableCount: bigint | number; rank: bigint | number };

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingCosts: AccountingCostsService,
    private readonly periods: ReportingPeriodResolver = new ReportingPeriodResolver(),
  ) {}

  async execute(request: Request, now = new Date()): Promise<AdminDashboardResponse> {
    const configuration = await this.prisma.tenantBillingConfiguration.findUnique({
      where: { tenantId: request.tenantId },
      select: { fiscalTimezone: true },
    });
    const timezone = configuration?.fiscalTimezone ?? DEFAULT_FISCAL_TIMEZONE;
    const period = this.periods.resolve(request.period.selection, timezone, now);
    const start = tenantCalendarDateStartAsUtc(period.startOn, timezone);
    const end = tenantCalendarDateStartAsUtc(nextTenantCalendarDate(period.endOn), timezone);
    const tenantToday = tenantCalendarDateStartAsUtc(
      this.periods.resolve({ kind: "TODAY" }, timezone, now).endOn,
      timezone,
    );

    const openReceivablesWhere = {
      tenantId: request.tenantId,
      status: { in: [...OPEN_RECEIVABLE_STATUSES] },
    } satisfies Prisma.AccountReceivableWhereInput;
    const overdueReceivablesWhere = {
      ...openReceivablesWhere,
      dueDate: { lt: tenantToday },
    } satisfies Prisma.AccountReceivableWhereInput;
    const receivedPaymentsWhere = {
      tenantId: request.tenantId,
      status: { in: [...RECEIVED_PAYMENT_STATUSES] },
      receivedAt: { gte: start, lt: end },
    } satisfies Prisma.PaymentWhereInput;

    const [outstandingRows, overdueRows, paymentRows, dailyPayments, pendingVerificationCount, submittedDocumentCount, acceptedDocumentCount, salesRows, topOverdueCustomers, costs] = await Promise.all([
      this.prisma.accountReceivable.groupBy({ by: ["currencyCode"], where: openReceivablesWhere, _sum: { outstandingAmount: true }, _count: { id: true } }),
      this.prisma.accountReceivable.groupBy({ by: ["currencyCode"], where: overdueReceivablesWhere, _sum: { outstandingAmount: true }, _count: { id: true } }),
      this.prisma.payment.groupBy({ by: ["currencyCode"], where: receivedPaymentsWhere, _sum: { receivedAmount: true }, _count: { id: true } }),
      this.dailyPayments(request.tenantId, timezone, start, end),
      this.prisma.payment.count({ where: { tenantId: request.tenantId, status: PaymentStatus.PENDING_VERIFICATION } }),
      this.prisma.billingDocument.count({ where: { tenantId: request.tenantId, lifecycleStatus: BillingDocumentLifecycleStatus.SUBMITTED, submittedAt: { gte: start, lt: end } } }),
      this.prisma.billingDocument.count({ where: { tenantId: request.tenantId, taxAuthorityStatus: BillingTaxAuthorityStatus.ACCEPTED, taxAuthorityFinalizedAt: { gte: start, lt: end } } }),
      this.prisma.salesOrder.groupBy({ by: ["currency"], where: { tenantId: request.tenantId, createdAt: { gte: start, lt: end } }, _sum: { total: true }, _count: { id: true } }),
      this.topOverdueCustomers(request.tenantId, tenantToday),
      this.accountingCosts.execute({ tenantId: request.tenantId, actorUserId: request.actorUserId, role: request.role, period: request.period.selection, read: { page: 1, pageSize: 1, filter: { sourceType: "OPERATIONAL_PURCHASE" } } }),
    ]);

    return {
      period: { kind: request.period.kind, startOn: period.startOn, endOn: period.endOn, timezone },
      receivables: {
        outstandingByCurrency: currencyAmounts(outstandingRows, "currencyCode", "outstandingAmount"),
        overdueByCurrency: currencyAmounts(overdueRows, "currencyCode", "outstandingAmount"),
        openCount: countRows(outstandingRows),
        overdueCount: countRows(overdueRows),
      },
      payments: {
        receivedByCurrency: currencyAmounts(paymentRows, "currencyCode", "receivedAmount"),
        receivedCount: countRows(paymentRows),
        pendingVerificationCount,
      },
      fiscal: { submittedDocumentCount, acceptedDocumentCount },
      sales: {
        orderCount: countRows(salesRows),
        totalByCurrency: currencyAmounts(salesRows, "currency", "total"),
      },
      operationalCosts: {
        actualByCurrency: costs.summaries.byCurrency.map((summary) => ({
          currencyCode: summary.currency,
          purchaseCount: summary.count,
          subtotal: summary.subtotal,
          tax: summary.tax,
          total: summary.total,
        })),
      },
      dailyPayments: dailyPayments.map((row) => ({
        date: row.date,
        currencyCode: row.currencyCode,
        amount: decimalString(row.amount),
        paymentCount: safeCount(row.paymentCount),
      })),
      topOverdueCustomers: topOverdueCustomers.map((row) => ({
        customerId: row.customerId,
        customerName: row.customerName,
        currencyCode: row.currencyCode,
        outstandingAmount: decimalString(row.outstandingAmount),
        receivableCount: safeCount(row.receivableCount),
        rank: safeCount(row.rank),
      })),
    };
  }

  private dailyPayments(tenantId: string, timezone: string, start: Date, end: Date) {
    return this.prisma.$queryRaw<DailyPaymentRow[]>(Prisma.sql`
      SELECT
        to_char((payment."receivedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS "date",
        payment."currencyCode" AS "currencyCode",
        SUM(payment."receivedAmount") AS "amount",
        COUNT(*)::bigint AS "paymentCount"
      FROM "payments" payment
      WHERE payment."tenantId" = ${tenantId}
        AND payment."receivedAt" >= ${start}
        AND payment."receivedAt" < ${end}
        AND payment."status" IN ('RECEIVED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED')
      GROUP BY "date", payment."currencyCode"
      ORDER BY "date" ASC, payment."currencyCode" ASC
    `);
  }

  private topOverdueCustomers(tenantId: string, tenantToday: Date) {
    return this.prisma.$queryRaw<TopOverdueCustomerRow[]>(Prisma.sql`
      WITH grouped AS (
        SELECT
          receivable."customerId" AS "customerId",
          MAX(receivable."debtorDisplayName") AS "customerName",
          receivable."currencyCode" AS "currencyCode",
          SUM(receivable."outstandingAmount") AS "outstandingAmount",
          COUNT(*)::bigint AS "receivableCount"
        FROM "account_receivables" receivable
        WHERE receivable."tenantId" = ${tenantId}
          AND receivable."customerId" IS NOT NULL
          AND receivable."status" IN ('OPEN', 'PARTIALLY_SETTLED')
          AND receivable."dueDate" < ${tenantToday}
        GROUP BY receivable."customerId", receivable."currencyCode"
      ), ranked AS (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY "currencyCode"
          ORDER BY "outstandingAmount" DESC, "customerId" ASC
        ) AS "rank"
        FROM grouped
      )
      SELECT "customerId", "customerName", "currencyCode", "outstandingAmount", "receivableCount", "rank"
      FROM ranked
      WHERE "rank" <= ${TOP_OVERDUE_PER_CURRENCY}
      ORDER BY "currencyCode" ASC, "rank" ASC, "customerId" ASC
    `);
  }
}

function currencyAmounts(
  rows: readonly unknown[],
  currencyKey: string,
  amountKey: string,
) {
  return rows
    .map((row) => {
      const grouped = row as Record<string, unknown> & {
        _sum: Record<string, Prisma.Decimal | string | null>;
        _count: { id: number };
      };
      return {
        currencyCode: String(grouped[currencyKey]),
        amount: decimalString(grouped._sum[amountKey]),
        count: safeCount(grouped._count.id),
      };
    })
    .sort((left, right) => left.currencyCode.localeCompare(right.currencyCode));
}

function countRows(rows: readonly { _count: { id: number } }[]): number {
  return rows.reduce((total, row) => total + row._count.id, 0);
}

function decimalString(value: Prisma.Decimal | string | null): string {
  return value === null ? "0" : new Prisma.Decimal(value).toFixed();
}

function safeCount(value: { id: number } | number | bigint): number {
  const raw = typeof value === "object" ? value.id : value;
  if (typeof raw === "number") return raw;
  if (raw > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("ADMIN_DASHBOARD_COUNT_UNSAFE");
  return Number(raw);
}

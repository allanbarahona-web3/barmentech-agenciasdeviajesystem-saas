import { Injectable } from "@nestjs/common";
import {
  AccountReceivableStatus,
  BillingDocumentLifecycleStatus,
  BillingTaxAuthorityStatus,
  CommercialObligationStatus,
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
type ContractedSalesRow = { currencyCode: string; amount: Prisma.Decimal | string | null; obligationCount: bigint | number };
type PassengerTrendRow = { month: string; passengerCount: bigint | number };
type ActivePassengersRow = { activePassengersCount: bigint | number };
type FiscalNetSalesGroup = { currencyCode: string; documentTypeCode: string; _sum: { total: Prisma.Decimal | null } };

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
    const tenantCurrentDate = this.periods.resolve({ kind: "TODAY" }, timezone, now).endOn;
    const tenantToday = tenantCalendarDateStartAsUtc(tenantCurrentDate, timezone);
    const passengerTrendPeriod = trailingTwelveMonthPeriod(tenantCurrentDate);
    const passengerTrendStart = tenantCalendarDateStartAsUtc(passengerTrendPeriod.startOn, timezone);
    const passengerTrendEnd = tenantCalendarDateStartAsUtc(passengerTrendPeriod.endExclusiveOn, timezone);

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
    const fiscalNetSalesWhere = {
      tenantId: request.tenantId,
      taxAuthorityStatus: BillingTaxAuthorityStatus.ACCEPTED,
      fiscalIssueDate: { gte: fiscalDate(period.startOn), lte: fiscalDate(period.endOn) },
      documentTypeCode: { in: ["01", "03", "04"] },
    } satisfies Prisma.BillingDocumentWhereInput;

    const [outstandingRows, overdueRows, paymentRows, dailyPayments, contractedSalesRows, passengerTrendRows, activeTripsCount, activePassengersRows, pendingVerificationCount, submittedDocumentCount, acceptedDocumentCount, fiscalNetSalesGroups, salesRows, topOverdueCustomers, costs] = await Promise.all([
      this.prisma.accountReceivable.groupBy({ by: ["currencyCode"], where: openReceivablesWhere, _sum: { outstandingAmount: true }, _count: { id: true } }),
      this.prisma.accountReceivable.groupBy({ by: ["currencyCode"], where: overdueReceivablesWhere, _sum: { outstandingAmount: true }, _count: { id: true } }),
      this.prisma.payment.groupBy({ by: ["currencyCode"], where: receivedPaymentsWhere, _sum: { receivedAmount: true }, _count: { id: true } }),
      this.dailyPayments(request.tenantId, timezone, start, end),
      this.contractedSales(request.tenantId, start, end),
      this.passengerTrend(request.tenantId, timezone, passengerTrendStart, passengerTrendEnd),
      this.prisma.travelPackage.count({ where: { tenantId: request.tenantId, status: "OPEN" } }),
      this.activePassengers(request.tenantId),
      this.prisma.payment.count({ where: { tenantId: request.tenantId, status: PaymentStatus.PENDING_VERIFICATION } }),
      this.prisma.billingDocument.count({ where: { tenantId: request.tenantId, lifecycleStatus: BillingDocumentLifecycleStatus.SUBMITTED, submittedAt: { gte: start, lt: end } } }),
      this.prisma.billingDocument.count({ where: { tenantId: request.tenantId, taxAuthorityStatus: BillingTaxAuthorityStatus.ACCEPTED, taxAuthorityFinalizedAt: { gte: start, lt: end } } }),
      this.prisma.billingDocument.groupBy({ by: ["currencyCode", "documentTypeCode"], where: fiscalNetSalesWhere, _sum: { total: true } }),
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
      fiscal: {
        submittedDocumentCount,
        acceptedDocumentCount,
        netSalesByCurrency: netFiscalSalesByCurrency(fiscalNetSalesGroups),
      },
      sales: {
        orderCount: countRows(salesRows),
        totalByCurrency: currencyAmounts(salesRows, "currency", "total"),
      },
      commercial: {
        contractedSales: {
          obligationCount: countContractedSalesRows(contractedSalesRows),
          totalByCurrency: contractedSalesRows.map((row) => ({
            currencyCode: row.currencyCode,
            amount: decimalString(row.amount),
            count: safeCount(row.obligationCount),
          })),
        },
        averageContractTicketByCurrency: contractedSalesRows.map((row) => ({
          currencyCode: row.currencyCode,
          amount: averageTicket(row.amount, row.obligationCount),
          obligationCount: safeCount(row.obligationCount),
        })),
        passengerTrend: completePassengerTrend(passengerTrendPeriod.months, passengerTrendRows),
      },
      operations: {
        activeTripsCount,
        activePassengersCount: safeCount(activePassengersRows[0]?.activePassengersCount ?? 0),
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

  private contractedSales(tenantId: string, start: Date, end: Date) {
    return this.prisma.$queryRaw<ContractedSalesRow[]>(Prisma.sql`
      SELECT
        obligation."currencyCode" AS "currencyCode",
        SUM(obligation."originalAmount") AS "amount",
        COUNT(*)::bigint AS "obligationCount"
      FROM "commercial_obligations" obligation
      INNER JOIN "Contract" contract
        ON contract."id" = obligation."sourceId"
        AND contract."tenantId" = obligation."tenantId"
      WHERE obligation."tenantId" = ${tenantId}
        AND obligation."sourceType" = 'CONTRACT'
        AND obligation."createdAt" >= ${start}
        AND obligation."createdAt" < ${end}
        AND obligation."status" <> ${CommercialObligationStatus.CANCELLED}::"CommercialObligationStatus"
        AND contract."cancelledAt" IS NULL
        AND contract."status" <> 'CANCELLED'
      GROUP BY obligation."currencyCode"
      ORDER BY obligation."currencyCode" ASC
    `);
  }

  private passengerTrend(tenantId: string, timezone: string, start: Date, end: Date) {
    return this.prisma.$queryRaw<PassengerTrendRow[]>(Prisma.sql`
      SELECT
        to_char(
          date_trunc('month', (obligation."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}),
          'YYYY-MM'
        ) AS "month",
        COUNT(DISTINCT (source."contractId", source."travelPackageParticipantId"))::bigint AS "passengerCount"
      FROM "commercial_obligations" obligation
      INNER JOIN "travel_package_participant_contract_sources" source
        ON source."tenantId" = obligation."tenantId"
        AND source."contractId" = obligation."sourceId"
      WHERE obligation."tenantId" = ${tenantId}
        AND obligation."sourceType" = 'CONTRACT'
        AND obligation."createdAt" >= ${start}
        AND obligation."createdAt" < ${end}
      GROUP BY "month"
      ORDER BY "month" ASC
    `);
  }

  private activePassengers(tenantId: string) {
    return this.prisma.$queryRaw<ActivePassengersRow[]>(Prisma.sql`
      SELECT COUNT(DISTINCT participant."id")::bigint AS "activePassengersCount"
      FROM "travel_package_participants" participant
      INNER JOIN "travel_package_participant_contract_sources" source
        ON source."tenantId" = participant."tenantId"
        AND source."travelPackageId" = participant."travelPackageId"
        AND source."travelPackageParticipantId" = participant."id"
      INNER JOIN "TravelPackage" travel_package
        ON travel_package."id" = participant."travelPackageId"
        AND travel_package."tenantId" = participant."tenantId"
      INNER JOIN "Contract" contract
        ON contract."id" = source."contractId"
        AND contract."tenantId" = source."tenantId"
        AND contract."travelPackageId" = source."travelPackageId"
      INNER JOIN "commercial_obligations" obligation
        ON obligation."tenantId" = source."tenantId"
        AND obligation."sourceType" = 'CONTRACT'
        AND obligation."sourceId" = source."contractId"
      WHERE participant."tenantId" = ${tenantId}
        AND travel_package."status" = 'OPEN'
        AND obligation."status" <> ${CommercialObligationStatus.CANCELLED}::"CommercialObligationStatus"
        AND contract."cancelledAt" IS NULL
        AND contract."status" <> 'CANCELLED'
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

function averageTicket(amount: Prisma.Decimal | string | null, count: bigint | number): string {
  const divisor = safeCount(count);
  if (divisor === 0) return "0";
  return new Prisma.Decimal(amount ?? 0)
    .dividedBy(divisor)
    .toDecimalPlaces(5, Prisma.Decimal.ROUND_HALF_UP)
    .toFixed(5);
}

function countContractedSalesRows(rows: readonly ContractedSalesRow[]): number {
  return rows.reduce((total, row) => total + safeCount(row.obligationCount), 0);
}

function trailingTwelveMonthPeriod(endOn: string): { startOn: string; endExclusiveOn: string; months: string[] } {
  const [year, month] = endOn.slice(0, 7).split("-").map(Number);
  const startMonth = new Date(Date.UTC(year, month - 12, 1));
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const months = Array.from({ length: 12 }, (_, index) => monthKey(new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + index, 1))));
  return { startOn: `${monthKey(startMonth)}-01`, endExclusiveOn: `${monthKey(nextMonth)}-01`, months };
}

function completePassengerTrend(months: readonly string[], rows: readonly PassengerTrendRow[]) {
  const counts = new Map(rows.map((row) => [row.month, safeCount(row.passengerCount)]));
  return months.map((month) => ({ month, passengerCount: counts.get(month) ?? 0 }));
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function netFiscalSalesByCurrency(groups: readonly FiscalNetSalesGroup[]) {
  const totals = new Map<string, Prisma.Decimal>();
  for (const group of groups) {
    const amount = new Prisma.Decimal(group._sum.total ?? 0);
    const signedAmount = group.documentTypeCode === "03" ? amount.negated() : amount;
    totals.set(group.currencyCode, (totals.get(group.currencyCode) ?? new Prisma.Decimal(0)).plus(signedAmount));
  }
  return [...totals.entries()]
    .map(([currencyCode, amount]) => ({ currencyCode, amount: amount.toFixed() }))
    .sort((left, right) => left.currencyCode.localeCompare(right.currencyCode));
}

function fiscalDate(calendarDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(calendarDate);
  if (!match) throw new Error("ADMIN_DASHBOARD_FISCAL_DATE_INVALID");
  const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    value.getUTCFullYear() !== Number(match[1]) ||
    value.getUTCMonth() !== Number(match[2]) - 1 ||
    value.getUTCDate() !== Number(match[3])
  ) throw new Error("ADMIN_DASHBOARD_FISCAL_DATE_INVALID");
  return value;
}

function safeCount(value: { id: number } | number | bigint): number {
  const raw = typeof value === "object" ? value.id : value;
  if (typeof raw === "number") return raw;
  if (raw > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("ADMIN_DASHBOARD_COUNT_UNSAFE");
  return Number(raw);
}

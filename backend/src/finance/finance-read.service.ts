import { Injectable, NotFoundException } from "@nestjs/common";
import { AccountReceivableStatus, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  ListAccountReceivableGroupItemsDto,
  ListAccountReceivableGroupsDto,
  ListAccountReceivablesDto,
  ListPaymentsDto,
} from "./dto/finance.dto";

const DEFAULT_FISCAL_TIMEZONE = "America/Costa_Rica";

@Injectable()
export class FinanceReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccountReceivableDetail(tenantId: string, id: string) {
    const [receivable, tenantCurrentCalendarDate] = await Promise.all([
      this.prisma.accountReceivable.findFirst({
        where: { id, tenantId },
        include: {
          paymentAllocations: {
            orderBy: { allocatedAt: "asc" },
            include: { reversal: true },
          },
        },
      }),
      this.getTenantCurrentCalendarDate(tenantId),
    ]);
    if (!receivable) throw new NotFoundException("ACCOUNT_RECEIVABLE_NOT_FOUND");
    return accountReceivableDetail(receivable, tenantCurrentCalendarDate);
  }

  async getPaymentDetail(tenantId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, tenantId },
      include: {
        allocations: {
          orderBy: { allocatedAt: "asc" },
          include: { accountReceivable: true, reversal: true },
        },
      },
    });
    if (!payment) throw new NotFoundException("PAYMENT_NOT_FOUND");
    return paymentDetail(payment);
  }

  async getPaymentIdForAllocation(tenantId: string, id: string): Promise<string> {
    const allocation = await this.prisma.paymentAllocation.findFirst({
      where: { id, tenantId },
      select: { paymentId: true },
    });
    if (!allocation) throw new NotFoundException("PAYMENT_ALLOCATION_NOT_FOUND");
    return allocation.paymentId;
  }

  async listAccountReceivables(tenantId: string, query: ListAccountReceivablesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = accountReceivableWhere(tenantId, query);
    const tenantCurrentCalendarDate = await this.getTenantCurrentCalendarDate(tenantId);
    const [receivables, total] = await Promise.all([
      this.prisma.accountReceivable.findMany({
        where,
        select: accountReceivableListSelect,
        orderBy: [{ dueDate: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.accountReceivable.count({ where }),
    ]);
    return {
      accountReceivables: receivables.map((receivable) =>
        accountReceivableListItem(receivable, tenantCurrentCalendarDate),
      ),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async listAccountReceivableGroups(
    tenantId: string,
    query: ListAccountReceivableGroupsDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const tenantCurrentCalendarDate = await this.getTenantCurrentCalendarDate(tenantId);
    const tenantToday = dateOnly(tenantCurrentCalendarDate);
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<AccountReceivableGroupRow[]>`
        WITH grouped AS (
          SELECT
            CASE WHEN "customerId" IS NULL THEN 'RECEIVABLE' ELSE 'CUSTOMER' END AS "groupKind",
            COALESCE("customerId", "id") AS "groupIdentity",
            "customerId",
            "currencyCode",
            (ARRAY_AGG("debtorDisplayName" ORDER BY "recognizedAt" DESC, "id" DESC))[1] AS "debtorDisplayName",
            (ARRAY_AGG("debtorIdentificationType" ORDER BY "recognizedAt" DESC, "id" DESC))[1] AS "debtorIdentificationType",
            (ARRAY_AGG("debtorIdentificationNumber" ORDER BY "recognizedAt" DESC, "id" DESC))[1] AS "debtorIdentificationNumber",
            SUM(CASE WHEN "status" <> 'CANCELLED' THEN "originalAmount" ELSE 0 END) AS "totalOriginalAmount",
            SUM(CASE WHEN "status" <> 'CANCELLED' THEN "originalAmount" - "outstandingAmount" ELSE 0 END) AS "totalAllocatedAmount",
            SUM(CASE WHEN "status" <> 'CANCELLED' THEN "outstandingAmount" ELSE 0 END) AS "totalOutstandingAmount",
            SUM(CASE WHEN "status" IN ('OPEN', 'PARTIALLY_SETTLED') AND "dueDate" < ${tenantToday} THEN "outstandingAmount" ELSE 0 END) AS "totalOverdueOutstandingAmount",
            COUNT(*) AS "totalCount",
            COUNT(*) FILTER (WHERE "status" = 'OPEN') AS "openCount",
            COUNT(*) FILTER (WHERE "status" = 'PARTIALLY_SETTLED') AS "partiallySettledCount",
            COUNT(*) FILTER (WHERE "status" = 'SETTLED') AS "settledCount",
            COUNT(*) FILTER (WHERE "status" = 'CANCELLED') AS "cancelledCount",
            COUNT(*) FILTER (WHERE "status" IN ('OPEN', 'PARTIALLY_SETTLED') AND "dueDate" < ${tenantToday}) AS "overdueCount"
          FROM "account_receivables"
          WHERE "tenantId" = ${tenantId}
          GROUP BY
            CASE WHEN "customerId" IS NULL THEN 'RECEIVABLE' ELSE 'CUSTOMER' END,
            COALESCE("customerId", "id"),
            "customerId",
            "currencyCode"
        )
        SELECT * FROM grouped
        ORDER BY LOWER("debtorDisplayName") ASC, "groupKind" ASC, "groupIdentity" ASC, "currencyCode" ASC
        LIMIT ${pageSize}
        OFFSET ${offset}
      `,
      this.prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*) AS "total"
        FROM (
          SELECT 1
          FROM "account_receivables"
          WHERE "tenantId" = ${tenantId}
          GROUP BY
            CASE WHEN "customerId" IS NULL THEN 'RECEIVABLE' ELSE 'CUSTOMER' END,
            COALESCE("customerId", "id"),
            "customerId",
            "currencyCode"
        ) AS grouped
      `,
    ]);
    const total = exactCount(totals[0]?.total ?? 0);
    return {
      groups: rows.map(accountReceivableGroup),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async listAccountReceivableGroupItems(
    tenantId: string,
    groupKey: string,
    query: ListAccountReceivableGroupItemsDto,
  ) {
    const group = decodeAccountReceivableGroupKey(groupKey);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AccountReceivableWhereInput = group.kind === "CUSTOMER"
      ? {
          tenantId,
          customerId: group.identity,
          currencyCode: group.currencyCode,
        }
      : {
          tenantId,
          id: group.identity,
          customerId: null,
          currencyCode: group.currencyCode,
        };
    const tenantCurrentCalendarDate = await this.getTenantCurrentCalendarDate(tenantId);
    const [receivables, total] = await Promise.all([
      this.prisma.accountReceivable.findMany({
        where,
        select: accountReceivableListSelect,
        orderBy: [{ dueDate: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.accountReceivable.count({ where }),
    ]);
    if (total === 0) throw new NotFoundException("ACCOUNT_RECEIVABLE_GROUP_NOT_FOUND");
    return {
      groupKey,
      accountReceivables: receivables.map((receivable) =>
        accountReceivableListItem(receivable, tenantCurrentCalendarDate),
      ),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async listPayments(tenantId: string, query: ListPaymentsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const constraints: Prisma.PaymentWhereInput[] = [];
    if (query.status) constraints.push({ status: query.status });
    if (query.availableOnly) {
      constraints.push({
        availableAmount: { gt: new Prisma.Decimal(0) },
        status: { in: [PaymentStatus.RECEIVED, PaymentStatus.PARTIALLY_ALLOCATED] },
      });
    }
    const where: Prisma.PaymentWhereInput = {
      tenantId,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.currency ? { currencyCode: query.currency } : {}),
      ...(constraints.length ? { AND: constraints } : {}),
    };
    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        select: paymentListSelect,
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      payments: payments.map(paymentListItem),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getCustomerFinancialBalance(tenantId: string, customerId: string) {
    const openStatuses = [AccountReceivableStatus.OPEN, AccountReceivableStatus.PARTIALLY_SETTLED];
    const where = { tenantId, customerId, status: { in: openStatuses } };
    const tenantCurrentCalendarDate = await this.getTenantCurrentCalendarDate(tenantId);
    const overdueWhere = { ...where, dueDate: { lt: dateOnly(tenantCurrentCalendarDate) } };
    const [balances, overdueBalances] = await Promise.all([
      this.prisma.accountReceivable.groupBy({
        by: ["currencyCode"],
        where,
        _sum: { outstandingAmount: true },
        _count: { _all: true },
      }),
      this.prisma.accountReceivable.groupBy({
        by: ["currencyCode"],
        where: overdueWhere,
        _sum: { outstandingAmount: true },
        _count: { _all: true },
      }),
    ]);
    const overdueByCurrency = new Map(overdueBalances.map((row) => [row.currencyCode, row]));
    return {
      customerId,
      balances: balances.map((row) => {
        const overdue = overdueByCurrency.get(row.currencyCode);
        return {
          currencyCode: row.currencyCode,
          totalOutstandingAmount: money(row._sum.outstandingAmount ?? new Prisma.Decimal(0)),
          openOrPartiallySettledCount: row._count._all,
          overdueOutstandingAmount: money(overdue?._sum.outstandingAmount ?? new Prisma.Decimal(0)),
          overdueCount: overdue?._count._all ?? 0,
        };
      }),
    };
  }

  paymentSummary(payment: {
    id: string; status: string; currencyCode: string; receivedAmount: Prisma.Decimal;
    availableAmount: Prisma.Decimal; receivedAt: Date; cancelledAt: Date | null;
  }) {
    return {
      id: payment.id,
      status: payment.status,
      currencyCode: payment.currencyCode,
      receivedAmount: money(payment.receivedAmount),
      availableAmount: money(payment.availableAmount),
      receivedAt: payment.receivedAt,
      cancelledAt: payment.cancelledAt,
    };
  }

  private async getTenantCurrentCalendarDate(tenantId: string): Promise<string> {
    const configuration = await this.prisma.tenantBillingConfiguration.findUnique({
      where: { tenantId },
      select: { fiscalTimezone: true },
    });
    return tenantCalendarDate(
      new Date(),
      configuration?.fiscalTimezone ?? DEFAULT_FISCAL_TIMEZONE,
    );
  }
}

const accountReceivableListSelect = {
  id: true,
  customerId: true,
  debtorDisplayName: true,
  debtorIdentificationType: true,
  debtorIdentificationNumber: true,
  currencyCode: true,
  originalAmount: true,
  outstandingAmount: true,
  dueDate: true,
  status: true,
  recognizedAt: true,
  settledAt: true,
  sourceType: true,
  sourceId: true,
  sourceNumber: true,
  sourceDocumentType: true,
} satisfies Prisma.AccountReceivableSelect;

const paymentListSelect = {
  id: true,
  customerId: true,
  payerDisplayName: true,
  payerIdentificationType: true,
  payerIdentificationNumber: true,
  currencyCode: true,
  receivedAmount: true,
  availableAmount: true,
  receivedAt: true,
  paymentMethod: true,
  externalReference: true,
  description: true,
  status: true,
  cancelledAt: true,
} satisfies Prisma.PaymentSelect;

type AccountReceivableGroupRow = {
  groupKind: "CUSTOMER" | "RECEIVABLE";
  groupIdentity: string;
  customerId: string | null;
  currencyCode: string;
  debtorDisplayName: string;
  debtorIdentificationType: string | null;
  debtorIdentificationNumber: string | null;
  totalOriginalAmount: Prisma.Decimal;
  totalAllocatedAmount: Prisma.Decimal;
  totalOutstandingAmount: Prisma.Decimal;
  totalOverdueOutstandingAmount: Prisma.Decimal;
  totalCount: bigint | number;
  openCount: bigint | number;
  partiallySettledCount: bigint | number;
  settledCount: bigint | number;
  cancelledCount: bigint | number;
  overdueCount: bigint | number;
};

type AccountReceivableGroupKey = {
  version: 1;
  kind: "CUSTOMER" | "RECEIVABLE";
  identity: string;
  currencyCode: string;
};

function accountReceivableGroup(row: AccountReceivableGroupRow) {
  const key: AccountReceivableGroupKey = {
    version: 1,
    kind: row.groupKind,
    identity: row.groupIdentity,
    currencyCode: row.currencyCode,
  };
  return {
    groupKey: encodeAccountReceivableGroupKey(key),
    customerId: row.customerId,
    debtor: {
      displayName: row.debtorDisplayName,
      identificationType: row.debtorIdentificationType,
      identificationNumber: row.debtorIdentificationNumber,
    },
    currencyCode: row.currencyCode,
    totalOriginalAmount: money(row.totalOriginalAmount),
    totalAllocatedAmount: money(row.totalAllocatedAmount),
    totalOutstandingAmount: money(row.totalOutstandingAmount),
    totalOverdueOutstandingAmount: money(row.totalOverdueOutstandingAmount),
    counts: {
      total: exactCount(row.totalCount),
      open: exactCount(row.openCount),
      partiallySettled: exactCount(row.partiallySettledCount),
      settled: exactCount(row.settledCount),
      cancelled: exactCount(row.cancelledCount),
      overdue: exactCount(row.overdueCount),
    },
  };
}

function encodeAccountReceivableGroupKey(key: AccountReceivableGroupKey): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

function decodeAccountReceivableGroupKey(value: string): AccountReceivableGroupKey {
  try {
    if (!value || value.length > 1000) throw new Error("invalid");
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<AccountReceivableGroupKey>;
    if (
      parsed.version !== 1 ||
      (parsed.kind !== "CUSTOMER" && parsed.kind !== "RECEIVABLE") ||
      typeof parsed.identity !== "string" || !parsed.identity || parsed.identity.length > 191 ||
      typeof parsed.currencyCode !== "string" || !/^[A-Z]{3}$/.test(parsed.currencyCode) ||
      Object.keys(parsed).length !== 4
    ) throw new Error("invalid");
    const key = parsed as AccountReceivableGroupKey;
    if (encodeAccountReceivableGroupKey(key) !== value) throw new Error("invalid");
    return key;
  } catch {
    throw new NotFoundException("ACCOUNT_RECEIVABLE_GROUP_NOT_FOUND");
  }
}

function exactCount(value: bigint | number): number {
  const count = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("FINANCE_COUNT_OUT_OF_RANGE");
  }
  return count;
}

function paymentListItem(
  payment: Prisma.PaymentGetPayload<{ select: typeof paymentListSelect }>,
) {
  return {
    ...payment,
    receivedAmount: money(payment.receivedAmount),
    availableAmount: money(payment.availableAmount),
  };
}

function accountReceivableWhere(tenantId: string, query: ListAccountReceivablesDto): Prisma.AccountReceivableWhereInput {
  const dueDate: Prisma.DateTimeFilter = {};
  if (query.dueDateFrom) dueDate.gte = dateOnly(query.dueDateFrom);
  if (query.dueDateTo) dueDate.lte = dateOnly(query.dueDateTo);
  return {
    tenantId,
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.currency ? { currencyCode: query.currency } : {}),
    ...(Object.keys(dueDate).length ? { dueDate } : {}),
  };
}

function accountReceivableListItem(
  receivable: Prisma.AccountReceivableGetPayload<{ select: typeof accountReceivableListSelect }>,
  tenantCurrentCalendarDate: string,
) {
  return {
    id: receivable.id,
    customerId: receivable.customerId,
    debtorDisplayName: receivable.debtorDisplayName,
    debtorIdentificationType: receivable.debtorIdentificationType,
    debtorIdentificationNumber: receivable.debtorIdentificationNumber,
    currencyCode: receivable.currencyCode,
    originalAmount: money(receivable.originalAmount),
    outstandingAmount: money(receivable.outstandingAmount),
    dueDate: receivable.dueDate,
    status: receivable.status,
    isOverdue: isOverdue(receivable.status, receivable.dueDate, tenantCurrentCalendarDate),
    recognizedAt: receivable.recognizedAt,
    settledAt: receivable.settledAt,
    source: {
      type: receivable.sourceType,
      billingDocumentId: receivable.sourceType === "BILLING_DOCUMENT" ? receivable.sourceId : null,
      sourceId: receivable.sourceId,
      sourceNumber: receivable.sourceNumber,
      sourceDocumentType: receivable.sourceDocumentType,
    },
  };
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function tenantCalendarDate(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (!year || !month || !day) {
    throw new Error("FINANCE_TENANT_CALENDAR_DATE_UNAVAILABLE");
  }
  return `${year}-${month}-${day}`;
}

function isOverdue(
  status: AccountReceivableStatus,
  dueDate: Date,
  tenantCurrentCalendarDate: string,
): boolean {
  return (
    (status === AccountReceivableStatus.OPEN ||
      status === AccountReceivableStatus.PARTIALLY_SETTLED) &&
    dueDate.getTime() < dateOnly(tenantCurrentCalendarDate).getTime()
  );
}

function paymentDetail(payment: Prisma.PaymentGetPayload<{
  include: { allocations: { include: { accountReceivable: true; reversal: true } } };
}>) {
  return {
    id: payment.id,
    customerId: payment.customerId,
    payerDisplayName: payment.payerDisplayName,
    payerIdentificationType: payment.payerIdentificationType,
    payerIdentificationNumber: payment.payerIdentificationNumber,
    currencyCode: payment.currencyCode,
    receivedAmount: money(payment.receivedAmount),
    availableAmount: money(payment.availableAmount),
    receivedAt: payment.receivedAt,
    paymentMethod: payment.paymentMethod,
    externalReference: payment.externalReference,
    description: payment.description,
    status: payment.status,
    cancelledAt: payment.cancelledAt,
    allocations: payment.allocations.map((allocation) => ({
      id: allocation.id,
      accountReceivableId: allocation.accountReceivableId,
      amount: money(allocation.amount),
      status: allocation.status,
      allocatedAt: allocation.allocatedAt,
      accountReceivable: {
        id: allocation.accountReceivable.id,
        currencyCode: allocation.accountReceivable.currencyCode,
        originalAmount: money(allocation.accountReceivable.originalAmount),
        outstandingAmount: money(allocation.accountReceivable.outstandingAmount),
        status: allocation.accountReceivable.status,
      },
      reversal: allocation.reversal && {
        id: allocation.reversal.id,
        reason: allocation.reversal.reason,
        reversedAt: allocation.reversal.reversedAt,
      },
    })),
  };
}

function accountReceivableDetail(receivable: Prisma.AccountReceivableGetPayload<{
  include: { paymentAllocations: { include: { reversal: true } } };
}>, tenantCurrentCalendarDate: string) {
  return {
    id: receivable.id,
    sourceType: receivable.sourceType,
    sourceId: receivable.sourceId,
    sourceNumber: receivable.sourceNumber,
    sourceDocumentType: receivable.sourceDocumentType,
    customerId: receivable.customerId,
    debtorDisplayName: receivable.debtorDisplayName,
    debtorIdentificationType: receivable.debtorIdentificationType,
    debtorIdentificationNumber: receivable.debtorIdentificationNumber,
    currencyCode: receivable.currencyCode,
    originalAmount: money(receivable.originalAmount),
    outstandingAmount: money(receivable.outstandingAmount),
    dueDate: receivable.dueDate,
    paymentTermDays: receivable.paymentTermDays,
    status: receivable.status,
    isOverdue: isOverdue(receivable.status, receivable.dueDate, tenantCurrentCalendarDate),
    recognizedAt: receivable.recognizedAt,
    settledAt: receivable.settledAt,
    cancelledAt: receivable.cancelledAt,
    allocations: receivable.paymentAllocations.map((allocation) => ({
      id: allocation.id,
      paymentId: allocation.paymentId,
      amount: money(allocation.amount),
      status: allocation.status,
      allocatedAt: allocation.allocatedAt,
      reversal: allocation.reversal && {
        id: allocation.reversal.id,
        reason: allocation.reversal.reason,
        reversedAt: allocation.reversal.reversedAt,
      },
    })),
  };
}

function money(value: Prisma.Decimal): string {
  return value.toFixed();
}

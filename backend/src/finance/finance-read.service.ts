import { Injectable, NotFoundException } from "@nestjs/common";
import { AccountReceivableStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ListAccountReceivablesDto } from "./dto/finance.dto";

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

import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FinanceReadService } from "./finance-read.service";

describe("FinanceReadService", () => {
  it("reads payment detail only within its tenant and preserves exact decimal strings", async () => {
    const prisma = { payment: { findFirst: jest.fn().mockResolvedValue(payment()) } };
    const service = new FinanceReadService(prisma as unknown as PrismaService);

    await expect(service.getPaymentDetail("tenant-a", "payment-a")).resolves.toMatchObject({
      receivedAmount: "10.12345", availableAmount: "6",
      allocations: [{ amount: "4.12345", accountReceivable: { outstandingAmount: "5.87655" } }],
    });
    expect(prisma.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "payment-a", tenantId: "tenant-a" } }));
  });

  it("does not expose a payment outside the authenticated tenant", async () => {
    const prisma = { payment: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new FinanceReadService(prisma as unknown as PrismaService);
    await expect(service.getPaymentDetail("tenant-a", "payment-other")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("paginates ARs with customer, status, currency, and inclusive due-date filters", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-31T17:00:00.000Z"));
    const findMany = jest.fn().mockResolvedValue([receivable()]);
    const count = jest.fn().mockResolvedValue(21);
    const prisma = { accountReceivable: { findMany, count }, tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) } };
    const service = new FinanceReadService(prisma as unknown as PrismaService);

    await expect(service.listAccountReceivables("tenant-a", {
      page: 2, pageSize: 10, customerId: "customer-a", status: "PARTIALLY_SETTLED", currency: "CRC",
      dueDateFrom: "2026-08-01", dueDateTo: "2026-08-31",
    })).resolves.toMatchObject({
      total: 21, page: 2, pageSize: 10, totalPages: 3,
      accountReceivables: [{ id: "ar-a", originalAmount: "10.12345", outstandingAmount: "3.33333", isOverdue: true, source: { billingDocumentId: "document-a", sourceNumber: "001" } }],
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: "tenant-a", customerId: "customer-a", status: "PARTIALLY_SETTLED", currencyCode: "CRC", dueDate: { gte: new Date("2026-08-01T00:00:00.000Z"), lte: new Date("2026-08-31T00:00:00.000Z") } }),
      skip: 10, take: 10,
    }));
    expect(count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-a" }) }));
    jest.useRealTimers();
  });

  it("keeps AR list reads tenant-scoped", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const findUnique = jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" });
    const prisma = { accountReceivable: { findMany, count }, tenantBillingConfiguration: { findUnique } };
    const service = new FinanceReadService(prisma as unknown as PrismaService);

    await service.listAccountReceivables("tenant-auth", {});
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant-auth" } }));
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(prisma).not.toHaveProperty("billingDocument");
    expect(prisma).not.toHaveProperty("client");
  });

  it("projects authoritative overdue state for list rows across statuses at UTC rollover", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-01T02:30:00.000Z")); // Aug 31 in Costa Rica
    const findMany = jest.fn().mockResolvedValue([
      receivable({ id: "open-past", status: "OPEN", dueDate: new Date("2026-08-30T00:00:00.000Z") }),
      receivable({ id: "partial-past", status: "PARTIALLY_SETTLED", dueDate: new Date("2026-08-30T00:00:00.000Z") }),
      receivable({ id: "open-today", status: "OPEN", dueDate: new Date("2026-08-31T00:00:00.000Z") }),
      receivable({ id: "settled-past", status: "SETTLED", dueDate: new Date("2026-08-30T00:00:00.000Z") }),
      receivable({ id: "cancelled-past", status: "CANCELLED", dueDate: new Date("2026-08-30T00:00:00.000Z") }),
    ]);
    const service = new FinanceReadService({
      accountReceivable: { findMany, count: jest.fn().mockResolvedValue(5) },
      tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) },
    } as unknown as PrismaService);

    const result = await service.listAccountReceivables("tenant-a", {});
    expect(result.accountReceivables.map((item) => [item.id, item.isOverdue])).toEqual([
      ["open-past", true],
      ["partial-past", true],
      ["open-today", false],
      ["settled-past", false],
      ["cancelled-past", false],
    ]);
    jest.useRealTimers();
  });

  it("projects the same tenant-date overdue rule in AR detail", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-01T02:30:00.000Z"));
    const findFirst = jest.fn().mockResolvedValue({
      ...receivable({ status: "OPEN", dueDate: new Date("2026-08-31T00:00:00.000Z") }),
      paymentTermDays: null,
      cancelledAt: null,
      paymentAllocations: [],
    });
    const service = new FinanceReadService({
      accountReceivable: { findFirst },
      tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) },
    } as unknown as PrismaService);

    await expect(service.getAccountReceivableDetail("tenant-a", "ar-a")).resolves.toMatchObject({
      id: "ar-a",
      isOverdue: false,
    });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "ar-a", tenantId: "tenant-a" } }));
    jest.useRealTimers();
  });

  it("groups customer open and partial balances by currency with exact serialized amounts", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-31T17:00:00.000Z"));
    const groupBy = jest.fn()
      .mockResolvedValueOnce([
        { currencyCode: "CRC", _sum: { outstandingAmount: new Prisma.Decimal("3.33333") }, _count: { _all: 2 } },
        { currencyCode: "USD", _sum: { outstandingAmount: new Prisma.Decimal("9.87654") }, _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { currencyCode: "CRC", _sum: { outstandingAmount: new Prisma.Decimal("1.11111") }, _count: { _all: 1 } },
      ]);
    const findUnique = jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" });
    const service = new FinanceReadService({ accountReceivable: { groupBy }, tenantBillingConfiguration: { findUnique } } as unknown as PrismaService);

    await expect(service.getCustomerFinancialBalance("tenant-a", "customer-a")).resolves.toEqual({
      customerId: "customer-a",
      balances: [
        { currencyCode: "CRC", totalOutstandingAmount: "3.33333", openOrPartiallySettledCount: 2, overdueOutstandingAmount: "1.11111", overdueCount: 1 },
        { currencyCode: "USD", totalOutstandingAmount: "9.87654", openOrPartiallySettledCount: 1, overdueOutstandingAmount: "0", overdueCount: 0 },
      ],
    });

    expect(groupBy).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { tenantId: "tenant-a", customerId: "customer-a", status: { in: ["OPEN", "PARTIALLY_SETTLED"] } },
    }));
    expect(groupBy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { tenantId: "tenant-a", customerId: "customer-a", status: { in: ["OPEN", "PARTIALLY_SETTLED"] }, dueDate: { lt: new Date("2026-08-31T00:00:00.000Z") } },
    }));
    expect(findUnique).toHaveBeenCalledWith({ where: { tenantId: "tenant-a" }, select: { fiscalTimezone: true } });
    jest.useRealTimers();
  });

  it("does not mark an AR due today in the tenant timezone overdue after UTC rolls over", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-01T02:30:00.000Z")); // Aug 31 in Costa Rica
    const groupBy = jest.fn().mockResolvedValue([]);
    const service = new FinanceReadService({
      tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) },
      accountReceivable: { groupBy },
    } as unknown as PrismaService);

    await service.getCustomerFinancialBalance("tenant-a", "customer-a");

    expect(groupBy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ dueDate: { lt: new Date("2026-08-31T00:00:00.000Z") } }),
    }));
    jest.useRealTimers();
  });

  it("marks ARs due before the tenant current calendar date overdue", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-31T17:00:00.000Z"));
    const groupBy = jest.fn().mockResolvedValue([]);
    const service = new FinanceReadService({
      tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) },
      accountReceivable: { groupBy },
    } as unknown as PrismaService);

    await service.getCustomerFinancialBalance("tenant-a", "customer-a");

    expect(groupBy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ dueDate: { lt: new Date("2026-08-31T00:00:00.000Z") } }),
    }));
    jest.useRealTimers();
  });
});

function payment() {
  return {
    id: "payment-a", customerId: "customer-a", payerDisplayName: "Payer", payerIdentificationType: null, payerIdentificationNumber: null,
    currencyCode: "CRC", receivedAmount: new Prisma.Decimal("10.12345"), availableAmount: new Prisma.Decimal("6.00000"), receivedAt: new Date(), paymentMethod: "CASH", externalReference: null, description: null, status: "PARTIALLY_ALLOCATED", cancelledAt: null,
    allocations: [{ id: "allocation-a", accountReceivableId: "ar-a", amount: new Prisma.Decimal("4.12345"), status: "ACTIVE", allocatedAt: new Date(), reversal: null, accountReceivable: { id: "ar-a", currencyCode: "CRC", originalAmount: new Prisma.Decimal("10"), outstandingAmount: new Prisma.Decimal("5.87655"), status: "PARTIALLY_SETTLED" } }],
  };
}

function receivable(overrides: Record<string, unknown> = {}) {
  return {
    id: "ar-a", customerId: "customer-a", debtorDisplayName: "Debtor", debtorIdentificationType: "01", debtorIdentificationNumber: "123",
    currencyCode: "CRC", originalAmount: new Prisma.Decimal("10.12345"), outstandingAmount: new Prisma.Decimal("3.33333"), dueDate: new Date("2026-08-15T00:00:00.000Z"), status: "PARTIALLY_SETTLED", recognizedAt: new Date("2026-08-01T00:00:00.000Z"), settledAt: null,
    sourceType: "BILLING_DOCUMENT", sourceId: "document-a", sourceNumber: "001", sourceDocumentType: "01",
    ...overrides,
  };
}

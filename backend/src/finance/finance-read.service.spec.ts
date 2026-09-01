import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FinanceReadService } from "./finance-read.service";

describe("FinanceReadService", () => {
  it("reads payment detail only within its tenant and preserves exact decimal strings", async () => {
    const prisma = {
      payment: { findFirst: jest.fn().mockResolvedValue(payment()) },
      billingAuditLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new FinanceReadService(prisma as unknown as PrismaService);

    await expect(service.getPaymentDetail("tenant-a", "payment-a")).resolves.toMatchObject({
      receiptNumber: "RCP-2026-000001", receivedAmount: "10.12345", availableAmount: "6",
      allocations: [{ amount: "4.12345", accountReceivable: { outstandingAmount: "5.87655" } }],
    });
    expect(prisma.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "payment-a", tenantId: "tenant-a" } }));
  });

  it("does not expose a payment outside the authenticated tenant", async () => {
    const prisma = {
      payment: { findFirst: jest.fn().mockResolvedValue(null) },
      billingAuditLog: { findMany: jest.fn() },
    };
    const service = new FinanceReadService(prisma as unknown as PrismaService);
    await expect(service.getPaymentDetail("tenant-a", "payment-other")).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ["payment smaller than AR", "3.12345", "10.00000", "3.12345", "0", false],
    ["payment larger than AR", "10.00000", "3.12345", "3.12345", "6.87655", true],
    ["equal exact balances", "5.00000", "5.00000", "5", "0", false],
  ])("suggests the exact maximum applicable amount when %s", async (_, available, outstanding, suggested, remaining, hasRemaining) => {
    const paymentFindFirst = jest.fn().mockResolvedValue(suggestionPayment({ availableAmount: d(available), receivedAmount: d("10.00000") }));
    const receivableFindFirst = jest.fn().mockResolvedValue(suggestionReceivable({ outstandingAmount: d(outstanding), originalAmount: d("10.00000") }));
    const service = new FinanceReadService({
      payment: { findFirst: paymentFindFirst },
      accountReceivable: { findFirst: receivableFindFirst },
    } as unknown as PrismaService);

    await expect(service.getAllocationSuggestion("tenant-a", "payment-a", "ar-a")).resolves.toEqual({
      paymentId: "payment-a",
      accountReceivableId: "ar-a",
      currencyCode: "CRC",
      paymentAvailableAmount: new Prisma.Decimal(available).toFixed(),
      accountReceivableOutstandingAmount: new Prisma.Decimal(outstanding).toFixed(),
      suggestedAmount: suggested,
      remainingAfterSuggestion: remaining,
      hasRemainingAfterSuggestion: hasRemaining,
    });
    expect(paymentFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "payment-a", tenantId: "tenant-a" } }));
    expect(receivableFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "ar-a", tenantId: "tenant-a" } }));
  });

  it.each([
    ["currency", suggestionPayment({ currencyCode: "USD" }), suggestionReceivable(), ConflictException],
    ["cancelled payment", suggestionPayment({ status: "CANCELLED" }), suggestionReceivable(), ConflictException],
    ["fully allocated payment", suggestionPayment({ status: "FULLY_ALLOCATED", availableAmount: d("0") }), suggestionReceivable(), ConflictException],
    ["settled receivable", suggestionPayment(), suggestionReceivable({ status: "SETTLED", outstandingAmount: d("0") }), ConflictException],
    ["cancelled receivable", suggestionPayment(), suggestionReceivable({ status: "CANCELLED" }), ConflictException],
  ])("rejects an allocation suggestion for incompatible %s state", async (_, payment, receivable, error) => {
    const service = new FinanceReadService({
      payment: { findFirst: jest.fn().mockResolvedValue(payment) },
      accountReceivable: { findFirst: jest.fn().mockResolvedValue(receivable) },
    } as unknown as PrismaService);

    await expect(service.getAllocationSuggestion("tenant-a", "payment-a", "ar-a")).rejects.toBeInstanceOf(error);
  });

  it("rejects an allocation suggestion for different customer-owned records", async () => {
    const service = new FinanceReadService({
      payment: { findFirst: jest.fn().mockResolvedValue(suggestionPayment({ customerId: "customer-payment" })) },
      accountReceivable: { findFirst: jest.fn().mockResolvedValue(suggestionReceivable({ customerId: "customer-ar" })) },
    } as unknown as PrismaService);

    await expect(service.getAllocationSuggestion("tenant-a", "payment-a", "ar-a")).rejects.toMatchObject({
      message: "PAYMENT_ALLOCATION_CUSTOMER_MISMATCH",
    });
  });

  it("does not disclose cross-tenant payment or receivable suggestions", async () => {
    const paymentFindFirst = jest.fn().mockResolvedValue(null);
    const receivableFindFirst = jest.fn().mockResolvedValue(suggestionReceivable());
    const service = new FinanceReadService({
      payment: { findFirst: paymentFindFirst },
      accountReceivable: { findFirst: receivableFindFirst },
    } as unknown as PrismaService);

    await expect(service.getAllocationSuggestion("tenant-a", "payment-foreign", "ar-a")).rejects.toBeInstanceOf(NotFoundException);
    expect(paymentFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "payment-foreign", tenantId: "tenant-a" } }));
    expect(receivableFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "ar-a", tenantId: "tenant-a" } }));
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
    const aggregate = jest.fn().mockResolvedValue({ _sum: { availableAmount: d("4.25000") }, _count: { _all: 2 } });
    const service = new FinanceReadService({
      accountReceivable: { findFirst },
      payment: { aggregate },
      tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) },
      billingAuditLog: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService);

    await expect(service.getAccountReceivableDetail("tenant-a", "ar-a")).resolves.toMatchObject({
      id: "ar-a",
      isOverdue: false,
      customerId: "customer-a",
      currencyCode: "CRC",
      outstandingAmount: "3.33333",
      unallocatedPaymentAmount: "4.25",
      unallocatedPaymentCount: 2,
      hasUnallocatedPayments: true,
    });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "ar-a", tenantId: "tenant-a" } }));
    expect(aggregate).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        customerId: "customer-a",
        currencyCode: "CRC",
        availableAmount: { gt: new Prisma.Decimal(0) },
        status: { in: ["RECEIVED", "PARTIALLY_ALLOCATED"] },
      },
      _sum: { availableAmount: true },
      _count: { _all: true },
    });
    jest.useRealTimers();
  });

  it("keeps null-customer AR availability empty without querying Payments", async () => {
    const aggregate = jest.fn();
    const service = new FinanceReadService({
      accountReceivable: { findFirst: jest.fn().mockResolvedValue({
        ...receivable({ customerId: null }),
        paymentTermDays: null,
        cancelledAt: null,
        paymentAllocations: [],
      }) },
      payment: { aggregate },
      tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) },
      billingAuditLog: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService);

    await expect(service.getAccountReceivableDetail("tenant-a", "ar-null")).resolves.toMatchObject({
      customerId: null,
      unallocatedPaymentAmount: "0",
      unallocatedPaymentCount: 0,
      hasUnallocatedPayments: false,
    });
    expect(aggregate).not.toHaveBeenCalled();
  });

  it("projects persisted Finance audit actors in one tenant-scoped batched detail read", async () => {
    const findMany = jest.fn().mockResolvedValue([
      auditRow("FINANCE_PAYMENT", "payment-a", "REGISTERED", "user-register", "Juan P\u00e9rez"),
      auditRow("FINANCE_PAYMENT", "payment-a", "CANCELLED", "user-cancel", "Mar\u00eda Sol", { reason: "Receipt voided" }),
      auditRow("FINANCE_PAYMENT_ALLOCATION", "allocation-a", "APPLIED", "user-apply", "Ana Mora"),
      auditRow("FINANCE_PAYMENT_ALLOCATION_REVERSAL", "reversal-a", "REVERSED", "user-reverse", "Luis Rojas", { reason: "Applied to the wrong debt" }),
    ]);
    const service = new FinanceReadService({
      payment: {
        findFirst: jest.fn().mockResolvedValue(payment({
          status: "CANCELLED",
          cancelledAt: new Date("2026-08-31T13:00:00.000Z"),
          allocations: [{
            ...payment().allocations[0],
            reversal: { id: "reversal-a", reversedAt: new Date("2026-08-31T14:00:00.000Z"), reason: "Applied to the wrong debt" },
          }],
        })),
      },
      billingAuditLog: { findMany },
    } as unknown as PrismaService);

    await expect(service.getPaymentDetail("tenant-a", "payment-a")).resolves.toMatchObject({
      registeredBy: { userId: "user-register", name: "Juan P\u00e9rez", at: expect.any(Date) },
      cancelledBy: { userId: "user-cancel", name: "Mar\u00eda Sol", reason: "Receipt voided" },
      allocations: [{
        appliedBy: { userId: "user-apply", name: "Ana Mora" },
        reversal: { reversedBy: { userId: "user-reverse", name: "Luis Rojas" }, reason: "Applied to the wrong debt" },
      }],
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: "tenant-a" }),
    }));
    expect(service).not.toHaveProperty("user");
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

  it("paginates exact customer/currency groups while isolating every null-customer AR", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-01T02:30:00.000Z"));
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([
        groupRow({
          groupIdentity: "customer-a", customerId: "customer-a", currencyCode: "CRC",
          totalOriginalAmount: d("30.12345"), totalAllocatedAmount: d("12.10005"),
          totalOutstandingAmount: d("18.02340"), totalOverdueOutstandingAmount: d("8.00001"),
          totalCount: 4n, openCount: 1n, partiallySettledCount: 1n, settledCount: 1n,
          cancelledCount: 1n, overdueCount: 1n,
          totalReceivedAmount: d("20.50010"), totalActiveAllocatedAmount: d("16.00005"),
          unallocatedPaymentAmount: d("4.50005"), unallocatedPaymentCount: 2n,
        }),
        groupRow({ groupIdentity: "customer-a", customerId: "customer-a", currencyCode: "USD" }),
        groupRow({ groupIdentity: "customer-b", customerId: "customer-b", debtorDisplayName: "Second debtor" }),
        groupRow({ groupKind: "RECEIVABLE", groupIdentity: "ar-null-a", customerId: null }),
        groupRow({ groupKind: "RECEIVABLE", groupIdentity: "ar-null-b", customerId: null }),
      ])
      .mockResolvedValueOnce([{ total: 8n }]);
    const prisma = {
      $queryRaw: queryRaw,
      tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) },
    };
    const service = new FinanceReadService(prisma as unknown as PrismaService);

    const result = await service.listAccountReceivableGroups("tenant-a", { page: 2, pageSize: 5 });

    expect(result).toMatchObject({ total: 8, page: 2, pageSize: 5, totalPages: 2 });
    expect(result.groups).toHaveLength(5);
    expect(result.groups[0]).toEqual(expect.objectContaining({
      customerId: "customer-a", currencyCode: "CRC",
      totalOriginalAmount: "30.12345", totalAllocatedAmount: "12.10005",
      totalOutstandingAmount: "18.0234", totalOverdueOutstandingAmount: "8.00001",
      totalReceivedAmount: "20.5001", totalActiveAllocatedAmount: "16.00005",
      unallocatedPaymentAmount: "4.50005", unallocatedPaymentCount: 2,
      counts: { total: 4, open: 1, partiallySettled: 1, settled: 1, cancelled: 1, overdue: 1 },
    }));
    expect(result.groups[1]).toEqual(expect.objectContaining({ customerId: "customer-a", currencyCode: "USD" }));
    expect(result.groups[2]).toEqual(expect.objectContaining({ customerId: "customer-b", currencyCode: "CRC" }));
    expect(result.groups[3].groupKey).not.toBe(result.groups[4].groupKey);
    expect(result.groups.slice(3).map((group) => group.customerId)).toEqual([null, null]);
    expect(result.groups[1]).toMatchObject({ unallocatedPaymentAmount: "0.00", unallocatedPaymentCount: 0 });
    expect(d(result.groups[0].totalReceivedAmount)).toEqual(
      d(result.groups[0].totalActiveAllocatedAmount).plus(d(result.groups[0].unallocatedPaymentAmount)),
    );

    const pageSql = rawSql(queryRaw, 0);
    expect(pageSql).toContain('COALESCE("customerId", "id")');
    expect(pageSql).toContain('GROUP BY');
    expect(pageSql).toContain('OFFSET');
    expect(pageSql).toContain('LIMIT');
    expect(pageSql).toContain('"status" <> \'CANCELLED\'');
    expect(pageSql).toContain('"originalAmount" - "outstandingAmount"');
    expect(pageSql).toContain("'OPEN', 'PARTIALLY_SETTLED'");
    expect(pageSql).toContain("unallocated_payments");
    expect(pageSql).toContain("received_payments");
    expect(pageSql).toContain("active_payment_allocations");
    expect(pageSql).toContain('SUM("receivedAmount") AS "totalReceivedAmount"');
    expect(pageSql).toContain('SUM(allocation."amount") AS "totalActiveAllocatedAmount"');
    expect(pageSql).toContain('"availableAmount" >');
    expect(pageSql).toContain("'RECEIVED', 'PARTIALLY_ALLOCATED'");
    expect(pageSql).toContain('payment."status" <> \'CANCELLED\'');
    expect(pageSql).toContain('allocation."status" = \'ACTIVE\'');
    expect(pageSql).toContain('payment."customerId" IS NOT NULL');
    expect(pageSql).toContain('payment."currencyCode"');
    expect(pageSql).toContain('paged."customerId" = received_payments."customerId"');
    expect(pageSql).toContain('paged."currencyCode" = active_payment_allocations."currencyCode"');
    expect(queryRaw.mock.calls[0]).toEqual(expect.arrayContaining([new Date("2026-08-31T00:00:00.000Z"), "tenant-a", 5, 5]));
    expect(prisma).not.toHaveProperty("client");
    expect(prisma).not.toHaveProperty("billingDocument");
    expect(prisma).not.toHaveProperty("payment");
    jest.useRealTimers();
  });

  it("loads one opaque group lazily with tenant scope, deterministic AR pagination, and no child relations", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-31T17:00:00.000Z"));
    const findMany = jest.fn().mockResolvedValue([receivable()]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = {
      accountReceivable: { findMany, count },
      tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) },
    };
    const service = new FinanceReadService(prisma as unknown as PrismaService);
    const key = encodedGroupKey("CUSTOMER", "customer-a", "CRC");

    await expect(service.listAccountReceivableGroupItems("tenant-auth", key, { page: 2, pageSize: 5 })).resolves.toMatchObject({
      groupKey: key, total: 1, page: 2, pageSize: 5, totalPages: 1,
      accountReceivables: [{ id: "ar-a", outstandingAmount: "3.33333", isOverdue: true }],
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-auth", customerId: "customer-a", currencyCode: "CRC" },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }], skip: 5, take: 5,
      select: expect.any(Object),
    }));
    expect(findMany.mock.calls[0][0]).not.toHaveProperty("include");
    expect(count).toHaveBeenCalledWith({ where: { tenantId: "tenant-auth", customerId: "customer-a", currencyCode: "CRC" } });
    jest.useRealTimers();
  });

  it("does not expose a foreign-tenant or mismatched defensive AR group", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      accountReceivable: { findMany, count },
      tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) },
    };
    const service = new FinanceReadService(prisma as unknown as PrismaService);
    const key = encodedGroupKey("RECEIVABLE", "ar-foreign", "USD");

    await expect(service.listAccountReceivableGroupItems("tenant-a", key, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-a", id: "ar-foreign", customerId: null, currencyCode: "USD" },
    }));
    expect(count).toHaveBeenCalledTimes(1);
  });

  it("discovers paginated payments with exact strings and authoritative available-only constraints", async () => {
    const findMany = jest.fn().mockResolvedValue([
      paymentListRow({ receivedAmount: d("123.12345"), availableAmount: d("23.00005") }),
    ]);
    const count = jest.fn().mockResolvedValue(21);
    const prisma = { payment: { findMany, count } };
    const service = new FinanceReadService(prisma as unknown as PrismaService);

    await expect(service.listPayments("tenant-auth", {
      page: 2, pageSize: 10, customerId: "customer-a", currency: "CRC", availableOnly: true,
    })).resolves.toEqual({
      payments: [expect.objectContaining({ id: "payment-a", receiptNumber: "RCP-2026-000001", receivedAmount: "123.12345", availableAmount: "23.00005" })],
      total: 21, page: 2, pageSize: 10, totalPages: 3,
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: "tenant-auth", customerId: "customer-a", currencyCode: "CRC",
        AND: [{
          availableAmount: { gt: new Prisma.Decimal(0) },
          status: { in: ["RECEIVED", "PARTIALLY_ALLOCATED"] },
        }],
      },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }], skip: 10, take: 10,
    }));
    expect(findMany.mock.calls[0][0]).not.toHaveProperty("include");
    expect(prisma).not.toHaveProperty("accountReceivable");
  });

  it("aggregates paginated unallocated payment balances by customer and currency without related lookups", async () => {
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([{
        customerId: "customer-a", currencyCode: "CRC", payerDisplayName: "Payer",
        payerIdentificationType: "01", payerIdentificationNumber: "123",
        unallocatedPaymentAmount: d("23.00005"), unallocatedPaymentCount: 2n,
      }])
      .mockResolvedValueOnce([{ total: 21n }]);
    const prisma = { $queryRaw: queryRaw };
    const service = new FinanceReadService(prisma as unknown as PrismaService);

    await expect(service.listUnallocatedPaymentBalances("tenant-auth", { page: 2, pageSize: 10 })).resolves.toEqual({
      balances: [{
        customerId: "customer-a",
        debtor: { displayName: "Payer", identificationType: "01", identificationNumber: "123" },
        currencyCode: "CRC",
        unallocatedPaymentAmount: "23.00005",
        unallocatedPaymentCount: 2,
      }],
      total: 21,
      page: 2,
      pageSize: 10,
      totalPages: 3,
    });
    const pageSql = rawSql(queryRaw, 0);
    const countSql = rawSql(queryRaw, 1);
    expect(pageSql).toContain('FROM "payments"');
    expect(pageSql).toContain('"customerId" IS NOT NULL');
    expect(pageSql).toContain('"availableAmount" >');
    expect(pageSql).toContain("'RECEIVED', 'PARTIALLY_ALLOCATED'");
    expect(pageSql).toContain('GROUP BY "customerId", "currencyCode"');
    expect(pageSql).toContain('LIMIT');
    expect(pageSql).toContain('OFFSET');
    expect(countSql).toContain('GROUP BY "customerId", "currencyCode"');
    expect(queryRaw.mock.calls[0]).toEqual(expect.arrayContaining(["tenant-auth", 10, 10]));
    expect(prisma).not.toHaveProperty("accountReceivable");
    expect(prisma).not.toHaveProperty("client");
    expect(prisma).not.toHaveProperty("billingDocument");
  });

  it.each(["FULLY_ALLOCATED", "CANCELLED"] as const)(
    "combines explicit %s status with available-only so the payment cannot match",
    async (status) => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { payment: { findMany, count: jest.fn().mockResolvedValue(0) } };
    const service = new FinanceReadService(prisma as unknown as PrismaService);

    await service.listPayments("tenant-a", { status, availableOnly: true });

    expect(findMany.mock.calls[0][0].where.AND).toEqual([
      { status },
      {
        availableAmount: { gt: new Prisma.Decimal(0) },
        status: { in: ["RECEIVED", "PARTIALLY_ALLOCATED"] },
      },
    ]);
  });
});

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: "payment-a", receiptNumber: "RCP-2026-000001", customerId: "customer-a", payerDisplayName: "Payer", payerIdentificationType: null, payerIdentificationNumber: null,
    currencyCode: "CRC", receivedAmount: new Prisma.Decimal("10.12345"), availableAmount: new Prisma.Decimal("6.00000"), receivedAt: new Date(), paymentMethod: "CASH", externalReference: null, description: null, status: "PARTIALLY_ALLOCATED", cancelledAt: null,
    allocations: [{ id: "allocation-a", accountReceivableId: "ar-a", amount: new Prisma.Decimal("4.12345"), status: "ACTIVE", allocatedAt: new Date(), reversal: null, accountReceivable: { id: "ar-a", currencyCode: "CRC", originalAmount: new Prisma.Decimal("10"), outstandingAmount: new Prisma.Decimal("5.87655"), status: "PARTIALLY_SETTLED" } }],
    ...overrides,
  };
}

function suggestionPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "payment-a",
    customerId: "customer-a",
    currencyCode: "CRC",
    receivedAmount: d("10"),
    availableAmount: d("5"),
    status: "RECEIVED",
    ...overrides,
  };
}

function suggestionReceivable(overrides: Record<string, unknown> = {}) {
  return {
    id: "ar-a",
    customerId: "customer-a",
    currencyCode: "CRC",
    originalAmount: d("10"),
    outstandingAmount: d("5"),
    status: "OPEN",
    ...overrides,
  };
}

function auditRow(
  entityType: string,
  entityId: string,
  action: string,
  actorUserId: string,
  actorName: string,
  afterJson: Record<string, unknown> = {},
) {
  return {
    entityType,
    entityId,
    action,
    actorUserId,
    actorName,
    createdAt: new Date("2026-08-31T12:00:00.000Z"),
    afterJson,
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

function d(value: string) { return new Prisma.Decimal(value); }

function groupRow(overrides: Record<string, unknown> = {}) {
  return {
    groupKind: "CUSTOMER", groupIdentity: "customer-a", customerId: "customer-a", currencyCode: "CRC",
    debtorDisplayName: "Debtor", debtorIdentificationType: "01", debtorIdentificationNumber: "123",
    totalOriginalAmount: d("10"), totalAllocatedAmount: d("0"), totalOutstandingAmount: d("10"),
    totalOverdueOutstandingAmount: d("0"), totalCount: 1n, openCount: 1n, partiallySettledCount: 0n,
    settledCount: 0n, cancelledCount: 0n, overdueCount: 0n,
    totalReceivedAmount: null, totalActiveAllocatedAmount: null,
    ...overrides,
  };
}

function encodedGroupKey(kind: "CUSTOMER" | "RECEIVABLE", identity: string, currencyCode: string) {
  return Buffer.from(JSON.stringify({ version: 1, kind, identity, currencyCode }), "utf8").toString("base64url");
}

function rawSql(mock: jest.Mock, call: number): string {
  return (mock.mock.calls[call][0] as TemplateStringsArray).join("?");
}

function paymentListRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "payment-a", receiptNumber: "RCP-2026-000001", customerId: "customer-a", payerDisplayName: "Payer",
    payerIdentificationType: "01", payerIdentificationNumber: "123", currencyCode: "CRC",
    receivedAmount: d("10"), availableAmount: d("10"), receivedAt: new Date("2026-08-31T12:00:00.000Z"),
    paymentMethod: "BANK_TRANSFER", externalReference: "bank-a", description: "Payment",
    status: "RECEIVED", cancelledAt: null, ...overrides,
  };
}

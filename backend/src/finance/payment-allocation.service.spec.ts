import { AccountReceivableStatus, PaymentAllocationStatus, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  PAYMENT_ALLOCATION_ERRORS,
  PaymentAllocationService,
  type PaymentAllocationCommand,
} from "./payment-allocation.service";

describe("PaymentAllocationService", () => {
  it("fully settles one receivable and fully allocates the payment", async () => {
    const c = context({ payment: payment("10.00000"), receivables: [receivable("ar-a", "10.00000")] });
    await c.service.allocate(command([{ accountReceivableId: "ar-a", amount: d("10.00000"), allocationDeduplicationKey: "a" }]));
    expect(c.tx.paymentAllocation.createMany.mock.calls[0][0].data[0]).toMatchObject({ tenantId: "tenant-a", paymentId: "payment-a", accountReceivableId: "ar-a", allocationDeduplicationKey: "a", status: PaymentAllocationStatus.ACTIVE });
    expect(c.tx.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ availableAmount: d("0"), status: PaymentStatus.FULLY_ALLOCATED }) }));
    expect(c.tx.accountReceivable.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ outstandingAmount: d("0"), status: AccountReceivableStatus.SETTLED, settledAt: expect.any(Date) }) }));
  });

  it("partially settles one receivable and preserves five-decimal balances", async () => {
    const c = context({ payment: payment("10.12345"), receivables: [receivable("ar-a", "20.12345")] });
    await c.service.allocate(command([{ accountReceivableId: "ar-a", amount: d("3.12345"), allocationDeduplicationKey: "a" }]));
    expect(c.tx.payment.update.mock.calls[0][0].data.availableAmount.toFixed()).toBe("7");
    const data = c.tx.accountReceivable.update.mock.calls[0][0].data;
    expect(data.outstandingAmount.toFixed()).toBe("17"); expect(data.status).toBe(AccountReceivableStatus.PARTIALLY_SETTLED); expect(data.settledAt).toBeNull();
  });

  it("splits one payment across sorted receivables with one shared settledAt clock", async () => {
    const c = context({ payment: payment("10.00000"), receivables: [receivable("ar-b", "4.00000"), receivable("ar-a", "6.00000")] });
    await c.service.allocate(command([
      { accountReceivableId: "ar-b", amount: d("4.00000"), allocationDeduplicationKey: "b" },
      { accountReceivableId: "ar-a", amount: d("6.00000"), allocationDeduplicationKey: "a" },
    ]));
    expect(c.tx.accountReceivable.update).toHaveBeenCalledTimes(2);
    const [first, second] = c.tx.accountReceivable.update.mock.calls.map((call) => call[0].data.settledAt);
    expect(first).toBe(second);
    expect(rawSql(c.tx.$queryRaw, 1)).toContain('ORDER BY "id" ASC');
    expect(c.tx.billingAuditLog.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [
      expect.objectContaining({ entityType: "FINANCE_PAYMENT_ALLOCATION", entityId: "allocation-b", action: "APPLIED", actorUserId: "user-a", actorName: "Finance User" }),
      expect.objectContaining({ entityType: "FINANCE_PAYMENT_ALLOCATION", entityId: "allocation-a", action: "APPLIED", actorUserId: "user-a", actorName: "Finance User" }),
    ] }));
  });

  it.each([
    ["foreign payment", { paymentLock: [] }, PAYMENT_ALLOCATION_ERRORS.PAYMENT_INVALID],
    ["foreign receivable", { receivableLockCount: 0 }, PAYMENT_ALLOCATION_ERRORS.RECEIVABLE_INVALID],
    ["cross currency", { receivables: [receivable("ar-a", "10", { currencyCode: "USD" })] }, PAYMENT_ALLOCATION_ERRORS.CURRENCY_MISMATCH],
    ["cancelled payment", { payment: payment("10", { status: PaymentStatus.CANCELLED }) }, PAYMENT_ALLOCATION_ERRORS.PAYMENT_INVALID],
    ["cancelled receivable", { receivables: [receivable("ar-a", "10", { status: AccountReceivableStatus.CANCELLED })] }, PAYMENT_ALLOCATION_ERRORS.RECEIVABLE_INVALID],
    ["settled receivable", { receivables: [receivable("ar-a", "0", { status: AccountReceivableStatus.SETTLED })] }, PAYMENT_ALLOCATION_ERRORS.RECEIVABLE_INVALID],
  ])("rejects invalid tenant/currency/state: %s", async (_, options, code) => {
    const c = context(options as Parameters<typeof context>[0]);
    await expectCode(c.service.allocate(command([{ accountReceivableId: "ar-a", amount: d("1"), allocationDeduplicationKey: "a" }])), code);
    expect(c.tx.paymentAllocation.createMany).not.toHaveBeenCalled();
  });

  it.each([
    ["payment over-allocation", payment("5"), receivable("ar-a", "10"), d("6"), PAYMENT_ALLOCATION_ERRORS.PAYMENT_INSUFFICIENT],
    ["receivable over-settlement", payment("10"), receivable("ar-a", "5"), d("6"), PAYMENT_ALLOCATION_ERRORS.RECEIVABLE_INSUFFICIENT],
  ])("rejects balance underflow: %s", async (_, currentPayment, currentReceivable, amount, code) => {
    const c = context({ payment: currentPayment, receivables: [currentReceivable] });
    await expectCode(c.service.allocate(command([{ accountReceivableId: "ar-a", amount, allocationDeduplicationKey: "a" }])), code);
  });

  it.each([
    ["duplicate receivable", [{ accountReceivableId: "ar-a", amount: d("1"), allocationDeduplicationKey: "a" }, { accountReceivableId: "ar-a", amount: d("1"), allocationDeduplicationKey: "b" }]],
    ["duplicate key", [{ accountReceivableId: "ar-a", amount: d("1"), allocationDeduplicationKey: "a" }, { accountReceivableId: "ar-b", amount: d("1"), allocationDeduplicationKey: "a" }]],
    ["invalid amount", [{ accountReceivableId: "ar-a", amount: d("1.000001"), allocationDeduplicationKey: "a" }]],
  ])("rejects duplicate or malformed commands: %s", async (_, allocations) => {
    const c = context({ receivables: [receivable("ar-a", "10"), receivable("ar-b", "10")] });
    await expectCode(c.service.allocate(command(allocations)), PAYMENT_ALLOCATION_ERRORS.INVALID);
  });

  it("accepts exact idempotent and reversed winners without reapplying balances", async () => {
    const existing = allocation("a", "ar-a", "5", { status: PaymentAllocationStatus.REVERSED });
    const c = context({ payment: payment("0", { receivedAmount: d("5"), availableAmount: d("0"), status: PaymentStatus.FULLY_ALLOCATED }), receivables: [receivable("ar-a", "0", { originalAmount: d("5"), status: AccountReceivableStatus.SETTLED })], allocations: [existing] });
    await c.service.allocate(command([{ accountReceivableId: "ar-a", amount: d("5"), allocationDeduplicationKey: "a" }]));
    expect(c.tx.paymentAllocation.createMany).not.toHaveBeenCalled(); expect(c.tx.payment.update).not.toHaveBeenCalled(); expect(c.tx.accountReceivable.update).not.toHaveBeenCalled();
  });

  it("accepts an exact retry after partial allocation without reapplying balances", async () => {
    const existing = allocation("a", "ar-a", "3.00000");
    const c = context({
      payment: payment("7.00000", { receivedAmount: d("10.00000"), status: PaymentStatus.PARTIALLY_ALLOCATED }),
      receivables: [receivable("ar-a", "7.00000", { originalAmount: d("10.00000"), status: AccountReceivableStatus.PARTIALLY_SETTLED })],
      allocations: [existing],
    });

    await c.service.allocate(command([{ accountReceivableId: "ar-a", amount: d("3.00000"), allocationDeduplicationKey: "a" }]));

    expect(c.tx.paymentAllocation.createMany).not.toHaveBeenCalled();
    expect(c.tx.payment.update).not.toHaveBeenCalled();
    expect(c.tx.accountReceivable.update).not.toHaveBeenCalled();
    expect(c.tx.billingAuditLog.createMany).not.toHaveBeenCalled();
  });

  it("fails the transaction before balance updates when allocation audit persistence fails", async () => {
    const c = context();
    c.tx.billingAuditLog.createMany.mockRejectedValueOnce(new Error("audit write failed"));

    await expectCode(c.service.allocate(command([
      { accountReceivableId: "ar-a", amount: d("1"), allocationDeduplicationKey: "a" },
    ])), PAYMENT_ALLOCATION_ERRORS.PERSISTENCE_FAILED);

    expect(c.tx.payment.update).not.toHaveBeenCalled();
    expect(c.tx.accountReceivable.update).not.toHaveBeenCalled();
  });

  it("accepts an exact post-create winner and rejects a contradictory concurrent winner before balance mutation", async () => {
    const exact = context();
    exact.tx.paymentAllocation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([allocation("a", "ar-a", "1")]);

    await exact.service.allocate(command([{ accountReceivableId: "ar-a", amount: d("1"), allocationDeduplicationKey: "a" }]));

    expect(exact.tx.paymentAllocation.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(exact.tx.payment.update).toHaveBeenCalledTimes(1);
    expect(exact.tx.accountReceivable.update).toHaveBeenCalledTimes(1);

    const contradictory = context();
    contradictory.tx.paymentAllocation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([allocation("a", "ar-b", "1")]);

    await expectCode(contradictory.service.allocate(command([{ accountReceivableId: "ar-a", amount: d("1"), allocationDeduplicationKey: "a" }])), PAYMENT_ALLOCATION_ERRORS.CONFLICT);
    expect(contradictory.tx.paymentAllocation.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(contradictory.tx.payment.update).not.toHaveBeenCalled();
    expect(contradictory.tx.accountReceivable.update).not.toHaveBeenCalled();
  });

  it("does not replace settledAt for a winner-only settled retry", async () => {
    const settledAt = new Date("2026-08-27T00:00:00.000Z");
    const settledReceivable = receivable("ar-a", "0", { originalAmount: d("5"), status: AccountReceivableStatus.SETTLED, settledAt });
    const c = context({
      payment: payment("0", { receivedAmount: d("5"), availableAmount: d("0"), status: PaymentStatus.FULLY_ALLOCATED }),
      receivables: [settledReceivable],
      allocations: [allocation("a", "ar-a", "5")],
    });

    await c.service.allocate(command([{ accountReceivableId: "ar-a", amount: d("5"), allocationDeduplicationKey: "a" }]));

    expect(c.tx.paymentAllocation.createMany).not.toHaveBeenCalled();
    expect(c.tx.payment.update).not.toHaveBeenCalled();
    expect(c.tx.accountReceivable.update).not.toHaveBeenCalled();
    expect((settledReceivable as typeof settledReceivable & { settledAt?: Date }).settledAt).toBe(settledAt);
  });

  it("applies only genuinely new items in a mixed retry", async () => {
    const existing = allocation("a", "ar-a", "2");
    const c = context({ payment: payment("10"), receivables: [receivable("ar-a", "10"), receivable("ar-b", "10")], allocations: [existing] });
    await c.service.allocate(command([
      { accountReceivableId: "ar-a", amount: d("2"), allocationDeduplicationKey: "a" },
      { accountReceivableId: "ar-b", amount: d("3"), allocationDeduplicationKey: "b" },
    ]));
    expect(c.tx.paymentAllocation.createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(c.tx.paymentAllocation.createMany.mock.calls[0][0].data[0].allocationDeduplicationKey).toBe("b");
    expect(c.tx.payment.update.mock.calls[0][0].data.availableAmount.toFixed()).toBe("7");
  });

  it("rejects a contradictory winner before all balance mutation", async () => {
    const c = context({ allocations: [allocation("a", "ar-b", "1")] });
    await expectCode(c.service.allocate(command([{ accountReceivableId: "ar-a", amount: d("1"), allocationDeduplicationKey: "a" }])), PAYMENT_ALLOCATION_ERRORS.CONFLICT);
    expect(c.tx.paymentAllocation.createMany).not.toHaveBeenCalled(); expect(c.tx.payment.update).not.toHaveBeenCalled();
  });

  it("uses payment-first, receivable-sorted, then allocation-idempotency locks", async () => {
    const c = context({ receivables: [receivable("ar-b", "10"), receivable("ar-a", "10")] });
    await c.service.allocate(command([
      { accountReceivableId: "ar-b", amount: d("1"), allocationDeduplicationKey: "b" },
      { accountReceivableId: "ar-a", amount: d("1"), allocationDeduplicationKey: "a" },
    ]));
    expect(rawSql(c.tx.$queryRaw, 0)).toContain('FROM "payments"');
    expect(rawSql(c.tx.$queryRaw, 1)).toContain('FROM "account_receivables"');
    expect(rawSql(c.tx.$queryRaw, 1)).toContain('ORDER BY "id" ASC');
    expect(rawSql(c.tx.$queryRaw, 2)).toContain('FROM "payment_allocations"');
    const receivableLockArgs = c.tx.$queryRaw.mock.calls[1] as unknown as unknown[];
    expect(receivableLockArgs[2]).toEqual(expect.objectContaining({ values: ["ar-a", "ar-b"] }));
  });

  it("rolls back subsequent mutation paths when allocation creation or balance update fails", async () => {
    let c = context(); c.tx.paymentAllocation.createMany.mockRejectedValueOnce(new Error("write"));
    await expectCode(c.service.allocate(command([{ accountReceivableId: "ar-a", amount: d("1"), allocationDeduplicationKey: "a" }])), PAYMENT_ALLOCATION_ERRORS.PERSISTENCE_FAILED);
    expect(c.tx.payment.update).not.toHaveBeenCalled();
    c = context(); c.tx.payment.update.mockRejectedValueOnce(new Error("write"));
    await expectCode(c.service.allocate(command([{ accountReceivableId: "ar-a", amount: d("1"), allocationDeduplicationKey: "a" }])), PAYMENT_ALLOCATION_ERRORS.PERSISTENCE_FAILED);
    expect(c.tx.accountReceivable.update).not.toHaveBeenCalled();
  });

  it("uses bounded Payment, AccountReceivable and Allocation access only with safe errors", async () => {
    const c = context(); await c.service.allocate(command([{ accountReceivableId: "ar-a", amount: d("1"), allocationDeduplicationKey: "a" }]));
    expect(Object.keys(c.tx).sort()).toEqual(["$queryRaw", "accountReceivable", "billingAuditLog", "payment", "paymentAllocation"]);
    expect(c.tx.payment.findFirst).toHaveBeenCalledTimes(1); expect(c.tx.accountReceivable.findMany).toHaveBeenCalledTimes(1);
    const error = await capture(c.service.allocate(command([{ accountReceivableId: "ar-a", amount: {} as Prisma.Decimal, allocationDeduplicationKey: "a" }])));
    expect(error.message).toBe(PAYMENT_ALLOCATION_ERRORS.INVALID); expect(error.message).not.toMatch(/payment-a|database|contract|billing/i);
  });
});

function d(value: string) { return new Prisma.Decimal(value); }
function command(allocations: PaymentAllocationCommand["allocations"]): PaymentAllocationCommand { return { tenantId: "tenant-a", actor: { userId: "user-a", name: "Finance User" }, paymentId: "payment-a", allocations }; }
function payment(available: string, overrides: Record<string, unknown> = {}) { return { id: "payment-a", tenantId: "tenant-a", currencyCode: "CRC", receivedAmount: d(available), availableAmount: d(available), status: PaymentStatus.RECEIVED, ...overrides }; }
function receivable(id: string, outstanding: string, overrides: Record<string, unknown> = {}) { return { id, tenantId: "tenant-a", currencyCode: "CRC", originalAmount: d(outstanding), outstandingAmount: d(outstanding), status: AccountReceivableStatus.OPEN, ...overrides }; }
function allocation(key: string, accountReceivableId: string, amount: string, overrides: Record<string, unknown> = {}) { return { id: `allocation-${key}`, tenantId: "tenant-a", paymentId: "payment-a", accountReceivableId, allocationDeduplicationKey: key, amount: d(amount), status: PaymentAllocationStatus.ACTIVE, ...overrides }; }
function context(options: { payment?: ReturnType<typeof payment>; receivables?: Array<ReturnType<typeof receivable>>; allocations?: Array<ReturnType<typeof allocation>>; paymentLock?: Array<{ id: string }>; receivableLockCount?: number } = {}) {
  const currentPayment = options.payment ?? payment("10"); const currentReceivables = options.receivables ?? [receivable("ar-a", "10")]; const rows = [...(options.allocations ?? [])];
  const queryRaw = jest.fn(async (strings: TemplateStringsArray) => { const sql = strings.join("?"); if (sql.includes('FROM "payments"')) return options.paymentLock ?? [{ id: currentPayment.id }]; if (sql.includes('FROM "account_receivables"')) return currentReceivables.slice(0, options.receivableLockCount ?? currentReceivables.length).map((item) => ({ id: item.id })); return rows.map((item) => ({ id: item.id })); });
  const createMany = jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
    for (const item of data) {
      if (!rows.some((row) => row.allocationDeduplicationKey === item.allocationDeduplicationKey)) {
        rows.push(allocation(
          item.allocationDeduplicationKey as string,
          item.accountReceivableId as string,
          (item.amount as Prisma.Decimal).toFixed(),
        ));
      }
    }
    return { count: data.length };
  });
  const tx = { $queryRaw: queryRaw, billingAuditLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) }, payment: { findFirst: jest.fn().mockResolvedValue(currentPayment), update: jest.fn().mockResolvedValue(currentPayment) }, accountReceivable: { findMany: jest.fn().mockResolvedValue(currentReceivables), update: jest.fn().mockResolvedValue({}) }, paymentAllocation: { findMany: jest.fn().mockImplementation(async ({ where }: { where: { allocationDeduplicationKey: { in: string[] } } }) => rows.filter((row) => where.allocationDeduplicationKey.in.includes(row.allocationDeduplicationKey))), createMany } };
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => unknown) => work(tx)) } as unknown as PrismaService;
  return { service: new PaymentAllocationService(prisma), tx };
}
function rawSql(mock: jest.Mock, index: number): string { return (mock.mock.calls[index][0] as TemplateStringsArray).join("?"); }
async function expectCode(value: Promise<unknown>, code: string) { await expect(value).rejects.toThrow(code); }
async function capture(value: Promise<unknown>): Promise<Error> { try { await value; throw new Error("expected error"); } catch (error) { return error as Error; } }

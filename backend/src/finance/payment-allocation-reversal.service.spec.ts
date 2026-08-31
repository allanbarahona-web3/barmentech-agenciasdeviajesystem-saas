import {
  AccountReceivableStatus,
  PaymentAllocationStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  PAYMENT_ALLOCATION_REVERSAL_ERRORS,
  PaymentAllocationReversalService,
  type PaymentAllocationReversalCommand,
} from "./payment-allocation-reversal.service";

describe("PaymentAllocationReversalService", () => {
  it("reverses a fully consuming allocation to RECEIVED and OPEN and clears settledAt", async () => {
    const c = context();

    const result = await c.service.reverse(command());

    expect(result).toMatchObject({ paymentAllocationId: "allocation-a", reason: "Duplicate receipt" });
    expect(c.tx.paymentAllocationReversal.createMany.mock.calls[0][0]).toMatchObject({
      data: [expect.objectContaining({
        tenantId: "tenant-a",
        paymentAllocationId: "allocation-a",
        reversalDeduplicationKey: "reversal-a",
        reason: "Duplicate receipt",
        reversedAt: expect.any(Date),
      })],
      skipDuplicates: true,
    });
    expect(c.tx.paymentAllocation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: PaymentAllocationStatus.ACTIVE }),
      data: { status: PaymentAllocationStatus.REVERSED },
    }));
    expect(c.tx.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { availableAmount: d("10"), status: PaymentStatus.RECEIVED },
    }));
    expect(c.tx.accountReceivable.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { outstandingAmount: d("10"), status: AccountReceivableStatus.OPEN, settledAt: null },
    }));
  });

  it("reverses one allocation while others remain and preserves exact five-decimal balances", async () => {
    const c = context({
      allocation: allocation({ amount: d("2.12345") }),
      payment: payment({ receivedAmount: d("10.54321"), availableAmount: d("3.11111"), status: PaymentStatus.PARTIALLY_ALLOCATED }),
      receivable: receivable({ originalAmount: d("20.54321"), outstandingAmount: d("4.11111"), status: AccountReceivableStatus.PARTIALLY_SETTLED }),
    });

    await c.service.reverse(command());

    expect(c.tx.payment.update.mock.calls[0][0].data.availableAmount.toFixed()).toBe("5.23456");
    expect(c.tx.payment.update.mock.calls[0][0].data.status).toBe(PaymentStatus.PARTIALLY_ALLOCATED);
    expect(c.tx.accountReceivable.update.mock.calls[0][0].data.outstandingAmount.toFixed()).toBe("6.23456");
    expect(c.tx.accountReceivable.update.mock.calls[0][0].data.status).toBe(AccountReceivableStatus.PARTIALLY_SETTLED);
    expect(c.tx.accountReceivable.update.mock.calls[0][0].data.settledAt).toBeNull();
  });

  it("uses the persisted full allocation amount and exposes no command amount", async () => {
    const c = context({
      allocation: allocation({ amount: d("4.00000") }),
      payment: payment({ receivedAmount: d("10"), availableAmount: d("1") }),
      receivable: receivable({ originalAmount: d("10"), outstandingAmount: d("2") }),
    });
    const attemptedOverride = { ...command(), amount: d("1") } as PaymentAllocationReversalCommand;

    await c.service.reverse(attemptedOverride);

    expect(c.tx.payment.update.mock.calls[0][0].data.availableAmount.equals(d("5"))).toBe(true);
    expect(c.tx.accountReceivable.update.mock.calls[0][0].data.outstandingAmount.equals(d("6"))).toBe(true);
    expect(c.tx.paymentAllocationReversal.createMany.mock.calls[0][0].data[0]).not.toHaveProperty("amount");
  });

  it("accepts an exact retry without restoring twice, including after later state changes", async () => {
    const winner = reversal();
    const c = context({
      allocation: allocation({ status: PaymentAllocationStatus.REVERSED }),
      payment: payment({ availableAmount: d("4"), status: PaymentStatus.PARTIALLY_ALLOCATED }),
      receivable: receivable({ outstandingAmount: d("4"), status: AccountReceivableStatus.PARTIALLY_SETTLED }),
      reversals: [winner],
    });

    await expect(c.service.reverse(command())).resolves.toBe(winner);

    expect(c.tx.paymentAllocationReversal.createMany).not.toHaveBeenCalled();
    expect(c.tx.paymentAllocation.updateMany).not.toHaveBeenCalled();
    expect(c.tx.payment.update).not.toHaveBeenCalled();
    expect(c.tx.accountReceivable.update).not.toHaveBeenCalled();
    expect(c.tx.payment.findFirst).not.toHaveBeenCalled();
    expect(c.tx.accountReceivable.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ["same key for another allocation", [reversal({ paymentAllocationId: "allocation-b" })]],
    ["different key for the same allocation", [reversal({ reversalDeduplicationKey: "reversal-b" })]],
    ["different normalized reason", [reversal({ reason: "Different reason" })]],
  ])("rejects a contradictory reversal winner: %s", async (_, reversals) => {
    const c = context({ allocation: allocation({ status: PaymentAllocationStatus.REVERSED }), reversals });

    await expectCode(c.service.reverse(command()), PAYMENT_ALLOCATION_REVERSAL_ERRORS.CONFLICT);

    expect(c.tx.paymentAllocationReversal.createMany).not.toHaveBeenCalled();
    expect(c.tx.paymentAllocation.updateMany).not.toHaveBeenCalled();
    expect(c.tx.payment.update).not.toHaveBeenCalled();
    expect(c.tx.accountReceivable.update).not.toHaveBeenCalled();
  });

  it("accepts an exact concurrent createMany winner and restores balances once", async () => {
    const c = context();
    c.tx.paymentAllocationReversal.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([reversal()]);

    await c.service.reverse(command());

    expect(c.tx.paymentAllocationReversal.createMany).toHaveBeenCalledTimes(1);
    expect(c.tx.paymentAllocation.updateMany).toHaveBeenCalledTimes(1);
    expect(c.tx.payment.update).toHaveBeenCalledTimes(1);
    expect(c.tx.accountReceivable.update).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["foreign allocation", { preliminaryIdentity: null }, PAYMENT_ALLOCATION_REVERSAL_ERRORS.ALLOCATION_INVALID],
    ["foreign payment", { paymentLock: [] }, PAYMENT_ALLOCATION_REVERSAL_ERRORS.PAYMENT_INVALID],
    ["foreign receivable", { receivableLock: [] }, PAYMENT_ALLOCATION_REVERSAL_ERRORS.RECEIVABLE_INVALID],
    ["cancelled payment", { payment: payment({ status: PaymentStatus.CANCELLED }) }, PAYMENT_ALLOCATION_REVERSAL_ERRORS.PAYMENT_INVALID],
    ["cancelled receivable", { receivable: receivable({ status: AccountReceivableStatus.CANCELLED }) }, PAYMENT_ALLOCATION_REVERSAL_ERRORS.RECEIVABLE_INVALID],
    ["currency mismatch", { receivable: receivable({ currencyCode: "USD" }) }, PAYMENT_ALLOCATION_REVERSAL_ERRORS.CURRENCY_MISMATCH],
    ["reversed without winner", { allocation: allocation({ status: PaymentAllocationStatus.REVERSED }) }, PAYMENT_ALLOCATION_REVERSAL_ERRORS.ALLOCATION_INVALID],
    ["malformed allocation amount", { allocation: allocation({ amount: d("1.000001") }) }, PAYMENT_ALLOCATION_REVERSAL_ERRORS.ALLOCATION_INVALID],
  ])("rejects tenant, currency, or state violations: %s", async (_, options, code) => {
    const c = context(options as ContextOptions);
    await expectCode(c.service.reverse(command()), code);
    expect(c.tx.paymentAllocationReversal.createMany).not.toHaveBeenCalled();
  });

  it.each([
    ["payment", { payment: payment({ receivedAmount: d("10"), availableAmount: d("5") }), allocation: allocation({ amount: d("6") }) }, PAYMENT_ALLOCATION_REVERSAL_ERRORS.PAYMENT_CAPACITY],
    ["receivable", { receivable: receivable({ originalAmount: d("10"), outstandingAmount: d("5") }), allocation: allocation({ amount: d("6") }) }, PAYMENT_ALLOCATION_REVERSAL_ERRORS.RECEIVABLE_CAPACITY],
    ["invalid payment balance", { payment: payment({ receivedAmount: d("10"), availableAmount: d("11") }) }, PAYMENT_ALLOCATION_REVERSAL_ERRORS.PAYMENT_INVALID],
    ["invalid receivable balance", { receivable: receivable({ originalAmount: d("10"), outstandingAmount: d("11") }) }, PAYMENT_ALLOCATION_REVERSAL_ERRORS.RECEIVABLE_INVALID],
  ])("rejects unsafe restoration capacity: %s", async (_, options, code) => {
    const c = context(options as ContextOptions);
    await expectCode(c.service.reverse(command()), code);
    expect(c.tx.paymentAllocationReversal.createMany).not.toHaveBeenCalled();
  });

  it("revalidates stale preliminary allocation identities after authoritative locks", async () => {
    const c = context({
      preliminaryIdentity: { paymentId: "payment-stale", accountReceivableId: "ar-stale" },
      paymentLock: [{ id: "payment-stale" }],
      receivableLock: [{ id: "ar-stale" }],
    });

    await expectCode(c.service.reverse(command()), PAYMENT_ALLOCATION_REVERSAL_ERRORS.ALLOCATION_INVALID);

    expect(c.tx.paymentAllocationReversal.createMany).not.toHaveBeenCalled();
    expect(c.tx.payment.update).not.toHaveBeenCalled();
    expect(c.tx.accountReceivable.update).not.toHaveBeenCalled();
  });

  it("verifies a post-create winner before mutating any balance", async () => {
    const c = context();
    c.tx.paymentAllocationReversal.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([reversal({ reason: "Contradictory" })]);

    await expectCode(c.service.reverse(command()), PAYMENT_ALLOCATION_REVERSAL_ERRORS.CONFLICT);

    expect(c.tx.paymentAllocation.updateMany).not.toHaveBeenCalled();
    expect(c.tx.payment.update).not.toHaveBeenCalled();
    expect(c.tx.accountReceivable.update).not.toHaveBeenCalled();
  });

  it("stops subsequent mutations after any create or update failure", async () => {
    let c = context();
    c.tx.paymentAllocationReversal.createMany.mockRejectedValueOnce(new Error("write"));
    await expectCode(c.service.reverse(command()), PAYMENT_ALLOCATION_REVERSAL_ERRORS.PERSISTENCE_FAILED);
    expect(c.tx.paymentAllocation.updateMany).not.toHaveBeenCalled();

    c = context();
    c.tx.paymentAllocation.updateMany.mockRejectedValueOnce(new Error("write"));
    await expectCode(c.service.reverse(command()), PAYMENT_ALLOCATION_REVERSAL_ERRORS.PERSISTENCE_FAILED);
    expect(c.tx.payment.update).not.toHaveBeenCalled();

    c = context();
    c.tx.payment.update.mockRejectedValueOnce(new Error("write"));
    await expectCode(c.service.reverse(command()), PAYMENT_ALLOCATION_REVERSAL_ERRORS.PERSISTENCE_FAILED);
    expect(c.tx.accountReceivable.update).not.toHaveBeenCalled();

    c = context();
    c.tx.accountReceivable.update.mockRejectedValueOnce(new Error("write"));
    await expectCode(c.service.reverse(command()), PAYMENT_ALLOCATION_REVERSAL_ERRORS.PERSISTENCE_FAILED);
    expect((c.prisma.$transaction as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it("uses deterministic payment, receivable, allocation, then reversal locks with bounded neutral access", async () => {
    const c = context();
    await c.service.reverse(command());

    expect(rawSql(c.tx.$queryRaw, 0)).toContain('FROM "payments"');
    expect(rawSql(c.tx.$queryRaw, 1)).toContain('FROM "account_receivables"');
    expect(rawSql(c.tx.$queryRaw, 2)).toContain('FROM "payment_allocations"');
    expect(rawSql(c.tx.$queryRaw, 3)).toContain('FROM "payment_allocation_reversals"');
    expect(rawSql(c.tx.$queryRaw, 3)).toContain('ORDER BY "reversalDeduplicationKey" ASC');
    expect(Object.keys(c.tx).sort()).toEqual([
      "$queryRaw", "accountReceivable", "payment", "paymentAllocation", "paymentAllocationReversal",
    ]);
    expect(c.tx.paymentAllocation.findFirst).toHaveBeenCalledTimes(2);
    expect(c.tx.payment.findFirst).toHaveBeenCalledTimes(1);
    expect(c.tx.accountReceivable.findFirst).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ ...command(), reason: "   " }],
    [{ ...command(), reversalDeduplicationKey: "" }],
    [{ ...command(), paymentAllocationId: "" }],
  ])("returns stable safe validation errors", async (invalid) => {
    const c = context();
    const error = await capture(c.service.reverse(invalid));
    expect(error.message).toBe(PAYMENT_ALLOCATION_REVERSAL_ERRORS.INVALID);
    expect(error.message).not.toMatch(/tenant-a|allocation-a|database|contract|billing|provider/i);
  });
});

type ContextOptions = {
  allocation?: ReturnType<typeof allocation>;
  payment?: ReturnType<typeof payment>;
  receivable?: ReturnType<typeof receivable>;
  reversals?: Array<ReturnType<typeof reversal>>;
  preliminaryIdentity?: { paymentId: string; accountReceivableId: string } | null;
  paymentLock?: Array<{ id: string }>;
  receivableLock?: Array<{ id: string }>;
  allocationLock?: Array<{ id: string }>;
};

function d(value: string): Prisma.Decimal { return new Prisma.Decimal(value); }
function command(): PaymentAllocationReversalCommand {
  return { tenantId: "tenant-a", paymentAllocationId: "allocation-a", reversalDeduplicationKey: "reversal-a", reason: "  Duplicate receipt  " };
}
function allocation(overrides: Record<string, unknown> = {}) {
  return { id: "allocation-a", tenantId: "tenant-a", paymentId: "payment-a", accountReceivableId: "ar-a", amount: d("10"), status: PaymentAllocationStatus.ACTIVE, ...overrides };
}
function payment(overrides: Record<string, unknown> = {}) {
  return { id: "payment-a", tenantId: "tenant-a", currencyCode: "CRC", receivedAmount: d("10"), availableAmount: d("0"), status: PaymentStatus.FULLY_ALLOCATED, ...overrides };
}
function receivable(overrides: Record<string, unknown> = {}) {
  return { id: "ar-a", tenantId: "tenant-a", currencyCode: "CRC", originalAmount: d("10"), outstandingAmount: d("0"), status: AccountReceivableStatus.SETTLED, settledAt: new Date("2026-08-01T00:00:00.000Z"), ...overrides };
}
function reversal(overrides: Record<string, unknown> = {}) {
  return { id: "reversal-a", tenantId: "tenant-a", paymentAllocationId: "allocation-a", reversalDeduplicationKey: "reversal-a", reason: "Duplicate receipt", reversedAt: new Date("2026-08-27T00:00:00.000Z"), createdAt: new Date("2026-08-27T00:00:00.000Z"), ...overrides };
}

function context(options: ContextOptions = {}) {
  const currentAllocation = options.allocation ?? allocation();
  const currentPayment = options.payment ?? payment();
  const currentReceivable = options.receivable ?? receivable();
  const rows = [...(options.reversals ?? [])];
  const preliminaryIdentity = options.preliminaryIdentity === undefined
    ? { paymentId: currentAllocation.paymentId, accountReceivableId: currentAllocation.accountReceivableId }
    : options.preliminaryIdentity;
  const queryRaw = jest.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes('FROM "payments"')) return options.paymentLock ?? [{ id: preliminaryIdentity?.paymentId ?? "" }];
    if (sql.includes('FROM "account_receivables"')) return options.receivableLock ?? [{ id: preliminaryIdentity?.accountReceivableId ?? "" }];
    if (sql.includes('FROM "payment_allocations"')) return options.allocationLock ?? [{ id: currentAllocation.id }];
    return rows.map((item) => ({ id: item.id }));
  });
  const allocationFindFirst = jest.fn()
    .mockResolvedValueOnce(preliminaryIdentity)
    .mockResolvedValueOnce(currentAllocation);
  const reversalFindMany = jest.fn(async () => rows);
  const reversalCreateMany = jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
    const item = data[0];
    if (!rows.some((row) => row.reversalDeduplicationKey === item.reversalDeduplicationKey || row.paymentAllocationId === item.paymentAllocationId)) {
      rows.push({ id: "reversal-created", createdAt: new Date(), ...item } as ReturnType<typeof reversal>);
    }
    return { count: 1 };
  });
  const tx = {
    $queryRaw: queryRaw,
    payment: { findFirst: jest.fn().mockResolvedValue(currentPayment), update: jest.fn().mockResolvedValue(currentPayment) },
    accountReceivable: { findFirst: jest.fn().mockResolvedValue(currentReceivable), update: jest.fn().mockResolvedValue(currentReceivable) },
    paymentAllocation: { findFirst: allocationFindFirst, updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    paymentAllocationReversal: { findMany: reversalFindMany, createMany: reversalCreateMany },
  };
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => unknown) => work(tx)) } as unknown as PrismaService;
  return { service: new PaymentAllocationReversalService(prisma), prisma, tx };
}

function rawSql(mock: jest.Mock, index: number): string { return (mock.mock.calls[index][0] as TemplateStringsArray).join("?"); }
async function expectCode(value: Promise<unknown>, code: string): Promise<void> { await expect(value).rejects.toThrow(code); }
async function capture(value: Promise<unknown>): Promise<Error> {
  try { await value; throw new Error("expected error"); } catch (error) { return error as Error; }
}

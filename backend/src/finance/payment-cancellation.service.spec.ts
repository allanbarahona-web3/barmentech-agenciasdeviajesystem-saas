import { PaymentAllocationStatus, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  PAYMENT_ALLOCATION_ERRORS,
  PaymentAllocationService,
} from "./payment-allocation.service";
import {
  PAYMENT_CANCELLATION_ERRORS,
  PaymentCancellationService,
  type PaymentCancellationCommand,
} from "./payment-cancellation.service";

describe("PaymentCancellationService", () => {
  it("cancels a pristine RECEIVED payment using one transaction timestamp", async () => {
    const c = context();

    const result = await c.service.cancel(command());

    expect(result.status).toBe(PaymentStatus.CANCELLED);
    expect(result.cancelledAt).toEqual(expect.any(Date));
    expect(c.tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: "payment-a", tenantId: "tenant-a", status: PaymentStatus.RECEIVED, cancelledAt: null },
      data: { status: PaymentStatus.CANCELLED, cancelledAt: result.cancelledAt },
    });
    expect(result.receivedAmount.equals(d("10"))).toBe(true);
    expect(result.availableAmount.equals(d("10"))).toBe(true);
  });

  it("cancels a RECEIVED payment after all allocations were reversed", async () => {
    const c = context({ allocations: [allocation("allocation-a", PaymentAllocationStatus.REVERSED)] });

    await expect(c.service.cancel(command())).resolves.toMatchObject({ status: PaymentStatus.CANCELLED });

    expect(c.tx.payment.updateMany).toHaveBeenCalledTimes(1);
  });

  it("allows multiple REVERSED historical allocations", async () => {
    const c = context({ allocations: [
      allocation("allocation-b", PaymentAllocationStatus.REVERSED),
      allocation("allocation-a", PaymentAllocationStatus.REVERSED),
    ] });

    await c.service.cancel(command());

    expect(c.tx.paymentAllocation.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { id: "asc" } }));
    expect(c.tx.payment.updateMany).toHaveBeenCalledTimes(1);
  });

  it("rejects an ACTIVE allocation without automatic reversal", async () => {
    const c = context({ allocations: [allocation("allocation-a", PaymentAllocationStatus.ACTIVE)] });

    await expectCode(c.service.cancel(command()), PAYMENT_CANCELLATION_ERRORS.NOT_ELIGIBLE);

    expect(c.tx.payment.updateMany).not.toHaveBeenCalled();
    expect(c.tx.paymentAllocation).not.toHaveProperty("update");
    expect(c.tx.paymentAllocation).not.toHaveProperty("updateMany");
  });

  it.each([PaymentStatus.PARTIALLY_ALLOCATED, PaymentStatus.FULLY_ALLOCATED])(
    "rejects %s payments",
    async (status) => {
      const c = context({ payment: payment({ status }) });
      await expectCode(c.service.cancel(command()), PAYMENT_CANCELLATION_ERRORS.NOT_ELIGIBLE);
      expect(c.tx.payment.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["unequal", payment({ receivedAmount: d("10"), availableAmount: d("9.99999") })],
    ["negative", payment({ availableAmount: d("-1") })],
    ["over-scale", payment({ receivedAmount: d("10.000001"), availableAmount: d("10.000001") })],
    ["overflow", payment({ receivedAmount: d("100000000000000"), availableAmount: d("100000000000000") })],
  ])("rejects inconsistent or invalid balances: %s", async (_, currentPayment) => {
    const c = context({ payment: currentPayment });
    await expectCode(c.service.cancel(command()), PAYMENT_CANCELLATION_ERRORS.NOT_ELIGIBLE);
    expect(c.tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it("accepts exact five-decimal equality", async () => {
    const c = context({ payment: payment({ receivedAmount: d("123.45678"), availableAmount: d("123.45678") }) });

    const result = await c.service.cancel(command());

    expect(result.receivedAmount.toFixed()).toBe("123.45678");
    expect(result.availableAmount.toFixed()).toBe("123.45678");
  });

  it("returns an already CANCELLED payment without mutation and preserves cancelledAt", async () => {
    const cancelledAt = new Date("2026-08-27T10:00:00.000Z");
    const c = context({ payment: payment({ status: PaymentStatus.CANCELLED, cancelledAt }) });

    const result = await c.service.cancel(command());

    expect(result.cancelledAt).toBe(cancelledAt);
    expect(c.tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an inconsistent CANCELLED payment without cancelledAt", async () => {
    const c = context({ payment: payment({ status: PaymentStatus.CANCELLED, cancelledAt: null }) });
    await expectCode(c.service.cancel(command()), PAYMENT_CANCELLATION_ERRORS.PAYMENT_INVALID);
    expect(c.tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it("accepts a concurrent CAS winner with one transition timestamp", async () => {
    const cancelledAt = new Date("2026-08-27T11:00:00.000Z");
    const winner = payment({ status: PaymentStatus.CANCELLED, cancelledAt });
    const c = context({ updateCount: 0, postCasPayment: winner });

    const result = await c.service.cancel(command());

    expect(c.tx.payment.updateMany).toHaveBeenCalledTimes(1);
    expect(c.tx.payment.findFirst).toHaveBeenCalledTimes(2);
    expect(result).toBe(winner);
    expect(result.cancelledAt).toBe(cancelledAt);
  });

  it("rejects missing or foreign-tenant payments", async () => {
    let c = context({ paymentLock: [] });
    await expectCode(c.service.cancel(command()), PAYMENT_CANCELLATION_ERRORS.PAYMENT_INVALID);
    expect(c.tx.payment.findFirst).not.toHaveBeenCalled();

    c = context({ payment: null });
    await expectCode(c.service.cancel(command()), PAYMENT_CANCELLATION_ERRORS.PAYMENT_INVALID);
    expect(c.tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it("locks Payment first and allocations in stable ascending ID order", async () => {
    const c = context({ allocations: [allocation("allocation-b", PaymentAllocationStatus.REVERSED)] });
    await c.service.cancel(command());

    expect(rawSql(c.tx.$queryRaw, 0)).toContain('FROM "payments"');
    expect(rawSql(c.tx.$queryRaw, 1)).toContain('FROM "payment_allocations"');
    expect(rawSql(c.tx.$queryRaw, 1)).toContain('ORDER BY "id" ASC');
    expect(c.tx.paymentAllocation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-a", paymentId: "payment-a" },
      orderBy: { id: "asc" },
    }));
  });

  it("fails safely when the conditional update cannot establish a winner", async () => {
    const c = context({ updateCount: 0, postCasPayment: payment({ status: PaymentStatus.RECEIVED }) });

    await expectCode(c.service.cancel(command()), PAYMENT_CANCELLATION_ERRORS.PERSISTENCE_FAILED);

    expect(c.tx.payment.updateMany).toHaveBeenCalledTimes(1);
    expect((c.prisma.$transaction as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it("converts update failure to a stable safe persistence error", async () => {
    const c = context();
    c.tx.payment.updateMany.mockRejectedValueOnce(new Error("native database failure payment-a"));

    const error = await capture(c.service.cancel(command()));

    expect(error.message).toBe(PAYMENT_CANCELLATION_ERRORS.PERSISTENCE_FAILED);
    expect(error.message).not.toMatch(/database|payment-a|tenant-a/i);
  });

  it("retains allocation-service rejection for CANCELLED payments", async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "payment-a" }]),
      payment: { findFirst: jest.fn().mockResolvedValue(payment({ status: PaymentStatus.CANCELLED, cancelledAt: new Date() })) },
    };
    const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => unknown) => work(tx)) } as unknown as PrismaService;
    const service = new PaymentAllocationService(prisma);

    await expect(service.allocate({
      tenantId: "tenant-a",
      paymentId: "payment-a",
      allocations: [{ accountReceivableId: "ar-a", amount: d("1"), allocationDeduplicationKey: "allocation-key" }],
    })).rejects.toThrow(PAYMENT_ALLOCATION_ERRORS.PAYMENT_INVALID);
  });

  it("uses bounded source-neutral access and rejects caller-controlled state fields", async () => {
    const c = context();
    const attemptedOverride = {
      ...command(), status: PaymentStatus.CANCELLED, cancelledAt: new Date(), availableAmount: d("0"), allocationIds: ["allocation-a"],
    } as PaymentCancellationCommand;

    const result = await c.service.cancel(attemptedOverride);

    expect(result.status).toBe(PaymentStatus.CANCELLED);
    expect(result.availableAmount.equals(d("10"))).toBe(true);
    expect(Object.keys(c.tx).sort()).toEqual(["$queryRaw", "payment", "paymentAllocation"]);
    expect(c.tx.payment.findFirst).toHaveBeenCalledTimes(1);
    expect(c.tx.paymentAllocation.findMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ tenantId: "", paymentId: "payment-a" }],
    [{ tenantId: "tenant-a", paymentId: "" }],
  ])("returns stable validation errors", async (invalid) => {
    const c = context();
    const error = await capture(c.service.cancel(invalid));
    expect(error.message).toBe(PAYMENT_CANCELLATION_ERRORS.INVALID);
    expect(error.message).not.toMatch(/database|contract|billing|provider|outbox/i);
  });
});

type ContextOptions = {
  payment?: ReturnType<typeof payment> | null;
  allocations?: Array<ReturnType<typeof allocation>>;
  paymentLock?: Array<{ id: string }>;
  updateCount?: number;
  postCasPayment?: ReturnType<typeof payment> | null;
};

function d(value: string): Prisma.Decimal { return new Prisma.Decimal(value); }
function command(): PaymentCancellationCommand { return { tenantId: "tenant-a", paymentId: "payment-a" }; }
function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: "payment-a", tenantId: "tenant-a", registrationDeduplicationKey: "registration-a",
    customerId: null, payerDisplayName: "Payer", payerIdentificationType: null,
    payerIdentificationNumber: null, currencyCode: "CRC", receivedAmount: d("10"), availableAmount: d("10"),
    receivedAt: new Date("2026-08-01T00:00:00.000Z"), paymentMethod: "CASH", externalReference: null,
    description: null, status: PaymentStatus.RECEIVED, cancelledAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"), updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}
function allocation(id: string, status: PaymentAllocationStatus) { return { id, status }; }

function context(options: ContextOptions = {}) {
  const initialPayment = options.payment === undefined ? payment() : options.payment;
  const allocations = options.allocations ?? [];
  let paymentRead = 0;
  const paymentFindFirst = jest.fn(async () => {
    paymentRead += 1;
    return paymentRead === 1 ? initialPayment : (options.postCasPayment ?? initialPayment);
  });
  const queryRaw = jest.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes('FROM "payments"')) return options.paymentLock ?? [{ id: "payment-a" }];
    return allocations.map((item) => ({ id: item.id }));
  });
  const tx = {
    $queryRaw: queryRaw,
    payment: {
      findFirst: paymentFindFirst,
      updateMany: jest.fn().mockResolvedValue({ count: options.updateCount ?? 1 }),
    },
    paymentAllocation: {
      findMany: jest.fn().mockResolvedValue([...allocations].sort((left, right) => left.id.localeCompare(right.id))),
    },
  };
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => unknown) => work(tx)) } as unknown as PrismaService;
  return { service: new PaymentCancellationService(prisma), prisma, tx };
}

function rawSql(mock: jest.Mock, index: number): string { return (mock.mock.calls[index][0] as TemplateStringsArray).join("?"); }
async function expectCode(value: Promise<unknown>, code: string): Promise<void> { await expect(value).rejects.toThrow(code); }
async function capture(value: Promise<unknown>): Promise<Error> {
  try { await value; throw new Error("expected error"); } catch (error) { return error as Error; }
}

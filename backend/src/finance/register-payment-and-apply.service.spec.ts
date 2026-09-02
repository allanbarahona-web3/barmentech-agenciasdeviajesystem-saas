import { AccountReceivableStatus, PaymentStatus, Prisma } from "@prisma/client";
import { applyLockedPaymentAllocations } from "./payment-allocation.service";
import { RegisterPaymentAndApplyService } from "./register-payment-and-apply.service";

jest.mock("./payment-allocation.service", () => ({ applyLockedPaymentAllocations: jest.fn() }));

const apply = applyLockedPaymentAllocations as jest.MockedFunction<typeof applyLockedPaymentAllocations>;

describe("RegisterPaymentAndApplyService", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ["equal amounts", "15", "15", "15", "0"],
    ["partial payment", "10", "15", "10", "0"],
    ["excess payment", "20", "15", "15", "5"],
  ])("applies the minimum for %s", async (_label, received, outstanding, applied, available) => {
    const c = context({ received, outstanding, available });
    await expect(c.service.execute(command())).resolves.toMatchObject({ payment: { availableAmount: available }, allocation: { amount: applied } });
    expect(apply).toHaveBeenCalledWith(expect.anything(), "tenant-a", expect.objectContaining({ userId: "user-a" }), expect.anything(), expect.anything(), [expect.objectContaining({ accountReceivableId: "ar-a", amount: expect.objectContaining({}) })]);
    expect((apply.mock.calls[0][5][0].amount as Prisma.Decimal).toFixed()).toBe(applied);
  });

  it("never plans another account receivable", async () => {
    const c = context({ received: "20", outstanding: "15", available: "5" });
    await c.service.execute(command());
    expect(apply.mock.calls[0][5]).toEqual([expect.objectContaining({ accountReceivableId: "ar-a" })]);
  });

  it.each(["PAYMENT_ALLOCATION_RECEIVABLE_INVALID", "PAYMENT_ALLOCATION_CUSTOMER_MISMATCH", "PAYMENT_ALLOCATION_CURRENCY_MISMATCH"])("rolls back registration when allocation rejects with %s", async (code) => {
    const c = context();
    apply.mockRejectedValueOnce(new Error(code));
    await expect(c.service.execute(command())).rejects.toThrow(code);
    expect(c.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("replays the exact existing payment and allocation without a second allocation intent", async () => {
    const existingPayment = payment("20", "5");
    const existingAllocation = { paymentId: "payment-a", accountReceivableId: "ar-a", amount: new Prisma.Decimal("15") };
    const c = context({ received: "20", outstanding: "0", available: "5", created: false, existingPayment, existingAllocation });
    await expect(c.service.execute(command())).resolves.toMatchObject({ payment: { receiptNumber: "RCP-2026-000001", availableAmount: "5" }, allocation: { amount: "15" } });
    expect((apply.mock.calls[0][5][0].amount as Prisma.Decimal).toFixed()).toBe("15");
  });

  it("rejects an idempotency replay without its intended allocation", async () => {
    const c = context({ created: false, existingPayment: payment("15", "0"), existingAllocation: null });
    await expect(c.service.execute(command())).rejects.toThrow("PAYMENT_REGISTRATION_CONFLICT");
    expect(apply).not.toHaveBeenCalled();
  });
});

function command() {
  return { tenantId: "tenant-a", actor: { userId: "user-a", name: "User A" }, accountReceivableId: "ar-a", registrationDeduplicationKey: "atomic-abono-a", payerDisplayName: "Cliente A", currencyCode: "USD", receivedAmount: new Prisma.Decimal("15"), receivedAt: new Date("2026-09-01T12:00:00.000Z"), paymentMethod: "BANK_TRANSFER", customerId: "customer-a" } as const;
}

function payment(received: string, available: string) {
  return { id: "payment-a", tenantId: "tenant-a", receiptNumber: "RCP-2026-000001", receivedAmount: new Prisma.Decimal(received), availableAmount: new Prisma.Decimal(available), status: available === "0" ? PaymentStatus.FULLY_ALLOCATED : PaymentStatus.PARTIALLY_ALLOCATED, customerId: "customer-a", currencyCode: "USD" };
}

function context(options: { received?: string; outstanding?: string; available?: string; created?: boolean; existingPayment?: ReturnType<typeof payment>; existingAllocation?: { paymentId: string; accountReceivableId: string; amount: Prisma.Decimal } | null } = {}) {
  const initial = options.existingPayment ?? payment(options.received ?? "15", options.received ?? "15");
  const updated = payment(options.received ?? "15", options.available ?? "0");
  const ar = { id: "ar-a", tenantId: "tenant-a", customerId: "customer-a", currencyCode: "USD", originalAmount: new Prisma.Decimal("15"), outstandingAmount: new Prisma.Decimal(options.outstanding ?? "15"), status: AccountReceivableStatus.OPEN, sourceNumber: "FE-1" };
  const updatedAr = { ...ar, outstandingAmount: new Prisma.Decimal(options.outstanding === "0" ? "0" : options.outstanding ?? "15"), status: options.outstanding === "0" ? AccountReceivableStatus.SETTLED : AccountReceivableStatus.PARTIALLY_SETTLED };
  const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id: "locked" }]), payment: { findFirst: jest.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(updated) }, accountReceivable: { findFirst: jest.fn().mockResolvedValueOnce(ar).mockResolvedValueOnce(updatedAr) }, paymentAllocation: { findFirst: jest.fn().mockResolvedValue(options.existingAllocation ?? null) } };
  const prisma = { $transaction: jest.fn((work: (value: typeof tx) => unknown) => work(tx)) };
  const registrations = { registerInTransaction: jest.fn().mockResolvedValue({ payment: initial, created: options.created ?? true }) };
  return { service: new RegisterPaymentAndApplyService(prisma as never, registrations as never), prisma, registrations };
}

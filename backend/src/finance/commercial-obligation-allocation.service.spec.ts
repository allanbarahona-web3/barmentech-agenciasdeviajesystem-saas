import {
  CommercialObligationStatus,
  PaymentAllocationStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import {
  COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS,
  CommercialObligationAllocationService,
  type CommercialObligationAllocationCommand,
} from "./commercial-obligation-allocation.service";

const actor = { userId: "finance-user", name: "Finance User" };

describe("CommercialObligationAllocationService", () => {
  it("allocates a received reservation payment against a generic obligation", async () => {
    const c = context({ payment: payment("300"), obligation: obligation("1000") });

    const result = await c.service.allocateInTransaction(c.tx as never, command());

    expect(result.applied).toBe(true);
    expect(c.tx.commercialObligationAllocation.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        tenantId: "tenant-1", paymentId: "payment-1", commercialObligationId: "obligation-1",
        amount: expect.any(Prisma.Decimal), status: PaymentAllocationStatus.ACTIVE,
        allocationDeduplicationKey: "contract-reservation:payment-1:obligation-1",
      })],
      skipDuplicates: true,
    }));
    expect(c.tx.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ availableAmount: d("0"), status: PaymentStatus.FULLY_ALLOCATED }),
    }));
    expect(c.tx.commercialObligation.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ outstandingAmount: d("700"), status: CommercialObligationStatus.PARTIALLY_SETTLED, settledAt: null }),
    }));
    expect(c.tx.billingAuditLog.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [
      expect.objectContaining({ entityType: "FINANCE_COMMERCIAL_OBLIGATION_ALLOCATION", action: "APPLIED" }),
      expect.objectContaining({ entityType: "FINANCE_COMMERCIAL_OBLIGATION", action: "APPLIED" }),
    ] }));
    expect(rawSql(c.tx.$queryRaw, 0)).toContain('FROM "payments"');
    expect(rawSql(c.tx.$queryRaw, 1)).toContain('FROM "commercial_obligations"');
    expect(rawSql(c.tx.$queryRaw, 2)).toContain('FROM "commercial_obligation_allocations"');
    expect(Object.keys(c.tx)).not.toContain("paymentAllocation");
    expect(Object.keys(c.tx)).not.toContain("accountReceivable");
  });

  it("fully settles the obligation and records settledAt", async () => {
    const c = context({ payment: payment("300"), obligation: obligation("300") });

    await c.service.allocateInTransaction(c.tx as never, command());

    const data = c.tx.commercialObligation.update.mock.calls[0][0].data;
    expect(data.outstandingAmount.toFixed()).toBe("0");
    expect(data.status).toBe(CommercialObligationStatus.SETTLED);
    expect(data.settledAt).toBeInstanceOf(Date);
  });

  it.each([
    ["currency mismatch", { payment: payment("300", { currencyCode: "CRC" }) }, COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.CURRENCY_MISMATCH],
    ["customer mismatch", { payment: payment("300", { customerId: "customer-2" }) }, COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.CUSTOMER_MISMATCH],
    ["customer unavailable", { payment: payment("300", { customerId: null }) }, COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.CUSTOMER_MISMATCH],
    ["cancelled obligation", { obligation: obligation("1000", { status: CommercialObligationStatus.CANCELLED }) }, COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.OBLIGATION_INVALID],
    ["settled obligation", { obligation: obligation("0", { originalAmount: d("300"), status: CommercialObligationStatus.SETTLED }) }, COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.OBLIGATION_INVALID],
    ["payment not received", { payment: payment("300", { status: PaymentStatus.PENDING_VERIFICATION }) }, COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.PAYMENT_INVALID],
    ["payment exceeds obligation", { obligation: obligation("200", { originalAmount: d("200") }) }, COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.OBLIGATION_INSUFFICIENT],
  ])("rejects %s before any allocation mutation", async (_, options, code) => {
    const c = context(options as Parameters<typeof context>[0]);

    await expectCode(c.service.allocateInTransaction(c.tx as never, command()), code);

    expect(c.tx.commercialObligationAllocation.createMany).not.toHaveBeenCalled();
    expect(c.tx.payment.update).not.toHaveBeenCalled();
    expect(c.tx.commercialObligation.update).not.toHaveBeenCalled();
  });

  it("does not create zero-value allocations", async () => {
    const c = context();
    await expectCode(
      c.service.allocateInTransaction(c.tx as never, command({ amount: d("0") })),
      COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.INVALID,
    );
    expect(c.tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("accepts an exact active allocation retry without applying balances twice", async () => {
    const existing = allocation();
    const c = context({
      payment: payment("0", { receivedAmount: d("300"), status: PaymentStatus.FULLY_ALLOCATED }),
      obligation: obligation("700", { status: CommercialObligationStatus.PARTIALLY_SETTLED }),
      allocations: [existing],
    });

    const result = await c.service.allocateInTransaction(c.tx as never, command());

    expect(result).toEqual({ allocation: existing, applied: false });
    expect(c.tx.commercialObligationAllocation.createMany).not.toHaveBeenCalled();
    expect(c.tx.payment.update).not.toHaveBeenCalled();
    expect(c.tx.commercialObligation.update).not.toHaveBeenCalled();
  });

  it("rejects a conflicting deduplication winner without mutating balances", async () => {
    const c = context({ allocations: [allocation({ amount: d("299") })] });

    await expectCode(
      c.service.allocateInTransaction(c.tx as never, command()),
      COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.CONFLICT,
    );
    expect(c.tx.commercialObligationAllocation.createMany).not.toHaveBeenCalled();
    expect(c.tx.payment.update).not.toHaveBeenCalled();
  });

  it("leaves balance writes to the surrounding transaction when audit persistence fails", async () => {
    const c = context();
    c.tx.billingAuditLog.createMany.mockRejectedValueOnce(new Error("audit write failed"));

    await expect(c.service.allocateInTransaction(c.tx as never, command())).rejects.toThrow("audit write failed");

    expect(c.tx.payment.update).not.toHaveBeenCalled();
    expect(c.tx.commercialObligation.update).not.toHaveBeenCalled();
  });
});

function d(value: string) { return new Prisma.Decimal(value); }

function command(overrides: Partial<CommercialObligationAllocationCommand> = {}): CommercialObligationAllocationCommand {
  return {
    tenantId: "tenant-1",
    paymentId: "payment-1",
    commercialObligationId: "obligation-1",
    amount: d("300"),
    allocationDeduplicationKey: "contract-reservation:payment-1:obligation-1",
    actor,
    ...overrides,
  };
}

function payment(availableAmount: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "payment-1", tenantId: "tenant-1", customerId: "customer-1", currencyCode: "USD",
    receivedAmount: d(availableAmount === "0" ? "300" : availableAmount), availableAmount: d(availableAmount),
    status: PaymentStatus.RECEIVED,
    ...overrides,
  };
}

function obligation(outstandingAmount: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "obligation-1", tenantId: "tenant-1", customerId: "customer-1", currencyCode: "USD",
    originalAmount: d("1000"), outstandingAmount: d(outstandingAmount), status: CommercialObligationStatus.OPEN,
    ...overrides,
  };
}

function allocation(overrides: Record<string, unknown> = {}) {
  return {
    id: "allocation-1", tenantId: "tenant-1", paymentId: "payment-1", commercialObligationId: "obligation-1",
    allocationDeduplicationKey: "contract-reservation:payment-1:obligation-1", amount: d("300"),
    status: PaymentAllocationStatus.ACTIVE,
    ...overrides,
  };
}

function context(options: {
  payment?: ReturnType<typeof payment>;
  obligation?: ReturnType<typeof obligation>;
  allocations?: Array<ReturnType<typeof allocation>>;
} = {}) {
  const currentPayment = options.payment ?? payment("300");
  const currentObligation = options.obligation ?? obligation("1000");
  const rows = [...(options.allocations ?? [])];
  const queryRaw = jest.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes('FROM "payments"')) return [{ id: currentPayment.id }];
    if (sql.includes('FROM "commercial_obligations"')) return [{ id: currentObligation.id }];
    return rows.map((row) => ({ id: row.id }));
  });
  const createMany = jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
    for (const item of data) {
      if (!rows.some((row) => row.allocationDeduplicationKey === item.allocationDeduplicationKey)) {
        rows.push(allocation({
          commercialObligationId: item.commercialObligationId,
          paymentId: item.paymentId,
          allocationDeduplicationKey: item.allocationDeduplicationKey,
          amount: item.amount,
          status: item.status,
        }));
      }
    }
    return { count: data.length };
  });
  const tx = {
    $queryRaw: queryRaw,
    payment: { findFirst: jest.fn().mockResolvedValue(currentPayment), update: jest.fn().mockResolvedValue({}) },
    commercialObligation: { findFirst: jest.fn().mockResolvedValue(currentObligation), update: jest.fn().mockResolvedValue({}) },
    commercialObligationAllocation: {
      findFirst: jest.fn().mockImplementation(async ({ where }: { where: { allocationDeduplicationKey: string } }) =>
        rows.find((row) => row.allocationDeduplicationKey === where.allocationDeduplicationKey) ?? null),
      createMany,
    },
    billingAuditLog: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
  return {
    service: new CommercialObligationAllocationService(),
    tx,
  };
}

function rawSql(mock: jest.Mock, call: number): string {
  return (mock.mock.calls[call][0] as TemplateStringsArray).join("?");
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toThrow(code);
}

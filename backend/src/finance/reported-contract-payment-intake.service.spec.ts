import { PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import {
  REPORTED_CONTRACT_PAYMENT_ERRORS,
  ReportedInvoicePaymentIntakeService,
} from "./reported-invoice-payment-intake.service";

describe("ReportedInvoicePaymentIntakeService contract intake", () => {
  it("creates one pending Contract installment payment without allocations, receipt, billing, or fiscalization", async () => {
    const c = context();

    await expect(c.service.submitContract(command())).resolves.toMatchObject({
      paymentId: "payment-contract-1",
      status: PaymentStatus.PENDING_VERIFICATION,
      receiptNumber: null,
      currencyCode: "USD",
      amount: "300",
      availableAmount: "0",
      contractId: "contract-a",
      allocationProposal: {
        kind: "CONTRACTS",
        targets: [{ targetType: "COMMERCIAL_OBLIGATION", targetId: "obligation-a", intendedAmount: "300" }],
      },
    });

    const data = c.tx.payment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: "tenant-a",
      customerId: "customer-a",
      contractId: "contract-a",
      purpose: PaymentPurpose.CONTRACT_INSTALLMENT,
      status: PaymentStatus.PENDING_VERIFICATION,
      receiptNumber: null,
      availableAmount: d("0"),
    });
    expect(data.allocationProposal).toEqual({
      kind: "CONTRACTS",
      targets: [{ targetType: "COMMERCIAL_OBLIGATION", targetId: "obligation-a", intendedAmount: "300" }],
    });
    expect(c.tx).not.toHaveProperty("commercialObligationAllocation");
    expect(c.tx.commercialObligation).not.toHaveProperty("update");
    expect(c.tx).not.toHaveProperty("billingDocument");
    expect(c.tx).not.toHaveProperty("billingOutboxEvent");
    expect(c.tx.billingAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "REPORTED_CONTRACT_PAYMENT_SUBMITTED" }),
    }));
  });

  it("rejects an obligation outside the requested tenant or customer", async () => {
    const c = context({ obligation: null });

    await expect(c.service.submitContract(command())).rejects.toThrow(REPORTED_CONTRACT_PAYMENT_ERRORS.TARGET_INVALID);
    expect(c.tx.commercialObligation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: "tenant-a", customerId: "customer-a", sourceType: "CONTRACT", sourceId: "contract-a" }),
    }));
    expect(c.tx.payment.create).not.toHaveBeenCalled();
  });

  it("rejects a cancelled Contract even when its obligation is otherwise open", async () => {
    const c = context({ contract: null });

    await expect(c.service.submitContract(command())).rejects.toThrow(REPORTED_CONTRACT_PAYMENT_ERRORS.TARGET_INVALID);
    expect(c.tx.contract.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ cancelledAt: null, status: { not: "CANCELLED" } }),
    }));
    expect(c.tx.payment.create).not.toHaveBeenCalled();
  });

  it("rejects a Contract proposal that does not use settlement precision", async () => {
    const c = context();
    await expect(c.service.submitContract(command({ intendedAmount: d("299.999") }))).rejects.toThrow(
      REPORTED_CONTRACT_PAYMENT_ERRORS.TARGET_INVALID,
    );
    expect(c.tx.payment.create).not.toHaveBeenCalled();
  });

  it("rejects a Contract proposal above the outstanding obligation", async () => {
    const c = context();
    await expect(c.service.submitContract(command({ intendedAmount: d("300.01") }))).rejects.toThrow(
      REPORTED_CONTRACT_PAYMENT_ERRORS.TARGET_INSUFFICIENT,
    );
    expect(c.tx.payment.create).not.toHaveBeenCalled();
  });

  it("rejects a same-currency proposal above the normalized physical payment", async () => {
    const c = context();
    await expect(c.service.submitContract(command({ amount: d("299.99") }))).rejects.toThrow(
      REPORTED_CONTRACT_PAYMENT_ERRORS.PAYMENT_INSUFFICIENT,
    );
    expect(c.tx.payment.create).not.toHaveBeenCalled();
  });

  it("preserves the invoice intake and accepts cross-currency pending Contract money without frontend FX", async () => {
    const c = context({ obligation: obligation({ currencyCode: "USD" }) });

    await expect(c.service.submitContract(command({ currencyCode: "CRC", amount: d("135000") }))).resolves.toMatchObject({
      status: PaymentStatus.PENDING_VERIFICATION,
      currencyCode: "CRC",
      amount: "135000",
    });
    expect(c.tx.payment.create.mock.calls[0][0].data).toMatchObject({
      currencyCode: "CRC",
      receivedAmount: d("135000"),
    });
  });
});

function command(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-a",
    customerId: "customer-a",
    actor: { userId: "agent-a", name: "Agent A" },
    currencyCode: "USD",
    amount: d("300"),
    paymentMethod: "BANK_TRANSFER",
    paymentDate: new Date("2026-09-14T12:00:00.000Z"),
    reference: "BANK-300",
    payerName: "Customer A",
    notes: "Reported Contract payment",
    contractId: "contract-a",
    commercialObligationId: "obligation-a",
    intendedAmount: d("300"),
    ...overrides,
  };
}

function obligation(overrides: Record<string, unknown> = {}) {
  return {
    id: "obligation-a",
    currencyCode: "USD",
    outstandingAmount: d("300"),
    customer: { fullName: "Customer A" },
    ...overrides,
  };
}

function context(options: { obligation?: ReturnType<typeof obligation> | null; contract?: { id: string } | null } = {}) {
  const target = options.obligation === undefined ? obligation() : options.obligation;
  const contract = options.contract === undefined ? { id: "contract-a" } : options.contract;
  const tx = {
    commercialObligation: { findFirst: jest.fn().mockResolvedValue(target) },
    contract: { findFirst: jest.fn().mockResolvedValue(contract) },
    payment: { create: jest.fn(async ({ data }) => ({ id: "payment-contract-1", createdAt: new Date("2026-09-14T12:01:00.000Z"), ...data })) },
    billingAuditLog: { create: jest.fn().mockResolvedValue({ id: "audit-a" }) },
  };
  const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
  return { service: new ReportedInvoicePaymentIntakeService(prisma as never), prisma, tx };
}

function d(value: string) {
  return new Prisma.Decimal(value);
}

import { PaymentStatus, Prisma } from "@prisma/client";
import {
  REPORTED_INVOICE_PAYMENT_ERRORS,
  ReportedInvoicePaymentIntakeService,
} from "./reported-invoice-payment-intake.service";

describe("ReportedInvoicePaymentIntakeService", () => {
  it("stores a multi-invoice partial proposal as pending money without allocations, receipts, or balance mutations", async () => {
    const c = context();

    await expect(c.service.submit(command({
      amount: d("1000"),
      targets: [
        { accountReceivableId: "ar-a", intendedAmount: d("400") },
        { accountReceivableId: "ar-b", intendedAmount: d("250") },
      ],
    }))).resolves.toMatchObject({
      paymentId: "payment-1",
      status: PaymentStatus.PENDING_VERIFICATION,
      receiptNumber: null,
      currencyCode: "USD",
      amount: "1000",
      availableAmount: "0",
      allocationProposal: {
        kind: "INVOICES",
        targets: [
          { targetType: "ACCOUNT_RECEIVABLE", targetId: "ar-a", intendedAmount: "400" },
          { targetType: "ACCOUNT_RECEIVABLE", targetId: "ar-b", intendedAmount: "250" },
        ],
      },
    });

    const data = c.tx.payment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: "tenant-a",
      customerId: "customer-a",
      status: PaymentStatus.PENDING_VERIFICATION,
      purpose: "GENERAL",
      receiptNumber: null,
      availableAmount: d("0"),
      reviewedAt: null,
      reviewedByUserId: null,
      reviewedByName: null,
      allocationProposal: {
        kind: "INVOICES",
        targets: [
          { targetType: "ACCOUNT_RECEIVABLE", targetId: "ar-a", intendedAmount: "400" },
          { targetType: "ACCOUNT_RECEIVABLE", targetId: "ar-b", intendedAmount: "250" },
        ],
      },
    });
    expect(data.receivedAmount.toFixed()).toBe("1000");
    expect(data.availableAmount.toFixed()).toBe("0");
    expect(c.tx).not.toHaveProperty("paymentAllocation");
    expect(c.tx.accountReceivable).not.toHaveProperty("update");
    expect(c.tx).not.toHaveProperty("billingDocumentArtifact");
    expect(c.tx.billingAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "REPORTED_INVOICE_PAYMENT_SUBMITTED" }),
    }));
  });

  it("allows a partial proposal below the reported amount", async () => {
    const c = context();
    await expect(c.service.submit(command({ amount: d("500"), targets: [{ accountReceivableId: "ar-a", intendedAmount: d("100") }] }))).resolves.toMatchObject({
      status: PaymentStatus.PENDING_VERIFICATION,
      availableAmount: "0",
    });
  });

  it("rejects duplicate AR targets before starting a transaction", async () => {
    const c = context();
    await expect(c.service.submit(command({ targets: [
      { accountReceivableId: "ar-a", intendedAmount: d("10") },
      { accountReceivableId: "ar-a", intendedAmount: d("20") },
    ] }))).rejects.toThrow(REPORTED_INVOICE_PAYMENT_ERRORS.INVALID);
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects targets outside the tenant or customer scope", async () => {
    const c = context({ receivables: [] });
    await expect(c.service.submit(command())).rejects.toThrow(REPORTED_INVOICE_PAYMENT_ERRORS.TARGET_INVALID);
    expect(c.tx.accountReceivable.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: "tenant-a", customerId: "customer-a", sourceType: "BILLING_DOCUMENT" }),
    }));
  });

  it("accepts a physical payment in a different currency from its invoice targets", async () => {
    const c = context({ receivables: [receivable({ currencyCode: "CRC" })] });
    await expect(c.service.submit(command())).resolves.toMatchObject({
      currencyCode: "USD",
      amount: "100",
      status: PaymentStatus.PENDING_VERIFICATION,
    });
  });

  it("rejects invoice targets that do not share one settlement currency", async () => {
    const c = context({ receivables: [receivable(), receivable({ id: "ar-b", sourceId: "document-b", currencyCode: "CRC" })] });
    await expect(c.service.submit(command({ targets: [
      { accountReceivableId: "ar-a", intendedAmount: d("10") },
      { accountReceivableId: "ar-b", intendedAmount: d("10") },
    ] }))).rejects.toThrow(REPORTED_INVOICE_PAYMENT_ERRORS.CURRENCY_MISMATCH);
  });

  it.each([
    ["settled", []],
    ["cancelled", []],
  ])("rejects a %s target that is no longer open", async (_, receivables) => {
    const c = context({ receivables });
    await expect(c.service.submit(command())).rejects.toThrow(REPORTED_INVOICE_PAYMENT_ERRORS.TARGET_INVALID);
  });

  it("rejects a target amount above its current outstanding amount", async () => {
    const c = context({ receivables: [receivable({ outstandingAmount: d("50") })] });
    await expect(c.service.submit(command({ targets: [{ accountReceivableId: "ar-a", intendedAmount: d("51") }] }))).rejects.toThrow(REPORTED_INVOICE_PAYMENT_ERRORS.TARGET_INSUFFICIENT);
  });

  it("rejects a proposal whose total exceeds the reported payment", async () => {
    const c = context();
    await expect(c.service.submit(command({ amount: d("99"), targets: [{ accountReceivableId: "ar-a", intendedAmount: d("100") }] }))).rejects.toThrow(REPORTED_INVOICE_PAYMENT_ERRORS.PAYMENT_INSUFFICIENT);
  });

  it("requires proposal amounts to use the settlement currency precision", async () => {
    const c = context();

    await expect(c.service.submit(command({
      targets: [{ accountReceivableId: "ar-a", intendedAmount: d("10.001") }],
    }))).rejects.toThrow(REPORTED_INVOICE_PAYMENT_ERRORS.TARGET_INVALID);
  });
});

function command(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-a",
    customerId: "customer-a",
    actor: { userId: "agent-a", name: "Agent A" },
    currencyCode: "USD",
    amount: d("100"),
    paymentMethod: "BANK_TRANSFER",
    paymentDate: new Date("2026-09-13T12:00:00.000Z"),
    reference: "BANK-REF-1",
    payerName: "Customer A",
    notes: "Reported by customer",
    targets: [{ accountReceivableId: "ar-a", intendedAmount: d("100") }],
    ...overrides,
  };
}

function receivable(overrides: Record<string, unknown> = {}) {
  return {
    id: "ar-a",
    sourceId: "document-a",
    currencyCode: "USD",
    originalAmount: d("500"),
    outstandingAmount: d("500"),
    debtorDisplayName: "Customer A",
    ...overrides,
  };
}

function context(options: { receivables?: ReturnType<typeof receivable>[] } = {}) {
  const receivables = options.receivables ?? [receivable(), receivable({ id: "ar-b", sourceId: "document-b" })];
  const tx = {
    accountReceivable: { findMany: jest.fn(({ where }) => Promise.resolve(
      receivables.filter((item) => (where.id.in as string[]).includes(item.id)),
    )) },
    billingDocument: { findMany: jest.fn(({ where }) => Promise.resolve(
      receivables
        .filter((item) => (where.id.in as string[]).includes(item.sourceId))
        .map((item) => ({ id: item.sourceId })),
    )) },
    payment: {
      create: jest.fn(async ({ data }) => ({ id: "payment-1", createdAt: new Date("2026-09-13T13:00:00.000Z"), ...data })),
    },
    billingAuditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
  return { service: new ReportedInvoicePaymentIntakeService(prisma as never), prisma, tx };
}

function d(value: string) {
  return new Prisma.Decimal(value);
}

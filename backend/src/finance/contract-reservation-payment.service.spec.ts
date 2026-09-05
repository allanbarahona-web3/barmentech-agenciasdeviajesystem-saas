import { PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import { ContractReservationPaymentService } from "./contract-reservation-payment.service";

const createdAt = new Date("2026-09-02T10:00:00.000Z");

describe("ContractReservationPaymentService", () => {
  it.each(["CASH", "BANK_TRANSFER", "CARD", "CHECK", "MOBILE_TRANSFER", "OTHER"])(
    "persists the explicit Finance reservation payment method %s",
    async (paymentMethod) => {
      const c = context();
      await c.service.submit(command({ paymentMethod }));

      const data = c.tx.payment.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        tenantId: "tenant-1",
        customerId: "customer-1",
        contractId: "contract-1",
        purpose: PaymentPurpose.CONTRACT_RESERVATION,
        status: PaymentStatus.PENDING_VERIFICATION,
        currencyCode: "CRC",
        receiptNumber: null,
        paymentMethod,
        externalReference: "PAY-123",
      });
      expect(data.receivedAmount.toFixed()).toBe("125.5");
      expect(data.availableAmount.toFixed()).toBe("0");
      expect(c.businessNumbers.next).not.toHaveBeenCalled();
      expect(c.tx.paymentEvidence.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ paymentId: "payment-1", objectKey: "contracts/receipt.pdf" })],
        skipDuplicates: true,
      });
      expect(c.tx.billingAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ action: "RESERVATION_SUBMITTED", entityId: "payment-1" }),
      }));
    },
  );

  it.each([undefined, "", "CRYPTO", "01"])(
    "rejects a missing or unsupported reservation payment method %p",
    async (paymentMethod) => {
      const c = context();
      await expect(c.service.submit(command({ paymentMethod }))).rejects.toThrow(
        "CONTRACT_RESERVATION_PAYMENT_METHOD_INVALID",
      );
      expect(c.prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it("creates the full CASH Contract payment independently from payment method", async () => {
    const c = context();
    await c.service.submit(command({
      paymentMethod: "CARD",
      paymentConditionType: "CASH",
      commercialTotal: new Prisma.Decimal("1350"),
      payload: { reservationAmount: 0, reservationCurrencyCode: "CRC" },
    }));

    const data = c.tx.payment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      purpose: PaymentPurpose.CONTRACT_PAYMENT,
      paymentMethod: "CARD",
      status: PaymentStatus.PENDING_VERIFICATION,
      availableAmount: new Prisma.Decimal(0),
      receiptNumber: null,
    });
    expect(data.receivedAmount.toFixed()).toBe("1350");
    expect(c.tx.billingAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "CONTRACT_PAYMENT_SUBMITTED" }),
    }));
  });

  it("preserves the CREDIT reservation amount as the initial payment instead of the commercial total", async () => {
    const c = context();
    await c.service.submit(command({
      paymentMethod: "BANK_TRANSFER",
      commercialTotal: new Prisma.Decimal("1350"),
      payload: { reservationAmount: "350", reservationCurrencyCode: "CRC" },
    }));

    const data = c.tx.payment.create.mock.calls[0][0].data;
    expect(data.purpose).toBe(PaymentPurpose.CONTRACT_RESERVATION);
    expect(data.receivedAmount.toFixed()).toBe("350");
    expect(data.status).toBe(PaymentStatus.PENDING_VERIFICATION);
    expect(data.availableAmount.toFixed()).toBe("0");
  });

  it("returns the active reservation on retry without duplicate payment, evidence, or audit", async () => {
    const existing = payment();
    const c = context(existing);

    await expect(c.service.submit(command())).resolves.toBe(existing);
    expect(c.tx.payment.create).not.toHaveBeenCalled();
    expect(c.tx.paymentEvidence.createMany).not.toHaveBeenCalled();
    expect(c.tx.billingAuditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, "CONTRACT_CREDIT_RESERVATION_REQUIRED"],
    [0, "CONTRACT_CREDIT_RESERVATION_REQUIRED"],
    ["125.50", "CONTRACT_CREDIT_RESERVATION_MUST_BE_LESS_THAN_TOTAL"],
  ])("rejects invalid CREDIT reservation %p", async (reservationAmount, errorCode) => {
    const c = context();
    await expect(c.service.submit(command({
      commercialTotal: new Prisma.Decimal("125.50"),
      payload: { reservationAmount, reservationCurrencyCode: "CRC" },
    }))).rejects.toThrow(errorCode);
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a positive CASH reservation before creating a partial payment", async () => {
    const c = context();
    await expect(c.service.submit(command({
      paymentConditionType: "CASH",
      payload: { reservationAmount: "1", reservationCurrencyCode: "CRC" },
    }))).rejects.toThrow("CONTRACT_CASH_RESERVATION_NOT_ALLOWED");
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("fails safely when an existing initial payment conflicts with current purpose or amount", async () => {
    const c = context(payment());
    await expect(c.service.submit(command({
      paymentConditionType: "CASH",
      commercialTotal: new Prisma.Decimal("125.50"),
      payload: { reservationAmount: 0, reservationCurrencyCode: "CRC" },
    }))).rejects.toThrow("CONTRACT_INITIAL_PAYMENT_CONFLICT");
    expect(c.tx.payment.create).not.toHaveBeenCalled();
  });

  it("does not turn unrelated Contract documents into payment evidence", async () => {
    const c = context();
    await c.service.submit(command({
      documents: [{ kind: "OTHER", objectKey: "contracts/passport.pdf", originalFileName: "pasaporte.pdf", mimeType: "application/pdf", size: 100 }],
    }));
    expect(c.tx.paymentEvidence.createMany).not.toHaveBeenCalled();
  });

  it("fails rather than inventing a currency when the archived snapshot is missing", async () => {
    const c = context();
    await expect(c.service.submit(command({ payload: { reservationAmount: "125.50" } }))).rejects.toThrow("CONTRACT_RESERVATION_CURRENCY_UNAVAILABLE");
  });
});

function command(overrides: Record<string, unknown> = {}) {
  return {
    contract: {
      id: "contract-1", tenantId: "tenant-1", clientId: "customer-1", createdAt,
      paymentMethod: "BANK_TRANSFER",
      commercialTotal: new Prisma.Decimal("500"),
      paymentConditionType: "CREDIT",
      paymentReference: "PAY-123", payload: { reservationAmount: "125.50", reservationCurrencyCode: "CRC" },
      client: { fullName: "Ada Client" },
      documents: [{ kind: "RESERVATION", objectKey: "contracts/receipt.pdf", originalFileName: "comprobante.pdf", mimeType: "application/pdf", size: 100 }],
      ...overrides,
    },
    actor: { userId: "agent-1", name: "Ada Agent" },
  };
}

function payment() {
  return {
    id: "payment-1", tenantId: "tenant-1", contractId: "contract-1", purpose: PaymentPurpose.CONTRACT_RESERVATION,
    status: PaymentStatus.PENDING_VERIFICATION, receivedAmount: new Prisma.Decimal("125.5"), availableAmount: new Prisma.Decimal(0), createdAt,
  };
}

function context(existing: ReturnType<typeof payment> | null = null) {
  const findFirst = jest.fn().mockResolvedValue(existing);
  const created = payment();
  const tx = {
    payment: { findFirst, create: jest.fn().mockResolvedValue(created) },
    paymentEvidence: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    billingAuditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const prisma = {
    payment: { findFirst },
    $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
  };
  const businessNumbers = { next: jest.fn() };
  return {
    service: Reflect.construct(ContractReservationPaymentService, [prisma, businessNumbers]),
    prisma, tx, businessNumbers,
  };
}

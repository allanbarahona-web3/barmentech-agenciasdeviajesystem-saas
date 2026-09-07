import { Prisma } from "@prisma/client";
import { CustomerAccountStatementService } from "./customer-account-statement.service";

describe("CustomerAccountStatementService", () => {
  const client = { findFirst: jest.fn() };
  const accountReceivable = { findMany: jest.fn() };
  const commercialObligation = { findMany: jest.fn() };
  const payment = { findMany: jest.fn(), aggregate: jest.fn() };
  const tenantBillingConfiguration = { findUnique: jest.fn() };
  const renderDocumentToBuffer = jest.fn();
  const sendEmail = jest.fn();
  const getTenantConfig = jest.fn();
  const service = new CustomerAccountStatementService(
    { client, accountReceivable, commercialObligation, payment, tenantBillingConfiguration } as never,
    { renderDocumentToBuffer } as never,
    { sendEmail } as never,
    { getTenantConfig } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    client.findFirst.mockResolvedValue({ id: "customer-1", fullName: "Cliente Uno", idNumber: "123", email: "cliente@example.com" });
    accountReceivable.findMany.mockResolvedValue([{ id: "ar-1", sourceNumber: "FE-1", sourceId: "source-1", sourceDocumentType: "Factura electrónica", recognizedAt: new Date("2026-08-01"), dueDate: new Date("2026-08-31"), originalAmount: new Prisma.Decimal("100"), outstandingAmount: new Prisma.Decimal("60"), status: "PARTIALLY_SETTLED", paymentAllocations: [{ amount: new Prisma.Decimal("40"), allocatedAt: new Date("2026-08-10"), status: "ACTIVE", payment: { receiptNumber: "RCP-1" } }] }]);
    commercialObligation.findMany.mockResolvedValue([]);
    payment.findMany.mockResolvedValue([{ id: "payment-1", receiptNumber: "RCP-1", receivedAt: new Date("2026-08-10"), receivedAmount: new Prisma.Decimal("50"), availableAmount: new Prisma.Decimal("10"), paymentMethod: "BANK_TRANSFER", purpose: "GENERAL", status: "PARTIALLY_ALLOCATED", allocations: [{ amount: new Prisma.Decimal("40"), allocatedAt: new Date("2026-08-10"), status: "ACTIVE", accountReceivable: { sourceNumber: "FE-1", sourceId: "source-1" } }], commercialObligationAllocations: [] }]);
    payment.aggregate.mockResolvedValue({ _sum: { availableAmount: new Prisma.Decimal("10") } });
    tenantBillingConfiguration.findUnique.mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" });
    getTenantConfig.mockResolvedValue({ name: "Agencia" });
    renderDocumentToBuffer.mockResolvedValue({ pdfBuffer: Buffer.from("pdf"), signatureAnchors: {} });
    sendEmail.mockResolvedValue({ success: true, emailId: "email-1" });
  });

  it("builds totals from DB rows and keeps invoice/payment allocation detail", async () => {
    const result = await service.get("tenant-1", "customer-1", "USD");
    expect(result.totals).toEqual({ invoicedAmount: "100.00", allocatedAmount: "40.00", outstandingAmount: "60.00", availableAmount: "10.00" });
    expect(result.invoices[0].allocations[0]).toMatchObject({ receiptNumber: "RCP-1", amount: "40.00" });
    expect(result.payments[0].allocations[0]).toMatchObject({ sourceType: "ACCOUNT_RECEIVABLE", reference: "FE-1", amount: "40.00" });
    expect(result.payments[0].paymentMethodLabel).toBe("Transferencia bancaria");
    expect(payment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ["RECEIVED", "PARTIALLY_ALLOCATED", "FULLY_ALLOCATED", "CANCELLED"] },
        receiptNumber: { not: null },
      }),
    }));
  });

  it("excludes pending and rejected submissions while retaining confirmed payments", async () => {
    const confirmed = (await payment.findMany())[0];
    payment.findMany.mockResolvedValue([
      confirmed,
      { ...confirmed, id: "pending", status: "PENDING_VERIFICATION", receiptNumber: null },
      { ...confirmed, id: "rejected", status: "REJECTED", receiptNumber: null },
    ]);
    const result = await service.get("tenant-1", "customer-1", "USD");
    expect(result.payments.map((item) => item.id)).toEqual(["payment-1"]);
  });

  it("consolidates Contract obligations and their reservation payment once without fiscal-document charges", async () => {
    accountReceivable.findMany.mockResolvedValue([]);
    commercialObligation.findMany.mockResolvedValue([{
      id: "obligation-1", sourceType: "CONTRACT", sourceId: "contract-1", sourceReference: "ALM-100", currencyCode: "USD",
      createdAt: new Date("2026-08-01"), dueDate: new Date("2026-09-01"), originalAmount: new Prisma.Decimal("1500"), outstandingAmount: new Prisma.Decimal("1000"), status: "PARTIALLY_SETTLED",
      allocations: [{ id: "coa-1", amount: new Prisma.Decimal("500"), allocatedAt: new Date("2026-08-05"), status: "ACTIVE", payment: { id: "payment-reservation", receiptNumber: "RCP-100", purpose: "CONTRACT_RESERVATION" }, reversal: null }],
    }]);
    payment.findMany.mockResolvedValue([{
      id: "payment-reservation", receiptNumber: "RCP-100", receivedAt: new Date("2026-08-05"), receivedAmount: new Prisma.Decimal("500"), availableAmount: new Prisma.Decimal("0"), paymentMethod: "CARD", purpose: "CONTRACT_RESERVATION", status: "FULLY_ALLOCATED", allocations: [],
      commercialObligationAllocations: [{ amount: new Prisma.Decimal("500"), allocatedAt: new Date("2026-08-05"), status: "ACTIVE", commercialObligation: { sourceType: "CONTRACT", sourceId: "contract-1", sourceReference: "ALM-100" }, reversal: null }],
    }]);
    payment.aggregate.mockResolvedValue({ _sum: { availableAmount: new Prisma.Decimal("0") } });

    const result = await service.get("tenant-1", "customer-1", "USD");

    expect(result.totals).toEqual({ invoicedAmount: "1500.00", allocatedAmount: "500.00", outstandingAmount: "1000.00", availableAmount: "0.00" });
    expect(result.charges).toEqual([expect.objectContaining({ sourceType: "CONTRACT_OBLIGATION", reference: "ALM-100", description: "Contrato ALM-100", originalAmount: "1500.00", allocatedAmount: "500.00", outstandingAmount: "1000.00", allocations: [expect.objectContaining({ receiptNumber: "RCP-100", purposeLabel: "Reserva", status: "ACTIVE" })] })]);
    expect(result.payments).toEqual([expect.objectContaining({ id: "payment-reservation", purposeLabel: "Reserva", allocations: [expect.objectContaining({ sourceType: "CONTRACT_OBLIGATION", reference: "ALM-100", amount: "500.00" })] })]);
    expect(commercialObligation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant-1", customerId: "customer-1", currencyCode: "USD", sourceType: "CONTRACT" } }));
    expect(commercialObligation.findMany).toHaveBeenCalledTimes(1);
    expect(payment.findMany).toHaveBeenCalledTimes(1);
    expect((service as unknown as { prisma: Record<string, unknown> }).prisma).not.toHaveProperty("billingDocument");
  });

  it("keeps settled and cancelled Contract obligations historical while excluding cancelled debt and reversed applications", async () => {
    accountReceivable.findMany.mockResolvedValue([]);
    commercialObligation.findMany.mockResolvedValue([
      { id: "settled", sourceType: "CONTRACT", sourceId: "contract-settled", sourceReference: "ALM-SET", createdAt: new Date("2026-08-01"), dueDate: null, originalAmount: new Prisma.Decimal("200"), outstandingAmount: new Prisma.Decimal("0"), status: "SETTLED", allocations: [] },
      { id: "cancelled", sourceType: "CONTRACT", sourceId: "contract-cancelled", sourceReference: "ALM-CAN", createdAt: new Date("2026-08-02"), dueDate: null, originalAmount: new Prisma.Decimal("300"), outstandingAmount: new Prisma.Decimal("300"), status: "CANCELLED", allocations: [{ id: "reversed", amount: new Prisma.Decimal("25"), allocatedAt: new Date("2026-08-03"), status: "REVERSED", payment: { id: "payment-reversed", receiptNumber: "RCP-REV", purpose: "CONTRACT_INSTALLMENT" }, reversal: { reversedAt: new Date("2026-08-04"), reason: "Corrección" } }] },
    ]);
    payment.findMany.mockResolvedValue([]);
    const result = await service.get("tenant-1", "customer-1", "USD");

    expect(result.totals).toEqual({ invoicedAmount: "200.00", allocatedAmount: "200.00", outstandingAmount: "0.00", availableAmount: "10.00" });
    expect(result.charges).toEqual(expect.arrayContaining([
      expect.objectContaining({ reference: "ALM-SET", status: "SETTLED", outstandingAmount: "0.00" }),
      expect.objectContaining({ reference: "ALM-CAN", status: "CANCELLED", allocations: [expect.objectContaining({ status: "REVERSED", reversalReason: "Corrección" })] }),
    ]));
  });

  it("throws instead of fabricating a missing confirmed receipt number", async () => {
    const confirmed = (await payment.findMany())[0];
    payment.findMany.mockResolvedValue([{ ...confirmed, receiptNumber: null }]);
    await expect(service.get("tenant-1", "customer-1", "USD")).rejects.toThrow("FINANCE_RECEIPT_NUMBER_INVARIANT_VIOLATION");
  });

  it("enforces the receipt invariant for allocation projections", async () => {
    const receivables = await accountReceivable.findMany();
    accountReceivable.findMany.mockResolvedValue([{ ...receivables[0], paymentAllocations: [{ ...receivables[0].paymentAllocations[0], payment: { receiptNumber: null } }] }]);
    await expect(service.get("tenant-1", "customer-1", "USD")).rejects.toThrow("FINANCE_RECEIPT_NUMBER_INVARIANT_VIOLATION");
  });

  it("renders the PDF and sends it through the centralized email service", async () => {
    const result = await service.send("tenant-1", { userId: "user-1", email: "agent@example.com", fullName: "Agente" }, "customer-1", "USD");
    expect(renderDocumentToBuffer).toHaveBeenCalledWith(expect.stringContaining("FE-1"));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "cliente@example.com", template: "business-document-attachment", attachments: [expect.objectContaining({ contentType: "application/pdf" })] }));
    expect(result).toMatchObject({ ok: true, sentTo: "cliente@example.com", emailId: "email-1" });
  });

  it("uses the same consolidated statement result for PDF rendering and email delivery", async () => {
    accountReceivable.findMany.mockResolvedValue([]);
    commercialObligation.findMany.mockResolvedValue([{ id: "obligation-1", sourceType: "CONTRACT", sourceId: "contract-1", sourceReference: "ALM-100", createdAt: new Date("2026-08-01"), dueDate: null, originalAmount: new Prisma.Decimal("1500"), outstandingAmount: new Prisma.Decimal("1000"), status: "PARTIALLY_SETTLED", allocations: [] }]);
    payment.findMany.mockResolvedValue([]);

    await service.send("tenant-1", { userId: "user-1", email: "agent@example.com", fullName: "Agente" }, "customer-1", "USD");

    expect(renderDocumentToBuffer).toHaveBeenCalledWith(expect.stringContaining("Contrato ALM-100"));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ attachments: [expect.objectContaining({ contentType: "application/pdf" })] }));
  });
});

import { Prisma } from "@prisma/client";
import { CustomerAccountStatementService } from "./customer-account-statement.service";

describe("CustomerAccountStatementService", () => {
  const client = { findFirst: jest.fn() };
  const accountReceivable = { findMany: jest.fn() };
  const payment = { findMany: jest.fn(), aggregate: jest.fn() };
  const renderDocumentToBuffer = jest.fn();
  const sendEmail = jest.fn();
  const getTenantConfig = jest.fn();
  const service = new CustomerAccountStatementService(
    { client, accountReceivable, payment } as never,
    { renderDocumentToBuffer } as never,
    { sendEmail } as never,
    { getTenantConfig } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    client.findFirst.mockResolvedValue({ id: "customer-1", fullName: "Cliente Uno", idNumber: "123", email: "cliente@example.com" });
    accountReceivable.findMany.mockResolvedValue([{ id: "ar-1", sourceNumber: "FE-1", sourceId: "source-1", sourceDocumentType: "Factura electrónica", recognizedAt: new Date("2026-08-01"), dueDate: new Date("2026-08-31"), originalAmount: new Prisma.Decimal("100"), outstandingAmount: new Prisma.Decimal("60"), status: "PARTIALLY_SETTLED", paymentAllocations: [{ amount: new Prisma.Decimal("40"), allocatedAt: new Date("2026-08-10"), status: "ACTIVE", payment: { receiptNumber: "RCP-1" } }] }]);
    payment.findMany.mockResolvedValue([{ id: "payment-1", receiptNumber: "RCP-1", receivedAt: new Date("2026-08-10"), receivedAmount: new Prisma.Decimal("50"), availableAmount: new Prisma.Decimal("10"), paymentMethod: "BANK_TRANSFER", status: "PARTIALLY_ALLOCATED", allocations: [{ amount: new Prisma.Decimal("40"), allocatedAt: new Date("2026-08-10"), status: "ACTIVE", accountReceivable: { sourceNumber: "FE-1", sourceId: "source-1" } }] }]);
    payment.aggregate.mockResolvedValue({ _sum: { availableAmount: new Prisma.Decimal("10") } });
    getTenantConfig.mockResolvedValue({ name: "Agencia" });
    renderDocumentToBuffer.mockResolvedValue({ pdfBuffer: Buffer.from("pdf"), signatureAnchors: {} });
    sendEmail.mockResolvedValue({ success: true, emailId: "email-1" });
  });

  it("builds totals from DB rows and keeps invoice/payment allocation detail", async () => {
    const result = await service.get("tenant-1", "customer-1", "USD");
    expect(result.totals).toEqual({ invoicedAmount: "100.00", allocatedAmount: "40.00", outstandingAmount: "60.00", availableAmount: "10.00" });
    expect(result.invoices[0].allocations[0]).toMatchObject({ receiptNumber: "RCP-1", amount: "40.00" });
    expect(result.payments[0].allocations[0]).toMatchObject({ invoiceNumber: "FE-1", amount: "40.00" });
  });

  it("renders the PDF and sends it through the centralized email service", async () => {
    const result = await service.send("tenant-1", { userId: "user-1", email: "agent@example.com", fullName: "Agente" }, "customer-1", "USD");
    expect(renderDocumentToBuffer).toHaveBeenCalledWith(expect.stringContaining("FE-1"));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "cliente@example.com", template: "business-document-attachment", attachments: [expect.objectContaining({ contentType: "application/pdf" })] }));
    expect(result).toMatchObject({ ok: true, sentTo: "cliente@example.com", emailId: "email-1" });
  });
});

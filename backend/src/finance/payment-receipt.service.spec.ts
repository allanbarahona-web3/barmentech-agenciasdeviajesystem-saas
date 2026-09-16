import { Prisma } from "@prisma/client";
import { PaymentReceiptService } from "./payment-receipt.service";

describe("PaymentReceiptService", () => {
  const payment = { findFirst: jest.fn() }; const client = { findFirst: jest.fn() }; const contract = { findMany: jest.fn() }; const billingAuditLog = { findFirst: jest.fn(), create: jest.fn() }; const tenantBillingConfiguration = { findUnique: jest.fn() }; const renderDocumentToBuffer = jest.fn(); const sendEmail = jest.fn(); const getTenantConfig = jest.fn();
  const service = new PaymentReceiptService({ payment, client, contract, billingAuditLog, tenantBillingConfiguration } as never, { renderDocumentToBuffer } as never, { sendEmail } as never, { getTenantConfig } as never);
  beforeEach(() => { jest.clearAllMocks(); payment.findFirst.mockResolvedValue(basePayment()); client.findFirst.mockResolvedValue({ fullName: "Cliente actual", idNumber: "3101999999", email: "cliente@example.com" }); contract.findMany.mockResolvedValue([]); billingAuditLog.findFirst.mockResolvedValue({ actorName: "Agente" }); tenantBillingConfiguration.findUnique.mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }); getTenantConfig.mockResolvedValue({ name: "Agencia", logoUrl: null, contactEmail: "info@example.com", contactPhone: "2222", primaryColor: "#123456", secondaryColor: null }); renderDocumentToBuffer.mockResolvedValue({ pdfBuffer: Buffer.from("pdf") }); sendEmail.mockResolvedValue({ success: true, emailId: "email-1" }); billingAuditLog.create.mockResolvedValue({}); });
  it("reads only the tenant payment and returns generic invoice applications", async () => { const result = await service.get("tenant-1", "payment-1"); expect(payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "payment-1", tenantId: "tenant-1" } })); expect(result).toMatchObject({ receiptNumber: "RCP-2026-000015", customer: { name: "Cliente actual", identification: "3101999999" }, receivedAmount: "100.125", appliedAmount: "40.125", availableAmount: "60.00", paymentMethodLabel: "Transferencia bancaria" }); expect(result.applications).toEqual(expect.arrayContaining([expect.objectContaining({ type: "ACCOUNT_RECEIVABLE", reference: "FE-1", statusLabel: "Aplicado" }), expect.objectContaining({ reference: "Cuenta por cobrar", statusLabel: "Revertido" })])); expect(contract.findMany).not.toHaveBeenCalled(); });
  it("normalizes commercial-obligation applications and uses the persisted settlement snapshot without FX recalculation", async () => {
    payment.findFirst.mockResolvedValue({ ...basePayment(), currencyCode: "CRC", receivedAmount: new Prisma.Decimal("23000"), availableAmount: new Prisma.Decimal("0"), settlementCurrencyCode: "USD", settlementAmount: new Prisma.Decimal("51.17"), settlementAvailableAmount: new Prisma.Decimal("0.05"), settlementExchangeRate: new Prisma.Decimal("449.49"), settlementExchangeRateSource: "BCCR", settlementExchangeRateEffectiveDate: new Date("2026-09-15T00:00:00.000Z"), allocations: [], commercialObligationAllocations: [{ id: "coa-1", amount: new Prisma.Decimal("51.12"), status: "ACTIVE", allocatedAt: new Date("2026-09-15T12:00:00.000Z"), commercialObligation: { sourceType: "CONTRACT", sourceId: "contract-1", sourceReference: "ALM-20260907-151229923-B9B6", currencyCode: "USD" } }] });
    contract.findMany.mockResolvedValue([{ id: "contract-1", contractNumber: "ALM-20260907-151229923-B9B6", destination: "San José", travelPackage: { name: "Pruebas de Factura desde Contrato Cred" }, internalTrip: null }]);

    const result = await service.get("tenant-1", "payment-1");

    expect(result).toMatchObject({ applicationCurrencyCode: "USD", appliedAmount: "51.12", availableAmount: "0.05", settlement: { currencyCode: "USD", amount: "51.17", exchangeRate: "449.49", exchangeRateSource: "BCCR" } });
    expect(result.applications).toEqual([expect.objectContaining({ type: "COMMERCIAL_OBLIGATION", reference: "ALM-20260907-151229923-B9B6", description: "Pruebas de Factura desde Contrato Cred", currencyCode: "USD", amount: "51.12" })]);
    expect(contract.findMany).toHaveBeenCalledTimes(1);
    expect(contract.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant-1", id: { in: ["contract-1"] } } }));
  });
  it("keeps mixed Finance application sources in one generic receipt projection", async () => {
    payment.findFirst.mockResolvedValue({ ...basePayment(), commercialObligationAllocations: [{ id: "coa-1", amount: new Prisma.Decimal("10"), status: "ACTIVE", allocatedAt: new Date("2026-09-02T01:30:00.000Z"), commercialObligation: { sourceType: "CONTRACT", sourceId: "contract-1", sourceReference: "ALM-100", currencyCode: "USD" } }] });
    contract.findMany.mockResolvedValue([{ id: "contract-1", contractNumber: "ALM-100", destination: "San José", travelPackage: null, internalTrip: null }]);

    const result = await service.get("tenant-1", "payment-1");

    expect(result.appliedAmount).toBe("50.125");
    expect(result.applications.map((application) => application.type)).toEqual(expect.arrayContaining(["ACCOUNT_RECEIVABLE", "COMMERCIAL_OBLIGATION"]));
    expect(contract.findMany).toHaveBeenCalledTimes(1);
  });
  it("renders cross-currency applications in settlement currency without the invoice-only empty state", async () => {
    payment.findFirst.mockResolvedValue({ ...basePayment(), currencyCode: "CRC", receivedAmount: new Prisma.Decimal("23000"), availableAmount: new Prisma.Decimal("0"), settlementCurrencyCode: "USD", settlementAmount: new Prisma.Decimal("51.17"), settlementAvailableAmount: new Prisma.Decimal("0.05"), settlementExchangeRate: new Prisma.Decimal("449.49"), settlementExchangeRateSource: "BCCR", settlementExchangeRateEffectiveDate: new Date("2026-09-15T00:00:00.000Z"), allocations: [], commercialObligationAllocations: [{ id: "coa-1", amount: new Prisma.Decimal("51.12"), status: "ACTIVE", allocatedAt: new Date("2026-09-15T12:00:00.000Z"), commercialObligation: { sourceType: "CONTRACT", sourceId: "contract-1", sourceReference: "ALM-20260907-151229923-B9B6", currencyCode: "USD" } }] });
    contract.findMany.mockResolvedValue([{ id: "contract-1", contractNumber: "ALM-20260907-151229923-B9B6", destination: "San José", travelPackage: { name: "Pruebas de Factura desde Contrato Cred" }, internalTrip: null }]);

    await service.render("tenant-1", "payment-1");

    const html = renderDocumentToBuffer.mock.calls[0]![0] as string;
    expect(html).toContain("CRC 23,000.00");
    expect(html).toContain("USD 51.17");
    expect(html).toContain("USD 51.12");
    expect(html).toContain("USD 0.05");
    expect(html).toContain("ALM-20260907-151229923-B9B6");
    expect(html).toContain("Pruebas de Factura desde Contrato Cred");
    expect(html).not.toContain("Este recibo no tiene aplicaciones financieras registradas.");
    expect(html).not.toContain("Factura / cuenta por cobrar");
  });
  it.each(["PENDING_VERIFICATION", "REJECTED"])("rejects %s because no receipt has been issued", async (status) => { const current = await payment.findFirst(); payment.findFirst.mockResolvedValue({ ...current, status, receiptNumber: null }); await expect(service.get("tenant-1", "payment-1")).rejects.toThrow("PAYMENT_RECEIPT_UNAVAILABLE"); });
  it("keeps a numbered cancelled payment receipt available", async () => { const current = await payment.findFirst(); payment.findFirst.mockResolvedValue({ ...current, status: "CANCELLED" }); await expect(service.get("tenant-1", "payment-1")).resolves.toMatchObject({ receiptNumber: "RCP-2026-000015", statusLabel: "Cancelado" }); });
  it("rejects an eligible status when its receipt number is missing", async () => { const current = await payment.findFirst(); payment.findFirst.mockResolvedValue({ ...current, status: "RECEIVED", receiptNumber: null }); await expect(service.get("tenant-1", "payment-1")).rejects.toThrow("PAYMENT_RECEIPT_UNAVAILABLE"); });
  it("renders and sends the shared PDF attachment, recording the send audit", async () => { const result = await service.send("tenant-1", { userId: "user-1", email: "agent@example.com", fullName: "Agente" }, "payment-1"); expect(renderDocumentToBuffer).toHaveBeenCalledWith(expect.stringContaining("RCP-2026-000015")); expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "cliente@example.com", template: "business-document-attachment", attachments: [expect.objectContaining({ filename: "recibo-RCP-2026-000015.pdf", contentType: "application/pdf" })] })); expect(billingAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entityId: "payment-1", action: "RECEIPT_SENT", actorName: "Agente" }) })); expect(result).toMatchObject({ ok: true, sentTo: "cliente@example.com", emailId: "email-1" }); });
});

function basePayment() {
  return {
    id: "payment-1", customerId: "customer-1", receiptNumber: "RCP-2026-000015", payerDisplayName: "Nombre guardado", payerIdentificationNumber: "snapshot-id",
    currencyCode: "USD", receivedAmount: new Prisma.Decimal("100.125"), availableAmount: new Prisma.Decimal("60"),
    settlementCurrencyCode: null, settlementAmount: null, settlementAvailableAmount: null, settlementExchangeRate: null, settlementExchangeRateSource: null, settlementExchangeRateEffectiveDate: null,
    receivedAt: new Date("2026-09-01T01:30:00.000Z"), paymentMethod: "BANK_TRANSFER", externalReference: "REF-123", description: "Nota", status: "PARTIALLY_ALLOCATED",
    allocations: [
      { id: "allocation-1", amount: new Prisma.Decimal("40.125"), status: "ACTIVE", allocatedAt: new Date("2026-09-01T01:30:00.000Z"), accountReceivable: { sourceNumber: "FE-1", sourceDocumentType: "Factura electrónica", currencyCode: "USD" } },
      { id: "allocation-2", amount: new Prisma.Decimal("10"), status: "REVERSED", allocatedAt: new Date("2026-09-01T01:30:00.000Z"), accountReceivable: { sourceNumber: null, sourceDocumentType: null, currencyCode: "USD" } },
    ],
    commercialObligationAllocations: [],
  };
}

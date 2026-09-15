import { paymentReceiptTemplate, type PaymentReceipt } from "./payment-receipt.template";

describe("paymentReceiptTemplate", () => {
  it("renders the RCP identity, authoritative amounts, labels, and allocation lines", () => {
    const receipt: PaymentReceipt = { receiptNumber: "RCP-2026-000015", customer: { name: "Cliente Uno", identification: "3101999999", email: "cliente@example.com" }, currencyCode: "USD", receivedAmount: "100.12500", applicationCurrencyCode: "USD", appliedAmount: "40.12500", availableAmount: "60.00000", settlement: null, receivedAt: new Date("2026-09-01T01:30:00.000Z"), paymentMethodLabel: "Transferencia bancaria", externalReference: "REF-123", description: "Pago parcial", statusLabel: "Aplicado parcialmente", registeredBy: "Agente", applications: [{ type: "ACCOUNT_RECEIVABLE", reference: "FE-1", description: "Factura electrónica", relatedDocumentReference: "FE-1", amount: "40.12500", currencyCode: "USD", statusLabel: "Aplicado", applicationDate: new Date("2026-09-01T01:30:00.000Z") }] };
    const html = paymentReceiptTemplate(receipt, { name: "Agencia Uno", primaryColor: "#123456" }, "America/Costa_Rica");
    expect(html).toContain("Recibo de dinero"); expect(html).toContain("RCP-2026-000015"); expect(html).toContain("USD 100.125"); expect(html).toContain("USD 40.125"); expect(html).toContain("USD 60.00"); expect(html).toContain("Transferencia bancaria"); expect(html).toContain("FE-1"); expect(html).toContain("Aplicado a"); expect(html).toContain("Cliente Uno"); expect(html).not.toContain("Factura / cuenta por cobrar"); expect(html).not.toContain("REP10"); expect(html).not.toContain("Hacienda");
  });

  it("renders persisted cross-currency settlement amounts without converting application rows", () => {
    const receipt: PaymentReceipt = { receiptNumber: "RCP-2026-000021", customer: { name: "Cliente Uno", identification: null, email: null }, currencyCode: "CRC", receivedAmount: "23000", applicationCurrencyCode: "USD", appliedAmount: "51.12", availableAmount: "0.05", settlement: { currencyCode: "USD", amount: "51.17", availableAmount: "0.05", exchangeRate: "449.49", exchangeRateSource: "BCCR", exchangeRateEffectiveDate: new Date("2026-09-15T00:00:00.000Z") }, receivedAt: new Date("2026-09-15T12:00:00.000Z"), paymentMethodLabel: "Transferencia bancaria", externalReference: null, description: null, statusLabel: "Aplicado parcialmente", registeredBy: null, applications: [{ type: "COMMERCIAL_OBLIGATION", reference: "ALM-20260907-151229923-B9B6", description: "Pruebas de Factura desde Contrato Cred", relatedDocumentReference: null, amount: "51.12", currencyCode: "USD", statusLabel: "Aplicado", applicationDate: new Date("2026-09-15T12:00:00.000Z") }] };
    const html = paymentReceiptTemplate(receipt, { name: "Agencia Uno", primaryColor: "#123456" }, "America/Costa_Rica");

    expect(html).toContain("CRC 23,000.00"); expect(html).toContain("USD 51.17"); expect(html).toContain("USD 51.12"); expect(html).toContain("USD 0.05"); expect(html).toContain("449.49"); expect(html).toContain("BCCR"); expect(html).toContain("ALM-20260907-151229923-B9B6"); expect(html).not.toContain("CRC 51.12");
  });
});

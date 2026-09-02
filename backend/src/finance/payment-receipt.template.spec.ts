import { paymentReceiptTemplate, type PaymentReceipt } from "./payment-receipt.template";

describe("paymentReceiptTemplate", () => {
  it("renders the RCP identity, authoritative amounts, labels, and allocation lines", () => {
    const receipt: PaymentReceipt = { receiptNumber: "RCP-2026-000015", customer: { name: "Cliente Uno", identification: "3101999999", email: "cliente@example.com" }, currencyCode: "USD", receivedAmount: "100.12500", appliedAmount: "40.12500", availableAmount: "60.00000", receivedAt: new Date("2026-09-01T01:30:00.000Z"), paymentMethodLabel: "Transferencia bancaria", externalReference: "REF-123", description: "Pago parcial", statusLabel: "Aplicado parcialmente", registeredBy: "Agente", allocations: [{ sourceNumber: "FE-1", amount: "40.12500", statusLabel: "Aplicado", allocatedAt: new Date("2026-09-01T01:30:00.000Z") }] };
    const html = paymentReceiptTemplate(receipt, { name: "Agencia Uno", primaryColor: "#123456" }, "America/Costa_Rica");
    expect(html).toContain("Recibo de dinero"); expect(html).toContain("RCP-2026-000015"); expect(html).toContain("USD 100.125"); expect(html).toContain("USD 40.125"); expect(html).toContain("USD 60.00"); expect(html).toContain("Transferencia bancaria"); expect(html).toContain("FE-1"); expect(html).toContain("Cliente Uno"); expect(html).not.toContain("REP10"); expect(html).not.toContain("Hacienda");
  });
});

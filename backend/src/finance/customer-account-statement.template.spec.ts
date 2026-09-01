import { customerAccountStatementStatusLabel, customerAccountStatementTemplate, type CustomerAccountStatement } from "./customer-account-statement.template";

describe("customerAccountStatementTemplate", () => {
  it("renders dates and payment methods as business-facing values without raw ISO fragments", () => {
    const statement: CustomerAccountStatement = {
      generatedAt: new Date("2026-09-01T01:30:00.000Z"), customer: { id: "customer-1", name: "Cliente Uno", identification: "123", email: null }, currencyCode: "USD",
      totals: { invoicedAmount: "100.00", allocatedAmount: "40.00", outstandingAmount: "60.00", availableAmount: "10.00" },
      invoices: [{ id: "ar-1", number: "FE-1", documentType: "Factura electrónica", recognizedAt: new Date("2026-09-01T01:30:00.000Z"), dueDate: new Date("2026-09-01T00:00:00.000Z"), originalAmount: "100.00", allocatedAmount: "40.00", outstandingAmount: "60.00", status: "PARTIALLY_SETTLED", allocations: [{ receiptNumber: "RCP-1", amount: "40.00", allocatedAt: new Date("2026-09-01T01:30:00.000Z"), status: "ACTIVE", statusLabel: "Aplicado" }] }],
      payments: [{ id: "payment-1", receiptNumber: "RCP-1", receivedAt: new Date("2026-09-01T01:30:00.000Z"), receivedAmount: "50.00", availableAmount: "10.00", paymentMethod: "BANK_TRANSFER", paymentMethodLabel: "Transferencia bancaria", status: "PARTIALLY_ALLOCATED", allocations: [{ invoiceNumber: "FE-1", amount: "40.00", allocatedAt: new Date("2026-09-01T01:30:00.000Z"), status: "ACTIVE", statusLabel: "Aplicado" }] }],
    };

    const html = customerAccountStatementTemplate(statement, "Agencia", "America/Costa_Rica");

    expect(html).toContain("Generado 31/08/2026 19:30");
    expect(html).toContain("<td>31/08/2026</td><td>01/09/2026</td>");
    expect(html).toContain("Transferencia bancaria");
    expect(html).toContain("Aplicado");
    expect(html).not.toMatch(/[T]\d{2}:\d{2}:\d{2}/);
    expect(html).not.toContain("BANK_TRANSFER");
  });

  it("uses receipt allocation wording without changing internal statuses", () => {
    expect(customerAccountStatementStatusLabel("ACTIVE")).toBe("Aplicado");
    expect(customerAccountStatementStatusLabel("REVERSED")).toBe("Revertido");
  });
});

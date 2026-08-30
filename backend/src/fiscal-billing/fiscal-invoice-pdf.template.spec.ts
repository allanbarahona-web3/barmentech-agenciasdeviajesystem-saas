import type { AcceptedBillingInvoice } from "./billing-document.types";
import { fiscalInvoicePdfTemplate } from "./fiscal-invoice-pdf.template";

describe("fiscalInvoicePdfTemplate", () => {
  it("uses the accepted snapshot and rounds only its presentation", () => {
    const invoice = fixture();
    const html = fiscalInvoicePdfTemplate(invoice);

    expect(html).toContain("Issuer SA");
    expect(html).toContain("00100001010000000228");
    expect(html).toContain("Customer");
    expect(html).toContain("SO-2026-000010");
    expect(html).toContain("Seguro · Cobertura: USD 60,000");
    expect(html).toContain("USD&nbsp;97.50");
    expect(html).toContain("USD&nbsp;12.68");
    expect(html).toContain("USD&nbsp;110.18");
    expect(invoice.totals.total).toBe("110.17500");
    expect(invoice.lines[0].taxes[0].taxAmount).toBe("12.67500");
  });

  it("escapes persisted snapshot text instead of interpreting it as HTML", () => {
    const invoice = fixture();
    invoice.lines[0].description = "<script>unsafe()</script>";
    const html = fiscalInvoicePdfTemplate(invoice);
    expect(html).toContain("&lt;script&gt;unsafe()&lt;/script&gt;");
    expect(html).not.toContain("<script>unsafe()</script>");
  });
});

function fixture(): AcceptedBillingInvoice {
  return {
    billingDocumentId: "document-a", internalNumber: "BD-SO-order-a", fiscalNumber: "00100001010000000228", documentTypeCode: "01", lifecycleStatus: "SUBMITTED", taxAuthorityStatus: "ACCEPTED", issuedDate: "2026-08-30", currencyCode: "USD",
    issuer: { name: "Issuer SA", identificationType: "02", identificationNumber: "3101000000", email: "issuer@example.test", phone: "2222-2222" },
    paymentCondition: { code: "01", creditTermDays: null, dueDate: "2026-08-30" },
    receiver: { name: "Customer", identificationType: "01", identificationNumber: "123456789", email: "customer@example.test" },
    salesOrder: { id: "order-a", number: "SO-2026-000010" },
    lines: [{ lineNumber: 1, description: "Seguro · Cobertura: USD 60,000", quantity: "1.00000", unitOfMeasureCode: "Sp", unitPrice: "97.50000", subtotal: "97.50000", taxableBase: "97.50000", taxes: [{ taxCode: "01", rateCode: "08", ratePercentage: "13.00000", taxableBase: "97.50000", taxAmount: "12.67500", netTaxAmount: "12.67500" }], lineTotal: "110.17500" }],
    totals: { subtotal: "97.50000", totalTax: "12.67500", total: "110.17500" },
  };
}

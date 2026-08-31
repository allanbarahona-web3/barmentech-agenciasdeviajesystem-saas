import type { AcceptedBillingInvoice } from "./billing-document.types";
import { fiscalInvoicePdfTemplate } from "./fiscal-invoice-pdf.template";

describe("fiscalInvoicePdfTemplate", () => {
  it("uses the accepted snapshot and rounds only its presentation", () => {
    const invoice = fixture();
    const html = fiscalInvoicePdfTemplate(invoice, branding());

    expect(html).toContain("Issuer SA");
    expect(html).toContain("Viajes Tenant");
    expect(html).toContain("https://cdn.example.test/logo.png");
    expect(html).toContain("--invoice-primary: #125ea8");
    expect(html).toContain("CABYS 78111800");
    expect(html).toContain("San José centro · 1-01-01");
    expect(html).toContain("00100001010000000228");
    expect(html).toContain("50630082600310100000000100001010000000228123456789");
    expect(html).toContain("Clave");
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
    const html = fiscalInvoicePdfTemplate(invoice, branding());
    expect(html).toContain("&lt;script&gt;unsafe()&lt;/script&gt;");
    expect(html).not.toContain("<script>unsafe()</script>");
  });

  it("falls back safely when optional tenant branding is absent or invalid", () => {
    const html = fiscalInvoicePdfTemplate(fixture(), { commercialName: null, logoSrc: null, contactEmail: null, contactPhone: null, primaryColor: "red;display:none", secondaryColor: null });
    expect(html).toContain("Issuer SA");
    expect(html).toContain("--invoice-primary: #21466f");
    expect(html).not.toContain("red;display:none");
  });
});

function branding() { return { commercialName: "Viajes Tenant", logoSrc: "https://cdn.example.test/logo.png", contactEmail: "info@tenant.test", contactPhone: "2222-0000", primaryColor: "#125EA8", secondaryColor: "#17324D" }; }

function fixture(): AcceptedBillingInvoice {
  return {
    billingDocumentId: "document-a", internalNumber: "BD-SO-order-a", fiscalNumber: "00100001010000000228", haciendaKey: "50630082600310100000000100001010000000228123456789", documentTypeCode: "01", lifecycleStatus: "SUBMITTED", taxAuthorityStatus: "ACCEPTED", issuedDate: "2026-08-30", currencyCode: "USD",
    issuer: { name: "Issuer SA", legalName: "Issuer SA", identificationType: "02", identificationNumber: "3101000000", email: "issuer@example.test", phone: "2222-2222", address: { provinceCode: "1", cantonCode: "01", districtCode: "01", neighborhoodCode: null, otherAddressDetails: "San José centro" } },
    paymentCondition: { code: "01", creditTermDays: null, dueDate: "2026-08-30" },
    receiver: { name: "Customer", identificationType: "01", identificationNumber: "123456789", email: "customer@example.test" },
    salesOrder: { id: "order-a", number: "SO-2026-000010" },
    paymentMethods: [{ code: "01", description: "Efectivo", declaredAmount: null }],
    lines: [{ lineNumber: 1, cabysCode: "78111800", itemCode: "INSURANCE", description: "Seguro · Cobertura: USD 60,000", quantity: "1.00000", unitOfMeasureCode: "Sp", unitPrice: "97.50000", subtotal: "97.50000", taxableBase: "97.50000", taxes: [{ taxCode: "01", rateCode: "08", ratePercentage: "13.00000", taxableBase: "97.50000", taxAmount: "12.67500", netTaxAmount: "12.67500" }], lineTotal: "110.17500" }],
    totals: { subtotal: "97.50000", totalTax: "12.67500", total: "110.17500" },
  };
}

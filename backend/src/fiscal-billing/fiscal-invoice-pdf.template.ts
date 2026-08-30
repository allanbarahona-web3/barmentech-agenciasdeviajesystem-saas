import {
  documentFooter,
  documentHeader,
  documentLayout,
  documentTitle,
  escapeHtml,
  formatDate,
  sectionHeading,
} from "../documents/templates/shared";
import type { AcceptedBillingInvoice } from "./billing-document.types";
import {
  parseFiscalDecimal,
  quantizeFiscalDecimal,
} from "./fiscal-decimal";

const DOCUMENT_TYPES: Readonly<Record<string, string>> = {
  "01": "Factura electrónica",
  "04": "Tiquete electrónico",
};

const IDENTIFICATION_TYPES: Readonly<Record<string, string>> = {
  "01": "Cédula física",
  "02": "Cédula jurídica",
  "03": "DIMEX",
  "04": "NITE",
};

export function fiscalInvoicePdfTemplate(invoice: AcceptedBillingInvoice): string {
  const company = {
    name: invoice.issuer.name,
    contactEmail: invoice.issuer.email,
    contactPhone: invoice.issuer.phone,
  };
  const content = [
    documentHeader(company, {
      documentNumber: invoice.fiscalNumber,
      documentNumberLabel: "Número fiscal",
      issuedAt: formatDate(invoice.issuedDate),
      additionalItems: [
        {
          label: "Identificación emisor",
          value: `${invoice.issuer.identificationType} · ${invoice.issuer.identificationNumber}`,
        },
        { label: "Moneda", value: invoice.currencyCode },
      ],
    }),
    documentTitle(DOCUMENT_TYPES[invoice.documentTypeCode] ?? "Documento fiscal"),
    invoiceSummary(invoice),
    invoiceLines(invoice),
    invoiceTotals(invoice),
    documentFooter(company),
  ].join("\n");

  return documentLayout(content, {
    title: `${DOCUMENT_TYPES[invoice.documentTypeCode] ?? "Documento fiscal"} ${invoice.fiscalNumber}`,
    additionalStyles: invoiceStyles(),
  });
}

function invoiceSummary(invoice: AcceptedBillingInvoice): string {
  const identification = invoice.receiver.identificationType && invoice.receiver.identificationNumber
    ? `${IDENTIFICATION_TYPES[invoice.receiver.identificationType] ?? invoice.receiver.identificationType} · ${invoice.receiver.identificationNumber}`
    : "No registrada";
  return `
<section class="invoice-summary">
  <article>
    ${sectionHeading("Receptor")}
    <dl>
      ${row("Nombre", invoice.receiver.name ?? "No registrado")}
      ${row("Identificación", identification)}
      ${invoice.receiver.email ? row("Correo", invoice.receiver.email) : ""}
    </dl>
  </article>
  <article>
    ${sectionHeading("Información de factura")}
    <dl>
      ${row("Condición", paymentCondition(invoice))}
      ${invoice.paymentCondition.dueDate ? row("Vencimiento", formatDate(invoice.paymentCondition.dueDate)) : ""}
      ${row("Orden de venta", invoice.salesOrder?.number ?? invoice.salesOrder?.id ?? "No disponible")}
    </dl>
  </article>
</section>`;
}

function invoiceLines(invoice: AcceptedBillingInvoice): string {
  return `
<section class="invoice-lines">
  ${sectionHeading("Detalle")}
  <table>
    <thead><tr>
      <th>Descripción</th><th class="number">Cantidad</th><th class="number">Precio unitario</th>
      <th class="number">Subtotal / Base</th><th class="number">Impuestos</th><th class="number">Total</th>
    </tr></thead>
    <tbody>
      ${invoice.lines.map((line) => `
      <tr>
        <td><strong>${escapeHtml(line.description)}</strong><small>Unidad ${escapeHtml(line.unitOfMeasureCode)}</small></td>
        <td class="number">${escapeHtml(line.quantity)}</td>
        <td class="number">${money(line.unitPrice, invoice.currencyCode)}</td>
        <td class="number">${money(line.subtotal, invoice.currencyCode)}<small>Base ${money(line.taxableBase, invoice.currencyCode)}</small></td>
        <td class="number">${taxes(line, invoice.currencyCode)}</td>
        <td class="number"><strong>${money(line.lineTotal, invoice.currencyCode)}</strong></td>
      </tr>`).join("")}
    </tbody>
  </table>
</section>`;
}

function invoiceTotals(invoice: AcceptedBillingInvoice): string {
  return `
<section class="invoice-totals">
  <dl>
    ${totalRow("Subtotal", invoice.totals.subtotal, invoice.currencyCode)}
    ${totalRow("Total impuestos", invoice.totals.totalTax, invoice.currencyCode)}
    <div class="grand-total"><dt>Total</dt><dd>${money(invoice.totals.total, invoice.currencyCode)}</dd></div>
  </dl>
</section>`;
}

function row(label: string, value: string): string {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function totalRow(label: string, value: string, currency: string): string {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${money(value, currency)}</dd></div>`;
}

function taxes(
  line: AcceptedBillingInvoice["lines"][number],
  currency: string,
): string {
  if (line.taxes.length === 0) return "Sin impuesto";
  return line.taxes.map((tax) => (
    `${decimal(tax.ratePercentage)}%<small>${money(tax.netTaxAmount, currency)}</small>`
  )).join("<br />");
}

function paymentCondition(invoice: AcceptedBillingInvoice): string {
  if (invoice.paymentCondition.code === "01") return "Contado";
  if (invoice.paymentCondition.code === "02") {
    return invoice.paymentCondition.creditTermDays
      ? `Crédito · ${invoice.paymentCondition.creditTermDays} días`
      : "Crédito";
  }
  return "No disponible";
}

function money(value: string, currency: string): string {
  return `${escapeHtml(currency)}&nbsp;${decimal(value)}`;
}

function decimal(value: string): string {
  const parsed = parseFiscalDecimal(value, { precision: 19, scale: 5 });
  const rounded = quantizeFiscalDecimal(parsed, 2).canonical;
  const [whole, fraction = ""] = rounded.split(".");
  return `${escapeHtml(whole.replace(/\B(?=(\d{3})+(?!\d))/g, ","))}.${escapeHtml(fraction.padEnd(2, "0"))}`;
}

function invoiceStyles(): string {
  return `
.doc-header-logo[src=""] { display: none; }
.invoice-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; margin-bottom: 12pt; }
.invoice-summary article { break-inside: avoid; border: .75pt solid #d8e0e9; border-radius: 5pt; padding: 7pt 9pt; }
.invoice-summary .section-heading { margin-top: 0; }
.invoice-summary dl { display: grid; gap: 3pt; }
.invoice-summary dl div { display: grid; grid-template-columns: 30mm 1fr; gap: 5pt; }
.invoice-summary dt { color: #556579; }
.invoice-summary dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.invoice-lines table { width: 100%; border-collapse: collapse; font-size: 8pt; }
.invoice-lines th { padding: 5pt 4pt; background: #21466f; color: #fff; text-align: left; }
.invoice-lines td { padding: 6pt 4pt; border-bottom: .6pt solid #dfe5ed; vertical-align: top; }
.invoice-lines tr { break-inside: avoid; }
.invoice-lines .number { text-align: right; font-variant-numeric: tabular-nums; }
.invoice-lines small { display: block; margin-top: 2pt; color: #64748b; font-size: 7pt; }
.invoice-totals { display: flex; justify-content: flex-end; margin-top: 12pt; break-inside: avoid; }
.invoice-totals dl { width: 72mm; }
.invoice-totals dl div { display: flex; justify-content: space-between; gap: 12pt; padding: 4pt 0; border-bottom: .6pt solid #dfe5ed; }
.invoice-totals dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
.invoice-totals .grand-total { margin-top: 3pt; border-top: 1.2pt solid #21466f; border-bottom: 0; color: #102344; font-size: 11pt; font-weight: 800; }
.doc-footer { margin-top: auto; }
`;
}

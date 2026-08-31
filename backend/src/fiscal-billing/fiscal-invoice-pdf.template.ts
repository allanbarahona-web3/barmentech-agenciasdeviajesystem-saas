import {
  documentFooter,
  documentLayout,
  escapeAttribute,
  escapeHtml,
  formatDate,
  sectionHeading,
} from "../documents/templates/shared";
import type { AcceptedBillingInvoice } from "./billing-document.types";
import { parseFiscalDecimal, quantizeFiscalDecimal } from "./fiscal-decimal";

const DOCUMENT_TYPES: Readonly<Record<string, string>> = { "01": "Factura electrónica", "04": "Tiquete electrónico" };
const IDENTIFICATION_TYPES: Readonly<Record<string, string>> = { "01": "Cédula física", "02": "Cédula jurídica", "03": "DIMEX", "04": "NITE" };
const PAYMENT_METHODS: Readonly<Record<string, string>> = {
  "01": "Efectivo",
  "02": "Tarjeta",
  "03": "Cheque",
  "04": "Transferencia/depósito bancario",
  "05": "Recaudado por terceros",
  "06": "SINPE Móvil",
  "07": "Plataforma digital",
  "99": "Otros",
};
const DEFAULT_PRIMARY_COLOR = "#21466f";
const DEFAULT_SECONDARY_COLOR = "#102344";

export interface FiscalInvoicePdfBranding {
  commercialName: string | null;
  logoSrc: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactWhatsApp: string | null;
  businessAddress: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
}

export function fiscalInvoicePdfTemplate(invoice: AcceptedBillingInvoice, branding: FiscalInvoicePdfBranding): string {
  const documentType = DOCUMENT_TYPES[invoice.documentTypeCode] ?? "Documento fiscal";
  const company = {
    name: nonEmpty(branding.commercialName) ?? invoice.issuer.legalName,
    contactEmail: nonEmpty(branding.contactEmail),
    contactPhone: nonEmpty(branding.contactPhone) ?? nonEmpty(branding.contactWhatsApp),
    logoSrc: nonEmpty(branding.logoSrc),
  };
  const content = [
    invoiceHeader(company, branding),
    parties(invoice, branding),
    fiscalKey(invoice),
    invoiceSummary(invoice, documentType),
    invoiceLines(invoice),
    invoiceTotals(invoice),
    documentFooter(company),
    fiscalFooter(invoice),
  ].join("\n");
  return documentLayout(content, {
    title: `${documentType} ${invoice.fiscalNumber}`,
    additionalStyles: invoiceStyles(safeColor(branding.primaryColor, DEFAULT_PRIMARY_COLOR), safeColor(branding.secondaryColor, DEFAULT_SECONDARY_COLOR)),
  });
}

function invoiceHeader(company: { name: string; contactEmail: string | null; contactPhone: string | null; logoSrc: string | null }, branding: FiscalInvoicePdfBranding): string {
  const contacts = [company.contactEmail, company.contactPhone, nonEmpty(branding.contactWhatsApp)]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  return `<header class="doc-header invoice-brand-header">
  <img class="doc-header-logo" src="${escapeAttribute(company.logoSrc ?? "")}" alt="${escapeHtml(company.name)}" />
  <div class="doc-header-text"><h1>${escapeHtml(company.name)}</h1>
    ${contacts.length ? `<p class="brand-contact">${contacts.map(escapeHtml).join(" · ")}</p>` : ""}
    ${nonEmpty(branding.businessAddress) ? `<p class="brand-address">${escapeHtml(branding.businessAddress!.trim())}</p>` : ""}
  </div>
</header>`;
}

function parties(invoice: AcceptedBillingInvoice, branding: FiscalInvoicePdfBranding): string {
  return `<section class="party-summary invoice-summary">
  <article>${sectionHeading("Emisor")}<dl>
    ${row("Nombre legal", invoice.issuer.legalName)}
    ${row("Identificación", identification(invoice.issuer.identificationType, invoice.issuer.identificationNumber))}
    ${invoice.issuer.email ? row("Correo", invoice.issuer.email) : ""}${invoice.issuer.phone ? row("Teléfono", invoice.issuer.phone) : ""}
    ${nonEmpty(branding.businessAddress) ? row("Dirección", branding.businessAddress!.trim()) : ""}
  </dl></article>
  <article>${sectionHeading("Receptor")}<dl>
    ${row("Nombre", invoice.receiver.name ?? "No registrado")}
    ${row("Identificación", receiverIdentification(invoice))}${invoice.receiver.email ? row("Correo", invoice.receiver.email) : ""}
  </dl></article>
</section>`;
}

function fiscalKey(invoice: AcceptedBillingInvoice): string {
  return `<section class="fiscal-key"><span>Clave de Hacienda</span><strong>${escapeHtml(invoice.haciendaKey)}</strong></section>`;
}

function invoiceSummary(invoice: AcceptedBillingInvoice, documentType: string): string {
  return `<section class="invoice-summary transaction-invoice-summary">
  <article>${sectionHeading("Datos de la transacción")}<dl>
    ${row("Condición", paymentCondition(invoice))}${row("Moneda", invoice.currencyCode)}
    ${invoice.salesOrder ? row("Orden de venta", invoice.salesOrder.number ?? invoice.salesOrder.id) : ""}
    ${invoice.paymentMethods.length ? row("Medio de pago", paymentMethods(invoice)) : ""}
  </dl></article>
  <article>${sectionHeading("Factura electrónica")}<dl>
    ${row("Número de factura", invoice.fiscalNumber)}${row("Fecha de emisión", formatDate(invoice.issuedDate))}${row("Tipo de comprobante", documentType)}
  </dl></article>
</section>`;
}

function invoiceLines(invoice: AcceptedBillingInvoice): string {
  return `<section class="invoice-lines">${sectionHeading("Detalle")}<table>
  <thead><tr><th class="code">Código / CABYS</th><th>Descripción</th><th class="number">Cantidad</th><th class="number">Precio unitario</th><th class="number">Impuesto</th><th class="number">Total</th></tr></thead>
  <tbody>${invoice.lines.map((line) => `<tr>
    <td class="code">${lineCode(line)}</td>
    <td><strong>${escapeHtml(line.description)}</strong></td>
    <td class="number">${escapeHtml(line.quantity)}</td><td class="number">${money(line.unitPrice, invoice.currencyCode)}</td>
    <td class="number">${taxes(line, invoice.currencyCode)}</td><td class="number"><strong>${money(line.lineTotal, invoice.currencyCode)}</strong></td>
  </tr>`).join("")}</tbody></table></section>`;
}

function invoiceTotals(invoice: AcceptedBillingInvoice): string {
  return `<section class="invoice-totals"><dl>${totalRow("Subtotal", invoice.totals.subtotal, invoice.currencyCode)}${totalRow("Impuestos", invoice.totals.totalTax, invoice.currencyCode)}<div class="grand-total"><dt>Total</dt><dd>${money(invoice.totals.total, invoice.currencyCode)}</dd></div></dl></section>`;
}

function fiscalFooter(invoice: AcceptedBillingInvoice): string {
  const contact = [invoice.issuer.email, invoice.issuer.phone].filter((value): value is string => Boolean(value?.trim())).join(" · ");
  return `<section class="fiscal-footer"><p><strong>${escapeHtml(invoice.issuer.legalName)}</strong> · ${escapeHtml(identification(invoice.issuer.identificationType, invoice.issuer.identificationNumber))}${contact ? ` · ${escapeHtml(contact)}` : ""}</p><p>Autorizado mediante Resolución DGT-R-033-2019 del 20 de junio del 2019 de la DGT v4.3</p><p>Documento electrónico Costa Rica · Versión 4.4</p><div class="representation-legend" aria-label="Espacio para leyenda de representación fiscal"></div></section>`;
}

function row(label: string, value: string): string { return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`; }
function totalRow(label: string, value: string, currency: string): string { return `<div><dt>${escapeHtml(label)}</dt><dd>${money(value, currency)}</dd></div>`; }
function paymentCondition(invoice: AcceptedBillingInvoice): string {
  if (invoice.paymentCondition.code === "01") return "Contado";
  if (invoice.paymentCondition.code === "02") return invoice.paymentCondition.creditTermDays ? `Crédito · ${invoice.paymentCondition.creditTermDays} días` : "Crédito";
  return "No disponible";
}
function paymentMethods(invoice: AcceptedBillingInvoice): string { return invoice.paymentMethods.map((method) => PAYMENT_METHODS[method.code] ?? "Método fiscal").join(", "); }
function lineCode(line: AcceptedBillingInvoice["lines"][number]): string {
  return line.cabysCode ? escapeHtml(line.cabysCode) : "—";
}
function taxes(line: AcceptedBillingInvoice["lines"][number], currency: string): string {
  if (line.taxes.length === 0) return "Sin impuesto";
  return line.taxes.map((tax) => `${decimal(tax.ratePercentage)}%<small>${money(tax.netTaxAmount, currency)}</small>`).join("<br />");
}
function receiverIdentification(invoice: AcceptedBillingInvoice): string {
  return invoice.receiver.identificationType && invoice.receiver.identificationNumber
    ? identification(invoice.receiver.identificationType, invoice.receiver.identificationNumber)
    : "No registrada";
}
function identification(type: string, number: string): string {
  return `${IDENTIFICATION_TYPES[type] ?? "Identificación"} · ${number}`;
}
function money(value: string, currency: string): string { return `${escapeHtml(currency)}&nbsp;${decimal(value)}`; }
function decimal(value: string): string {
  const rounded = quantizeFiscalDecimal(parseFiscalDecimal(value, { precision: 19, scale: 5 }), 2).canonical;
  const [whole, fraction = ""] = rounded.split(".");
  return `${escapeHtml(whole.replace(/\B(?=(\d{3})+(?!\d))/g, ","))}.${escapeHtml(fraction.padEnd(2, "0"))}`;
}
function nonEmpty(value: string | null): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function safeColor(value: string | null, fallback: string): string { return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback; }

function invoiceStyles(primary: string, secondary: string): string {
  return `:root { --invoice-primary: ${primary}; --invoice-secondary: ${secondary}; --invoice-border: #d6dce3; --invoice-muted: #475569; }
@page { size: A4 portrait; margin: 14mm 14mm 16mm; }
html, body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; line-height: 1.28; }
.doc-header { min-height: 42pt; flex-direction: row; align-items: center; justify-content: space-between; gap: 18pt; margin-bottom: 11pt; padding: 0 0 7pt; text-align: left; border-bottom: .8pt solid var(--invoice-border); }
.doc-header-logo { width: 205pt; max-height: 95pt; object-fit: contain; object-position: left center; }.doc-header-logo[src=""] { display: none; }
.doc-header-text { text-align: right; }.doc-header-text h1 { margin: 0; color: var(--invoice-secondary); font-size: 11pt; line-height: 1.15; text-transform: uppercase; letter-spacing: .015em; }.brand-contact,.brand-address { margin: 1.5pt 0 0; color: #1f2937; font-size: 7pt; line-height: 1.25; }.brand-address { max-width: 105mm; margin-left: auto; }
.invoice-summary { display: grid; grid-template-columns: 1.4fr 1fr; gap: 0; margin-bottom: 7pt; border: .6pt solid var(--invoice-border); break-inside: avoid; }.invoice-summary article { min-width: 0; padding: 0; border: 0; border-right: .6pt solid var(--invoice-border); border-radius: 0; }.invoice-summary article:last-child { border-right: 0; }
.invoice-summary .section-heading { margin: 0; padding: 4pt 5pt; border: 0; background: var(--invoice-primary); color: #fff; font-size: 8pt; line-height: 1.15; text-transform: none; letter-spacing: 0; }.invoice-summary dl { display: block; }.invoice-summary dl div { display: grid; grid-template-columns: 27mm minmax(0, 1fr); gap: 3pt; min-height: 15pt; padding: 3pt 5pt; border-bottom: .45pt solid var(--invoice-border); }.invoice-summary dl div:last-child { border-bottom: 0; }.invoice-summary dt { color: #111827; font-weight: 700; }.invoice-summary dd { margin: 0; color: #111827; font-weight: 400; overflow-wrap: anywhere; }
.party-summary { grid-template-columns: 1fr 1fr; }
.fiscal-key { display: grid; grid-template-columns: 35mm minmax(0, 1fr); gap: 4pt; margin: 0 0 7pt; padding: 4pt 5pt; border: .6pt solid var(--invoice-border); color: #111827; background: #fff; break-inside: avoid; }.fiscal-key span { font-size: 7.5pt; font-weight: 700; text-transform: none; letter-spacing: 0; }.fiscal-key strong { margin: 0; font-size: 7.5pt; font-weight: 400; overflow-wrap: anywhere; }
.invoice-lines { margin-top: 2pt; }.invoice-lines .section-heading { display: none; }.invoice-lines table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.2pt; }.invoice-lines th { padding: 4pt 3pt; border-right: .5pt solid rgba(255,255,255,.55); background: var(--invoice-primary); color: #fff; text-align: left; line-height: 1.1; }.invoice-lines th:last-child { border-right: 0; }.invoice-lines td { padding: 4pt 3pt; border: .5pt solid var(--invoice-border); vertical-align: top; line-height: 1.2; }.invoice-lines tr { break-inside: avoid; }.invoice-lines .number { text-align: right; font-variant-numeric: tabular-nums; }.invoice-lines .code { width: 27mm; overflow-wrap: anywhere; }.invoice-lines th:nth-child(3) { width: 17mm; }.invoice-lines th:nth-child(4) { width: 25mm; }.invoice-lines th:nth-child(5) { width: 24mm; }.invoice-lines th:nth-child(6) { width: 25mm; }.invoice-lines small { display: block; margin-top: 1pt; color: var(--invoice-muted); font-size: 6.5pt; }
.invoice-totals { display: flex; justify-content: flex-end; margin: 7pt 0 10pt; break-inside: avoid; }.invoice-totals dl { width: 88mm; }.invoice-totals dl div { display: flex; justify-content: space-between; gap: 12pt; padding: 2.5pt 4pt; border-bottom: 0; }.invoice-totals dt,.invoice-totals dd { font-weight: 700; }.invoice-totals dd { margin: 0; font-variant-numeric: tabular-nums; }.invoice-totals .grand-total { margin-top: 1pt; border: 0; background: var(--invoice-primary); color: #fff; font-size: 8.5pt; font-weight: 700; }
.doc-footer { margin-top: 12pt; padding-top: 5pt; border-top: .6pt solid var(--invoice-border); color: #334155; font-size: 7pt; line-height: 1.25; }.fiscal-footer { margin-top: 4pt; text-align: center; color: var(--invoice-muted); font-size: 6.8pt; line-height: 1.3; }.fiscal-footer p { margin: 1pt 0; }.representation-legend { min-height: 4pt; margin-top: 2pt; }
@media screen { body { padding: 14mm 14mm 16mm; } }`;
}

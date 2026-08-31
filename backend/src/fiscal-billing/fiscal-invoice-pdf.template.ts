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
import { parseFiscalDecimal, quantizeFiscalDecimal } from "./fiscal-decimal";

const DOCUMENT_TYPES: Readonly<Record<string, string>> = { "01": "Factura electrónica", "04": "Tiquete electrónico" };
const IDENTIFICATION_TYPES: Readonly<Record<string, string>> = { "01": "Cédula física", "02": "Cédula jurídica", "03": "DIMEX", "04": "NITE" };
const DEFAULT_PRIMARY_COLOR = "#21466f";
const DEFAULT_SECONDARY_COLOR = "#102344";

export interface FiscalInvoicePdfBranding {
  commercialName: string | null;
  logoSrc: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
}

export function fiscalInvoicePdfTemplate(invoice: AcceptedBillingInvoice, branding: FiscalInvoicePdfBranding): string {
  const documentType = DOCUMENT_TYPES[invoice.documentTypeCode] ?? "Documento fiscal";
  const company = {
    name: nonEmpty(branding.commercialName) ?? invoice.issuer.legalName,
    contactEmail: nonEmpty(branding.contactEmail),
    contactPhone: nonEmpty(branding.contactPhone),
    logoSrc: nonEmpty(branding.logoSrc),
  };
  const content = [
    documentHeader(company, { documentNumber: invoice.fiscalNumber, documentNumberLabel: documentType, issuedAt: formatDate(invoice.issuedDate) }),
    documentTitle(documentType),
    fiscalIdentity(invoice),
    transactionSummary(invoice),
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

function fiscalIdentity(invoice: AcceptedBillingInvoice): string {
  return `<section class="fiscal-identity">
  <div class="fiscal-key"><span>Clave de Hacienda</span><strong>${escapeHtml(invoice.haciendaKey)}</strong></div>
  <div class="issuer-identity">
    <div><span>Emisor legal</span><strong>${escapeHtml(invoice.issuer.legalName)}</strong></div>
    <div><span>Identificación fiscal</span><strong>${escapeHtml(`${invoice.issuer.identificationType} · ${invoice.issuer.identificationNumber}`)}</strong></div>
    ${invoice.issuer.address ? `<div class="issuer-address"><span>Dirección</span><strong>${escapeHtml(address(invoice.issuer.address))}</strong></div>` : ""}
  </div>
</section>`;
}

function transactionSummary(invoice: AcceptedBillingInvoice): string {
  const identification = invoice.receiver.identificationType && invoice.receiver.identificationNumber
    ? `${IDENTIFICATION_TYPES[invoice.receiver.identificationType] ?? invoice.receiver.identificationType} · ${invoice.receiver.identificationNumber}` : "No registrada";
  return `<section class="invoice-summary">
  <article>${sectionHeading("Receptor")}<dl>
    ${row("Nombre", invoice.receiver.name ?? "No registrado")}${row("Identificación", identification)}${invoice.receiver.email ? row("Correo", invoice.receiver.email) : ""}
  </dl></article>
  <article>${sectionHeading("Transacción")}<dl>
    ${row("Condición", paymentCondition(invoice))}${row("Moneda", invoice.currencyCode)}
    ${invoice.salesOrder ? row("Orden de venta", invoice.salesOrder.number ?? invoice.salesOrder.id) : ""}
    ${invoice.paymentCondition.dueDate ? row("Vencimiento", formatDate(invoice.paymentCondition.dueDate)) : ""}
    ${invoice.paymentMethods.length ? row("Medio de pago", paymentMethods(invoice)) : ""}
  </dl></article>
</section>`;
}

function invoiceLines(invoice: AcceptedBillingInvoice): string {
  return `<section class="invoice-lines">${sectionHeading("Detalle")}<table>
  <thead><tr><th class="code">Código</th><th>Descripción</th><th class="number">Cantidad</th><th class="number">Precio unitario</th><th class="number">Impuesto</th><th class="number">Total</th></tr></thead>
  <tbody>${invoice.lines.map((line) => `<tr>
    <td class="code">${lineCode(line)}</td>
    <td><strong>${escapeHtml(line.description)}</strong><small>Unidad ${escapeHtml(line.unitOfMeasureCode)} · Base ${money(line.taxableBase, invoice.currencyCode)}</small></td>
    <td class="number">${escapeHtml(line.quantity)}</td><td class="number">${money(line.unitPrice, invoice.currencyCode)}</td>
    <td class="number">${taxes(line, invoice.currencyCode)}</td><td class="number"><strong>${money(line.lineTotal, invoice.currencyCode)}</strong></td>
  </tr>`).join("")}</tbody></table></section>`;
}

function invoiceTotals(invoice: AcceptedBillingInvoice): string {
  return `<section class="invoice-totals"><dl>${totalRow("Subtotal", invoice.totals.subtotal, invoice.currencyCode)}${totalRow("Impuestos", invoice.totals.totalTax, invoice.currencyCode)}<div class="grand-total"><dt>Total</dt><dd>${money(invoice.totals.total, invoice.currencyCode)}</dd></div></dl></section>`;
}

function fiscalFooter(invoice: AcceptedBillingInvoice): string {
  const contact = [invoice.issuer.email, invoice.issuer.phone].filter((value): value is string => Boolean(value?.trim())).join(" · ");
  return `<section class="fiscal-footer"><p><strong>${escapeHtml(invoice.issuer.legalName)}</strong> · ${escapeHtml(invoice.issuer.identificationType)} ${escapeHtml(invoice.issuer.identificationNumber)}${contact ? ` · ${escapeHtml(contact)}` : ""}</p><p>Documento electrónico Costa Rica · Versión 4.4</p><div class="representation-legend" aria-label="Espacio para leyenda de representación fiscal"></div></section>`;
}

function row(label: string, value: string): string { return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`; }
function totalRow(label: string, value: string, currency: string): string { return `<div><dt>${escapeHtml(label)}</dt><dd>${money(value, currency)}</dd></div>`; }
function paymentCondition(invoice: AcceptedBillingInvoice): string {
  if (invoice.paymentCondition.code === "01") return "Contado";
  if (invoice.paymentCondition.code === "02") return invoice.paymentCondition.creditTermDays ? `Crédito · ${invoice.paymentCondition.creditTermDays} días` : "Crédito";
  return "No disponible";
}
function paymentMethods(invoice: AcceptedBillingInvoice): string { return invoice.paymentMethods.map((method) => method.description ? `${method.code} · ${method.description}` : method.code).join(", "); }
function lineCode(line: AcceptedBillingInvoice["lines"][number]): string {
  const values = [line.cabysCode ? `CABYS ${line.cabysCode}` : null, line.itemCode ? `Ref. ${line.itemCode}` : null].filter((value): value is string => value !== null);
  return values.length ? values.map((value, index) => index === 0 ? escapeHtml(value) : `<small>${escapeHtml(value)}</small>`).join("") : "—";
}
function taxes(line: AcceptedBillingInvoice["lines"][number], currency: string): string {
  if (line.taxes.length === 0) return "Sin impuesto";
  return line.taxes.map((tax) => `${decimal(tax.ratePercentage)}%<small>${money(tax.netTaxAmount, currency)}</small>`).join("<br />");
}
function address(value: NonNullable<AcceptedBillingInvoice["issuer"]["address"]>): string {
  const location = [value.provinceCode, value.cantonCode, value.districtCode, value.neighborhoodCode].filter(Boolean).join("-");
  return `${value.otherAddressDetails} · ${location}`;
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
  return `:root { --invoice-primary: ${primary}; --invoice-secondary: ${secondary}; --invoice-border: #d8e0e9; --invoice-muted: #64748b; }
.doc-header { flex-direction: row; align-items: center; justify-content: space-between; text-align: left; border-bottom-color: var(--invoice-primary); }
.doc-header-logo { width: 96pt; max-height: 50pt; object-fit: contain; }.doc-header-logo[src=""] { display: none; }
.doc-header-text { text-align: right; }.doc-header-text h1 { color: var(--invoice-secondary); font-size: 16pt; text-transform: none; }.doc-header-text .doc-meta { text-align: right; }
.doc-title { color: var(--invoice-primary); font-size: 14pt; }
.fiscal-identity { border: 1pt solid var(--invoice-primary); border-radius: 6pt; margin-bottom: 12pt; overflow: hidden; break-inside: avoid; }
.fiscal-key { padding: 7pt 9pt; color: #fff; background: var(--invoice-primary); }.fiscal-key span,.issuer-identity span { display: block; font-size: 7pt; text-transform: uppercase; letter-spacing: .06em; }.fiscal-key strong { display: block; margin-top: 2pt; font-size: 9pt; overflow-wrap: anywhere; }
.issuer-identity { display: grid; grid-template-columns: 1fr 1fr; gap: 7pt 12pt; padding: 8pt 9pt; }.issuer-identity strong { display: block; margin-top: 2pt; color: var(--invoice-secondary); font-size: 9pt; }.issuer-address { grid-column: 1 / -1; }
.invoice-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; margin-bottom: 12pt; }.invoice-summary article { break-inside: avoid; border: .75pt solid var(--invoice-border); border-radius: 5pt; padding: 7pt 9pt; }.invoice-summary .section-heading { margin-top: 0; color: var(--invoice-primary); border-bottom-color: var(--invoice-primary); }.invoice-summary dl { display: grid; gap: 3pt; }.invoice-summary dl div { display: grid; grid-template-columns: 29mm 1fr; gap: 5pt; }.invoice-summary dt { color: var(--invoice-muted); }.invoice-summary dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.invoice-lines table { width: 100%; border-collapse: collapse; font-size: 7.8pt; }.invoice-lines th { padding: 5pt 4pt; background: var(--invoice-primary); color: #fff; text-align: left; }.invoice-lines td { padding: 6pt 4pt; border-bottom: .6pt solid #dfe5ed; vertical-align: top; }.invoice-lines tr { break-inside: avoid; }.invoice-lines .number { text-align: right; font-variant-numeric: tabular-nums; }.invoice-lines .code { width: 24mm; overflow-wrap: anywhere; }.invoice-lines small { display: block; margin-top: 2pt; color: var(--invoice-muted); font-size: 6.8pt; }
.invoice-totals { display: flex; justify-content: flex-end; margin: 12pt 0; break-inside: avoid; }.invoice-totals dl { width: 72mm; }.invoice-totals dl div { display: flex; justify-content: space-between; gap: 12pt; padding: 4pt 0; border-bottom: .6pt solid #dfe5ed; }.invoice-totals dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }.invoice-totals .grand-total { margin-top: 3pt; border-top: 1.5pt solid var(--invoice-primary); border-bottom: 0; color: var(--invoice-secondary); font-size: 12pt; font-weight: 800; }
.doc-footer { margin-top: auto; border-top-color: var(--invoice-primary); }.fiscal-footer { text-align: center; color: var(--invoice-muted); font-size: 7.5pt; line-height: 1.4; }.representation-legend { min-height: 10pt; margin-top: 4pt; }`;
}

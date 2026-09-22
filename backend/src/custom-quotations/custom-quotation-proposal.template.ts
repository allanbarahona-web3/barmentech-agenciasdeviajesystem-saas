import { Decimal } from "@prisma/client/runtime/library";
import {
  documentFooter,
  documentHeader,
  documentLayout,
  documentTitle,
  escapeHtml,
  formatDate,
  sectionHeading,
} from "../documents/templates/shared";
import type { CustomQuotationProposalDocument } from "./custom-quotation-proposal.types";

export function customQuotationProposalTemplate(proposal: CustomQuotationProposalDocument): string {
  const header = documentHeader(proposal.company, {
    documentNumber: proposal.quotationNumber,
    documentNumberLabel: "Cotización",
    issuedAt: tenantDate(proposal.issuedAt, proposal.timezone),
    additionalItems: [
      { label: "Versión", value: String(proposal.versionNumber) },
      { label: "Válida hasta", value: proposal.quotationValidUntil ? tenantDate(proposal.quotationValidUntil, proposal.timezone) : "No indicada" },
    ],
  });
  const content = `${header}
${documentTitle("PROPUESTA COMERCIAL")}
<section class="proposal-summary">
  <div><span>Cliente</span><strong>${escapeHtml(proposal.customer.fullName)}</strong></div>
  ${proposal.customer.identification ? `<div><span>Identificación</span><strong>${escapeHtml(proposal.customer.identification)}</strong></div>` : ""}
  ${proposal.customer.email ? `<div><span>Correo</span><strong>${escapeHtml(proposal.customer.email)}</strong></div>` : ""}
  ${proposal.customer.phone ? `<div><span>Teléfono</span><strong>${escapeHtml(proposal.customer.phone)}</strong></div>` : ""}
</section>
${proposal.title ? `<section><h2 class="proposal-subject">${escapeHtml(proposal.title)}</h2></section>` : ""}
<section>
  ${sectionHeading("Servicios incluidos")}
  <ol class="proposal-lines">${proposal.lines.map((line) => `<li><div><strong>${escapeHtml(line.description)}</strong>${line.commercialNote ? `<p>${escapeHtml(line.commercialNote)}</p>` : ""}</div><span>${quantityLabel(line.quantity)}</span></li>`).join("")}</ol>
</section>
<section class="proposal-terms">
  ${sectionHeading("Condiciones comerciales")}
  <dl>
    <div><dt>Condición de pago</dt><dd>${escapeHtml(paymentCondition(proposal.paymentConditionType))}</dd></div>
    ${proposal.paymentConditionType === "CREDIT" ? `<div><dt>Plazo</dt><dd>${escapeHtml(paymentTerm(proposal.paymentTermValue, proposal.paymentTermUnit))}</dd></div>` : ""}
    <div><dt>Moneda</dt><dd>${escapeHtml(proposal.currency)}</dd></div>
  </dl>
  ${proposal.commercialObservations ? `<p class="proposal-observations"><strong>Observaciones:</strong> ${escapeHtml(proposal.commercialObservations)}</p>` : ""}
</section>
<section class="proposal-total"><span>PRECIO FINAL</span><strong>${escapeHtml(formatMoney(proposal.currency, proposal.finalSellingPrice))}</strong></section>
${documentFooter(proposal.company)}`;

  return documentLayout(content, {
    title: `Cotización ${proposal.quotationNumber} - ${proposal.company.name}`,
    additionalStyles: styles(proposal.company.primaryColor),
  });
}

function tenantDate(value: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
    const year = part("year"), month = part("month"), day = part("day");
    return year && month && day ? formatDate(`${year}-${month}-${day}`) : "";
  } catch {
    return "";
  }
}

function formatMoney(currency: string, value: string) {
  const fixed = new Decimal(value).toFixed(2);
  const [whole, fraction] = fixed.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const grouped = (sign ? whole.slice(1) : whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${currency} ${sign}${grouped},${fraction}`;
}

function quantityLabel(value: string) {
  const normalized = new Decimal(value).toFixed(4).replace(/(?:\.0+|(?<=\..*?)0+)$/, "");
  return `Cantidad: ${normalized}`;
}

function paymentCondition(value: string | null) {
  if (value === "CASH") return "Contado";
  if (value === "CREDIT") return "Crédito";
  return "No indicada";
}

function paymentTerm(value: number | null, unit: string | null) {
  if (value === null || unit === null) return "No indicado";
  if (unit === "MONTHS") return `${value} ${value === 1 ? "mes" : "meses"}`;
  return `${value} ${value === 1 ? "día" : "días"}`;
}

function styles(primaryColor: string | null) {
  const brand = /^#[0-9a-f]{6}$/i.test(primaryColor || "") ? primaryColor : "#245a9b";
  return `
:root { --proposal-brand: ${brand}; }
@page { size: A4 portrait; margin: 16mm; }
body { color: #243247; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.45; }
.proposal-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5pt 14pt; padding: 8pt 10pt; background: #f4f7fb; border-left: 3pt solid var(--proposal-brand); }
.proposal-summary div { display: grid; gap: 1pt; }.proposal-summary span, dt { color: #65758a; font-size: 8pt; }.proposal-summary strong, dd { overflow-wrap: anywhere; }
.proposal-subject { margin: 13pt 0 5pt; color: #172a45; font-size: 14pt; }.proposal-lines { margin: 0; padding: 0; list-style: none; border-top: 1pt solid #d9e1eb; }
.proposal-lines li { display: flex; justify-content: space-between; gap: 12pt; padding: 8pt 3pt; border-bottom: 1pt solid #d9e1eb; }.proposal-lines p { margin: 2pt 0 0; color: #607086; }.proposal-lines span { white-space: nowrap; color: #52647b; font-size: 9pt; }
.proposal-terms { margin-top: 12pt; }.proposal-terms dl { display: flex; flex-wrap: wrap; gap: 7pt 24pt; margin: 0; }.proposal-terms dl div { min-width: 35mm; }.proposal-terms dd { margin: 1pt 0 0; font-weight: 700; }.proposal-observations { margin: 9pt 0 0; padding-top: 7pt; border-top: 1pt solid #d9e1eb; }
.proposal-total { display: flex; justify-content: space-between; align-items: center; margin: 16pt 0 12pt; padding: 10pt 12pt; background: #f4f7fb; border-top: 2pt solid var(--proposal-brand); }.proposal-total span { color: var(--proposal-brand); font-size: 10pt; font-weight: 800; letter-spacing: .05em; }.proposal-total strong { color: var(--proposal-brand); font-size: 17pt; }
`;
}

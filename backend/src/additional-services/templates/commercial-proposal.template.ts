import type {
  CommercialProposalPdfDto,
  CommercialProposalPdfParticipantDto,
  CommercialProposalPdfServiceDto,
} from "../dto";
import {
  documentLayout,
  escapeAttribute,
  escapeHtml,
  formatDate,
} from "../../documents/templates/shared";

export const commercialProposalTemplate = (
  proposal: CommercialProposalPdfDto,
): string => {
  const content = [
    quotationHeader(proposal),
    customerTravelSummary(proposal),
    servicesSection(proposal),
    quotationClosing(proposal),
    quotationFooter(proposal),
  ].join("\n");

  return documentLayout(content, {
    title: `Cotización ${proposal.proposalNumber} - ${proposal.company.name}`,
    additionalStyles: commercialProposalStyles(proposal.company.primaryColor),
  });
};

function quotationHeader(proposal: CommercialProposalPdfDto): string {
  const company = proposal.company;
  const companyDetails = [
    company.legalId ? `Cédula jurídica: ${escapeHtml(company.legalId)}` : "",
    company.contactEmail ? escapeHtml(company.contactEmail) : "",
    company.contactPhone ? escapeHtml(company.contactPhone) : "",
  ].filter(Boolean);
  const logo = company.logoSrc
    ? `<img class="quote-logo" src="${escapeAttribute(company.logoSrc)}" alt="${escapeAttribute(company.name)}" />`
    : `<div class="quote-logo-fallback" aria-hidden="true">${escapeHtml(company.name.slice(0, 1))}</div>`;

  return `
<header class="quote-header">
  <div class="quote-brand">
    ${logo}
    <div>
      <h1>${escapeHtml(company.name)}</h1>
      ${companyDetails.length ? `<p>${companyDetails.join("<br />")}</p>` : ""}
    </div>
  </div>
  <div class="quote-identity">
    <p class="quote-title">COTIZACIÓN</p>
    <p class="quote-number">${escapeHtml(proposal.proposalNumber)}</p>
    <dl>
      <div><dt>Emisión</dt><dd>${displayDate(proposal.issuedAt)}</dd></div>
      <div><dt>Válida hasta</dt><dd>${displayOptionalDate(proposal.validUntil)}</dd></div>
    </dl>
  </div>
</header>`;
}

function customerTravelSummary(proposal: CommercialProposalPdfDto): string {
  const customer = proposal.customer;
  const customerRows = [
    summaryRow("Nombre", customer.fullName),
    summaryRow("Identificación", customer.identification),
    summaryRow("Email", customer.email || "No indicado"),
    summaryRow("Teléfono", customer.phone || "No indicado"),
  ].join("");
  const travel = proposal.travel;
  const travelContent = travel
    ? [
        summaryRow("Viaje", travel.name),
        summaryRow("Destino", travel.destination),
        summaryRow(
          "Fechas",
          `${displayDate(travel.departureDate)} – ${displayDate(travel.returnDate)}`,
        ),
        summaryRow("Referencia", travel.reference),
      ].join("")
    : `<p class="summary-empty">Sin viaje asociado</p>`;

  return `
<section class="summary-grid">
  <article class="summary-card">
    <h2>CLIENTE</h2>
    <dl>${customerRows}</dl>
  </article>
  <article class="summary-card">
    <h2>VIAJE</h2>
    ${travel ? `<dl>${travelContent}</dl>` : travelContent}
  </article>
</section>`;
}

function summaryRow(label: string, value: string): string {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function servicesSection(proposal: CommercialProposalPdfDto): string {
  return `
<section class="services-section">
  <div class="section-title-row">
    <h2>SERVICIOS COTIZADOS</h2>
    <span>${proposal.services.length} ${proposal.services.length === 1 ? "servicio" : "servicios"}</span>
  </div>
  <div class="proposal-services">
    ${proposal.services.map((service, index) => serviceCard(service, index, proposal.currency)).join("\n")}
  </div>
</section>`;
}

function serviceCard(
  service: CommercialProposalPdfServiceDto,
  index: number,
  currency: string,
): string {
  const details = service.details.length
    ? `<dl class="service-details">${service.details
        .map(
          (detail) =>
            `<div><dt>${escapeHtml(detail.label)}</dt><dd>${escapeHtml(detail.value)}</dd></div>`,
        )
        .join("")}</dl>`
    : "";
  const participants = service.participants.length
    ? `<p class="service-context"><strong>Participantes</strong> ${service.participants.map(participantLabel).join(" · ")}</p>`
    : "";
  const notes = service.notes
    ? `<p class="service-context"><strong>Nota</strong> ${escapeHtml(service.notes)}</p>`
    : "";

  return `
<article class="proposal-service">
  <div class="service-main">
    <div class="service-heading"><span>${index + 1}</span><h3>${escapeHtml(service.name)}</h3></div>
    ${details}
    ${participants}
    ${notes}
  </div>
  <div class="service-pricing" aria-label="Precio del servicio">
    <div><span>Subtotal</span><strong>${money(service.subtotal, currency)}</strong></div>
    <div><span>IVA ${percentage(service.vatPercentage)}</span><strong>${money(service.vatAmount, currency)}</strong></div>
    <div class="service-total"><span>Total</span><strong>${money(service.total, currency)}</strong></div>
  </div>
</article>`;
}

function participantLabel(
  participant: CommercialProposalPdfParticipantDto,
): string {
  return `${escapeHtml(participant.fullName)} (${escapeHtml(participant.identification)})`;
}

function quotationClosing(proposal: CommercialProposalPdfDto): string {
  return `
<section class="quote-closing">
  ${commercialConditions(proposal)}
  ${totalsSection(proposal)}
</section>`;
}

function commercialConditions(proposal: CommercialProposalPdfDto): string {
  const terms = proposal.paymentTerms;
  const items = [
    conditionItem("Condición de pago", paymentCondition(terms.condition)),
    terms.condition === "CREDIT"
      ? conditionItem("Plazo", paymentTerm(terms.termValue, terms.termUnit))
      : "",
    conditionItem("Vigencia", displayOptionalDate(proposal.validUntil)),
  ].filter(Boolean);
  const observations = proposal.observations
    ? `<p class="conditions-note"><strong>Observaciones:</strong> ${escapeHtml(proposal.observations)}</p>`
    : "";

  return `
<article class="conditions-card">
  <h2>CONDICIONES COMERCIALES</h2>
  <dl>${items.join("")}</dl>
  ${observations}
</article>`;
}

function conditionItem(label: string, value: string): string {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function totalsSection(proposal: CommercialProposalPdfDto): string {
  return `
<article class="totals-card">
  <div><span>Subtotal</span><strong>${money(proposal.subtotal, proposal.currency)}</strong></div>
  <div><span>IVA</span><strong>${money(proposal.vatTotal, proposal.currency)}</strong></div>
  <div class="grand-total"><span>TOTAL</span><strong>${money(proposal.total, proposal.currency)}</strong></div>
</article>`;
}

function quotationFooter(proposal: CommercialProposalPdfDto): string {
  const company = proposal.company;
  const details = [
    company.businessAddress,
    company.contactEmail,
    company.contactPhone,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(escapeHtml)
    .join(" <span>•</span> ");
  return `
<footer class="quote-footer">
  <strong>${escapeHtml(company.name)}</strong>
  ${details ? `<p>${details}</p>` : ""}
</footer>`;
}

function displayDate(value: string): string {
  return formatDate(value.slice(0, 10));
}

function displayOptionalDate(value: string | null): string {
  return value ? displayDate(value) : "No indicada";
}

function paymentCondition(value: string | null): string {
  if (value === "CASH") return "Contado";
  if (value === "CREDIT") return "Crédito";
  return "No indicada";
}

function paymentTerm(value: number | null, unit: string | null): string {
  if (value === null || unit === null) return "No indicado";
  if (unit === "MONTHS") return `${value} ${value === 1 ? "mes" : "meses"}`;
  return `${value} ${value === 1 ? "día" : "días"}`;
}

function percentage(value: string): string {
  const amount = Number(value);
  return `${Number.isFinite(amount) ? amount.toLocaleString("es-CR", { maximumFractionDigits: 2 }) : escapeHtml(value)}%`;
}

function money(value: string, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return escapeHtml(`${currency} ${value}`);
  const formatted = new Intl.NumberFormat("es-CR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${escapeHtml(currency)}&nbsp;${escapeHtml(formatted)}`;
}

function commercialProposalStyles(primaryColor: string | null): string {
  const brandColor = /^#[0-9a-f]{6}$/i.test(primaryColor || "")
    ? primaryColor!
    : "#245a9b";
  return `
:root { --quote-brand: ${brandColor}; }
@page { size: A4 portrait; margin: 13mm 14mm 12mm; }
html, body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 9pt;
  line-height: 1.35;
  color: #243247;
}
body { min-height: 272mm; display: flex; flex-direction: column; }
@media screen {
  body { padding: 13mm 14mm 12mm; }
}
.quote-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18pt;
  padding-bottom: 10pt;
  border-bottom: 2pt solid var(--quote-brand);
}
.quote-brand { display: flex; align-items: center; gap: 10pt; min-width: 0; }
.quote-logo { width: 56pt; max-height: 42pt; object-fit: contain; }
.quote-logo-fallback {
  display: grid; place-items: center; width: 38pt; height: 38pt; border-radius: 8pt;
  background: var(--quote-brand); color: #fff; font-size: 18pt; font-weight: 700;
}
.quote-brand h1 { margin: 0 0 2pt; font-size: 13pt; color: #172a45; }
.quote-brand p { margin: 0; color: #607086; font-size: 8pt; line-height: 1.4; }
.quote-identity { min-width: 57mm; text-align: right; }
.quote-title { margin: 0; color: var(--quote-brand); font-size: 21pt; font-weight: 800; letter-spacing: .06em; }
.quote-number { margin: 1pt 0 5pt; color: #172a45; font-size: 10pt; font-weight: 700; }
.quote-identity dl { display: inline-grid; gap: 1pt; margin: 0; }
.quote-identity dl div { display: grid; grid-template-columns: 23mm auto; gap: 5pt; }
.quote-identity dt { color: #738196; }
.quote-identity dd { margin: 0; font-weight: 700; }
.summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; margin-top: 9pt; }
.summary-card { padding: 7pt 9pt; background: #f4f7fb; border-radius: 5pt; break-inside: avoid; }
.summary-card h2, .conditions-card h2, .section-title-row h2 {
  margin: 0 0 5pt; color: var(--quote-brand); font-size: 8pt; font-weight: 800; letter-spacing: .08em;
}
.summary-card dl { display: grid; gap: 2pt; margin: 0; }
.summary-card dl div { display: grid; grid-template-columns: 24mm 1fr; gap: 5pt; min-width: 0; }
.summary-card dt { color: #718096; }
.summary-card dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.summary-empty { color: #718096; font-style: italic; }
.services-section { margin-top: 10pt; }
.section-title-row { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1pt solid #d9e1eb; }
.section-title-row h2 { margin-bottom: 4pt; }
.section-title-row span { color: #78869a; font-size: 7.5pt; }
.proposal-services { display: grid; gap: 6pt; margin-top: 6pt; }
.proposal-service {
  display: grid; grid-template-columns: minmax(0, 1fr) 49mm; gap: 10pt;
  padding: 7pt 8pt; border: .7pt solid #d9e1eb; border-left: 3pt solid var(--quote-brand);
  border-radius: 4pt; break-inside: avoid; page-break-inside: avoid;
}
.service-heading { display: flex; align-items: center; gap: 5pt; margin-bottom: 4pt; }
.service-heading span { display: grid; place-items: center; width: 15pt; height: 15pt; border-radius: 50%; background: #e8f0fa; color: var(--quote-brand); font-size: 7pt; font-weight: 800; }
.service-heading h3 { margin: 0; color: #172a45; font-size: 10pt; }
.service-details { display: flex; flex-wrap: wrap; gap: 2pt 12pt; margin: 0; }
.service-details div { display: flex; gap: 3pt; min-width: 30%; }
.service-details dt { color: #718096; }
.service-details dt::after { content: ":"; }
.service-details dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.service-context { margin: 3pt 0 0; color: #56657a; font-size: 8pt; }
.service-context strong { color: #34445b; margin-right: 3pt; }
.service-pricing { align-self: stretch; padding-left: 8pt; border-left: .7pt solid #e0e6ee; }
.service-pricing div { display: flex; justify-content: space-between; gap: 6pt; padding: 1.5pt 0; color: #6b788b; font-size: 8pt; }
.service-pricing strong { color: #33445c; white-space: nowrap; }
.service-pricing .service-total { margin-top: 2pt; padding-top: 4pt; border-top: 1pt solid #b9c6d6; color: #172a45; font-size: 9.5pt; font-weight: 800; }
.service-pricing .service-total strong { color: var(--quote-brand); }
.quote-closing { display: grid; grid-template-columns: minmax(0, 1fr) 64mm; gap: 14pt; align-items: start; margin-top: 9pt; break-inside: avoid; page-break-inside: avoid; }
.conditions-card { padding-top: 2pt; }
.conditions-card dl { display: flex; flex-wrap: wrap; gap: 4pt 14pt; margin: 0; }
.conditions-card dl div { min-width: 25mm; }
.conditions-card dt { color: #718096; font-size: 7.5pt; }
.conditions-card dd { margin: 1pt 0 0; font-weight: 700; }
.conditions-note { margin: 5pt 0 0; padding-top: 4pt; border-top: .7pt solid #e2e8f0; font-size: 8pt; }
.totals-card { padding: 6pt 8pt; background: #f4f7fb; border-radius: 5pt; break-inside: avoid; }
.totals-card div { display: flex; justify-content: space-between; gap: 8pt; padding: 2pt 0; }
.totals-card span { color: #66758a; }
.totals-card strong { color: #26384f; white-space: nowrap; }
.totals-card .grand-total { margin-top: 3pt; padding-top: 5pt; border-top: 1.2pt solid var(--quote-brand); font-size: 12pt; font-weight: 800; }
.totals-card .grand-total span, .totals-card .grand-total strong { color: var(--quote-brand); }
.quote-footer { margin-top: auto; padding-top: 6pt; border-top: .7pt solid #d9e1eb; color: #718096; text-align: center; font-size: 7.5pt; break-inside: avoid; }
.quote-footer strong { color: #44546a; }
.quote-footer p { margin: 2pt 0 0; }
.quote-footer span { padding: 0 3pt; color: #9aa6b5; }
`;
}

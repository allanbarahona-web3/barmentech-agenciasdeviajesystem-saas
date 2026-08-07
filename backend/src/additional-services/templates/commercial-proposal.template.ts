import type {
  CommercialProposalPdfDto,
  CommercialProposalPdfParticipantDto,
  CommercialProposalPdfServiceDto,
} from "../dto";
import {
  documentFooter,
  documentHeader,
  documentLayout,
  documentMetadataTable,
  documentTitle,
  escapeHtml,
  formatDate,
  sectionHeading,
} from "../../documents/templates/shared";

export const commercialProposalTemplate = (
  proposal: CommercialProposalPdfDto,
): string => {
  const company = {
    name: proposal.company.name,
    legalId: proposal.company.legalId,
    contactEmail: proposal.company.contactEmail,
    contactPhone: proposal.company.contactPhone,
    logoSrc: proposal.company.logoSrc,
  };

  const content = [
    documentHeader(company, {
      documentNumber: proposal.proposalNumber,
      documentNumberLabel: "Propuesta N.°",
      issuedAt: displayDate(proposal.issuedAt),
    }),
    documentTitle("Propuesta comercial de servicios adicionales"),
    proposalInformation(proposal),
    customerSection(proposal),
    proposal.travel ? travelSection(proposal) : "",
    servicesSection(proposal),
    totalsSection(proposal),
    commercialConditionsSection(proposal),
    documentFooter(company),
  ].join("\n");

  return documentLayout(content, {
    title: `Propuesta ${proposal.proposalNumber} - ${proposal.company.name}`,
    additionalStyles: commercialProposalStyles,
  });
};

function proposalInformation(proposal: CommercialProposalPdfDto): string {
  return `
<section class="proposal-section">
  ${sectionHeading("Información de la propuesta")}
  ${documentMetadataTable({
    "Número de propuesta": proposal.proposalNumber,
    "Fecha de propuesta": displayDate(proposal.issuedAt),
    "Válida hasta": displayOptionalDate(proposal.validUntil),
    Moneda: proposal.currency,
  })}
</section>`;
}

function customerSection(proposal: CommercialProposalPdfDto): string {
  const customer = proposal.customer;
  return `
<section class="proposal-section">
  ${sectionHeading("Cliente")}
  ${documentMetadataTable({
    Nombre: customer.fullName,
    Identificación: customer.identification,
    Email: customer.email || "No indicado",
    Teléfono: customer.phone || "No indicado",
  })}
</section>`;
}

function travelSection(proposal: CommercialProposalPdfDto): string {
  const travel = proposal.travel!;
  return `
<section class="proposal-section">
  ${sectionHeading("Viaje")}
  ${documentMetadataTable({
    Viaje: travel.name,
    Destino: travel.destination,
    Salida: displayDate(travel.departureDate),
    Regreso: displayDate(travel.returnDate),
    Referencia: travel.reference,
  })}
</section>`;
}

function servicesSection(proposal: CommercialProposalPdfDto): string {
  const services = proposal.services
    .map((service, index) =>
      serviceCard(service, index, proposal.currency),
    )
    .join("\n");
  return `
<section class="proposal-section services-section">
  ${sectionHeading("Servicios")}
  <div class="proposal-services">${services}</div>
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
    ? `<div class="service-participants"><strong>Participantes:</strong> ${service.participants
        .map(participantLabel)
        .join(", ")}</div>`
    : "";
  const notes = service.notes
    ? `<p class="service-notes"><strong>Notas comerciales:</strong> ${escapeHtml(service.notes)}</p>`
    : "";

  return `
<article class="proposal-service">
  <h4>${index + 1}. ${escapeHtml(service.name)}</h4>
  ${details}
  ${participants}
  ${notes}
  <table class="service-pricing">
    <thead><tr><th>Subtotal</th><th>IVA</th><th>Total</th></tr></thead>
    <tbody><tr>
      <td>${money(service.subtotal, currency)}</td>
      <td>${money(service.vatAmount, currency)} (${escapeHtml(service.vatPercentage)}%)</td>
      <td><strong>${money(service.total, currency)}</strong></td>
    </tr></tbody>
  </table>
</article>`;
}

function participantLabel(participant: CommercialProposalPdfParticipantDto): string {
  return `${escapeHtml(participant.fullName)} (${escapeHtml(participant.identification)})`;
}

function totalsSection(proposal: CommercialProposalPdfDto): string {
  return `
<section class="proposal-section totals-section">
  ${sectionHeading("Totales")}
  <table class="proposal-totals">
    <tbody>
      <tr><th>Subtotal</th><td>${money(proposal.subtotal, proposal.currency)}</td></tr>
      <tr><th>IVA</th><td>${money(proposal.vatTotal, proposal.currency)}</td></tr>
      <tr class="grand-total"><th>Total</th><td>${money(proposal.total, proposal.currency)}</td></tr>
    </tbody>
  </table>
</section>`;
}

function commercialConditionsSection(
  proposal: CommercialProposalPdfDto,
): string {
  const terms = proposal.paymentTerms;
  const rows: Record<string, string> = {
    "Condición de pago": paymentCondition(terms.condition),
  };
  if (terms.condition === "CREDIT") {
    rows["Plazo de pago"] = paymentTerm(terms.termValue, terms.termUnit);
  }
  rows["Vigencia de la propuesta"] = displayOptionalDate(proposal.validUntil);
  if (proposal.observations) {
    rows["Observaciones comerciales"] = proposal.observations;
  }

  return `
<section class="proposal-section conditions-section">
  ${sectionHeading("Condiciones comerciales")}
  ${documentMetadataTable(rows)}
</section>`;
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

function money(value: string, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return escapeHtml(`${currency} ${value}`);
  return escapeHtml(
    new Intl.NumberFormat("es-CR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount),
  );
}

const commercialProposalStyles = `
.proposal-section { margin-top: 12pt; }
.proposal-section .doc-metadata { margin-bottom: 0; }
.proposal-services { display: grid; gap: 10pt; }
.proposal-service {
  border: 0.75pt solid #777;
  padding: 9pt;
  break-inside: avoid;
  page-break-inside: avoid;
}
.proposal-service h4 { font-size: 10.5pt; margin-bottom: 7pt; }
.service-details { display: grid; grid-template-columns: 1fr 1fr; gap: 4pt 12pt; }
.service-details div { min-width: 0; }
.service-details dt { font-size: 8.5pt; font-weight: 700; color: #444; }
.service-details dd { font-size: 9.5pt; overflow-wrap: anywhere; }
.service-participants, .service-notes { font-size: 9pt; margin-top: 7pt; }
.service-pricing { width: 100%; border-collapse: collapse; margin-top: 8pt; font-size: 9pt; }
.service-pricing th, .service-pricing td { border-top: 0.75pt solid #aaa; padding: 4pt; text-align: right; }
.service-pricing th { color: #444; }
.proposal-totals { width: 76mm; margin-left: auto; border-collapse: collapse; font-size: 10pt; }
.proposal-totals th, .proposal-totals td { padding: 4pt 6pt; border-bottom: 0.75pt solid #aaa; }
.proposal-totals th { text-align: left; }
.proposal-totals td { text-align: right; }
.proposal-totals .grand-total { font-size: 12pt; font-weight: 700; }
`;

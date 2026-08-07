import type { CommercialProposalPdfDto } from "../dto";
import {
  AdditionalServiceCurrency,
  AdditionalServiceTravelType,
  PaymentConditionType,
  PaymentTermUnit,
} from "../enums";
import { commercialProposalTemplate } from "./commercial-proposal.template";

describe("commercialProposalTemplate", () => {
  it("renders the complete customer-facing proposal from the public DTO", () => {
    const html = commercialProposalTemplate(buildProposal());

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Viajes &amp; Compañía");
    expect(html).toContain("Propuesta N.° <strong>AS-2026-0042</strong>");
    expect(html).toContain("Información de la propuesta");
    expect(html).toContain("Ana &lt;Cliente&gt;");
    expect(html).toContain("Europa 2026");
    expect(html).toContain("Equipaje adicional");
    expect(html).toContain("CHECKED_BAGGAGE");
    expect(html).toContain("Sujeto a disponibilidad.");
    expect(html).toContain("Condiciones comerciales");
    expect(html).toContain("15 días");
    expect(html).toContain('<footer class="doc-footer">');

    const body = html.slice(html.indexOf("<body>"));
    [
      "supplier",
      "proveedor",
      "purchase price",
      "margin",
      "margen",
      "exchange rate",
      "tipo de cambio",
      "tenantId",
      "createdBy",
    ].forEach((value) => expect(body.toLowerCase()).not.toContain(value.toLowerCase()));
  });

  it("omits travel and payment term when they do not apply", () => {
    const proposal = buildProposal();
    proposal.travel = null;
    proposal.paymentTerms = {
      condition: PaymentConditionType.CASH,
      termValue: null,
      termUnit: null,
    };

    const html = commercialProposalTemplate(proposal);

    expect(html).not.toContain('class="section-heading">Viaje</h3>');
    expect(html).not.toContain("Plazo de pago");
    expect(html).toContain("Contado");
  });
});

function buildProposal(): CommercialProposalPdfDto {
  return {
    company: {
      name: "Viajes & Compañía",
      legalId: "3-101-123456",
      contactEmail: "ventas@example.com",
      contactPhone: "+506 2222-2222",
      logoSrc: "https://example.com/logo.png",
    },
    proposalNumber: "AS-2026-0042",
    issuedAt: "2026-08-06T15:00:00.000Z",
    validUntil: "2026-08-20T00:00:00.000Z",
    currency: AdditionalServiceCurrency.USD,
    customer: {
      fullName: "Ana <Cliente>",
      identification: "1-1111-1111",
      email: "ana@example.com",
      phone: "+506 8888-8888",
    },
    travel: {
      travelType: AdditionalServiceTravelType.INTERNATIONAL,
      reference: "PKG-2026-10",
      name: "Europa 2026",
      destination: "España",
      departureDate: "2026-10-01T00:00:00.000Z",
      returnDate: "2026-10-10T00:00:00.000Z",
    },
    services: [
      {
        name: "Equipaje adicional",
        details: [
          { label: "Tipos de equipaje", value: "CHECKED_BAGGAGE" },
          { label: "Peso", value: "23 kg" },
        ],
        participants: [
          {
            role: "HOLDER",
            fullName: "Ana Cliente",
            identification: "1-1111-1111",
          },
        ],
        notes: "Sujeto a disponibilidad.",
        subtotal: "100.00",
        vatPercentage: "13.00",
        vatAmount: "13.00",
        total: "113.00",
      },
    ],
    paymentTerms: {
      condition: PaymentConditionType.CREDIT,
      termValue: 15,
      termUnit: PaymentTermUnit.DAYS,
    },
    observations: "Precios válidos durante el plazo indicado.",
    subtotal: "100.00",
    vatTotal: "13.00",
    total: "113.00",
  };
}

import {
  AdditionalServiceCurrency,
  AdditionalServiceMarginType,
  AdditionalServiceOrderStatus,
  AdditionalServiceTravelType,
  PaymentConditionType,
  PaymentTermUnit,
} from "./enums";
import { CommercialProposalPdfMapper } from "./commercial-proposal-pdf.mapper";
import type { AdditionalServiceOrderRecord } from "./repositories";

describe("CommercialProposalPdfMapper", () => {
  const mapper = new CommercialProposalPdfMapper();

  it("maps an order to a customer-safe commercial proposal document", () => {
    const document = mapper.map(buildOrder(), {
      name: "Viajes Ejemplo",
      legalId: "3-101-123456",
      contactEmail: "ventas@example.com",
      contactPhone: "+506 2222-2222",
      businessAddress: "San José, Costa Rica",
      primaryColor: "#123456",
      logoSrc: "https://example.com/logo.png",
    });

    expect(document).toEqual({
      company: {
        name: "Viajes Ejemplo",
        legalId: "3-101-123456",
        contactEmail: "ventas@example.com",
        contactPhone: "+506 2222-2222",
        businessAddress: "San José, Costa Rica",
        primaryColor: "#123456",
        logoSrc: "https://example.com/logo.png",
      },
      proposalNumber: "AS-2026-0042",
      issuedAt: "2026-08-06T15:00:00.000Z",
      validUntil: "2026-08-20T00:00:00.000Z",
      currency: AdditionalServiceCurrency.USD,
      customer: {
        fullName: "Ana Cliente",
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
            { label: "Tipo de equipaje", value: "Equipaje documentado" },
            { label: "Alcance", value: "Un trayecto" },
            { label: "Cantidad de piezas", value: "1" },
            { label: "Peso por pieza (kg)", value: "23" },
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
    });

    const serialized = JSON.stringify(document);
    [
      "tenantId",
      "idempotencyKey",
      "quoteCustomerId",
      "supplierId",
      "supplierName",
      "supplierCost",
      "supplierCostUrl",
      "exchangeRateId",
      "appliedExchangeRate",
      "marginType",
      "marginValue",
      "marginAmount",
      "createdByUserId",
    ].forEach((field) => expect(serialized).not.toContain(`\"${field}\"`));
  });

  it.each([
    [
      "BAGGAGE",
      { baggageTypes: ["CARRY_ON", "HAND_BAGGAGE", "CHECKED_BAGGAGE"], tripScope: "MULTIPLE_TRIPS", pieceQuantity: 2, weightKg: 10 },
      ["Equipaje de mano", "Artículo personal", "Equipaje documentado", "Múltiples trayectos"],
    ],
    ["LODGING", { lodgingType: "HOTEL_WITH_BREAKFAST", checkInDate: "2026-10-01", checkOutDate: "2026-10-10" }, ["Hotel con desayuno", "01/10/2026"]],
    ["ACCOMMODATION_TYPE", { accommodationType: "QUADRUPLE" }, ["Habitación cuádruple"]],
    ["INSURANCE", { coverage: "USD_60000", customCoverageAmount: null, currency: "USD" }, ["USD 60.000"]],
    ["TRANSPORTATION", { transportationType: "PRIVATE_TRANSPORT", tripType: "ROUND_TRIP", serviceDate: "2026-10-01", origin: "San José", destination: "Liberia" }, ["Transporte privado", "Ida y regreso"]],
    ["FLIGHT_TICKET", { tripType: "ONE_WAY", originAirport: { iata: "SJO", name: "Juan Santamaría", city: "Alajuela", country: "Costa Rica" }, destinationAirport: { iata: "MAD", name: "Barajas", city: "Madrid", country: "España" }, departureDate: "2026-10-01", returnDate: null, quantity: 1 }, ["Solo ida", "01/10/2026"]],
    ["SEAT_SELECTION", { seatPreference: "EXTRA_LEGROOM", otherPreferenceDescription: null, quantity: 1 }, ["Espacio adicional para las piernas"]],
    ["VISA_ASSISTANCE", { destinationCountry: "España", visaType: "TOURISM", expectedTravelDate: "2026-10-01" }, ["Turismo", "01/10/2026"]],
  ])("translates customer-facing values for %s", (serviceCode, serviceDetails, expectedLabels) => {
    const order = buildOrder();
    order.lines[0].serviceCode = serviceCode;
    order.lines[0].serviceDetails = serviceDetails;

    const values = mapper
      .map(order, {
        name: "Viajes Ejemplo",
        legalId: null,
        contactEmail: null,
        contactPhone: null,
        businessAddress: null,
        primaryColor: null,
        logoSrc: null,
      })
      .services[0].details.map((detail) => detail.value);

    expectedLabels.forEach((expected) =>
      expect(values.join(" | ")).toContain(expected),
    );
    expect(values.join(" ")).not.toMatch(
      /CARRY_ON|HAND_BAGGAGE|CHECKED_BAGGAGE|MULTIPLE_TRIPS|HOTEL_WITH_BREAKFAST|QUADRUPLE|USD_60000|PRIVATE_TRANSPORT|ROUND_TRIP|ONE_WAY|EXTRA_LEGROOM|TOURISM/,
    );
  });
});

function buildOrder(): AdditionalServiceOrderRecord {
  return {
    id: "internal-order-id",
    tenantId: "internal-tenant-id",
    orderNumber: "AS-2026-0042",
    idempotencyKey: "internal-idempotency-key",
    quoteCustomerId: "internal-customer-id",
    quoteCustomer: {
      fullName: "Ana Cliente",
      email: "ana@example.com",
    },
    travelPackageId: "internal-package-id",
    internalBookingId: null,
    travelType: AdditionalServiceTravelType.INTERNATIONAL,
    quotationCurrency: AdditionalServiceCurrency.USD,
    commercialSubtotal: "100.00",
    totalVat: "13.00",
    totalSellingPrice: "113.00",
    paymentConditionType: PaymentConditionType.CREDIT,
    paymentTermValue: 15,
    paymentTermUnit: PaymentTermUnit.DAYS,
    quotationValidUntil: new Date("2026-08-20T00:00:00.000Z"),
    commercialObservations: "Precios válidos durante el plazo indicado.",
    travel: {
      type: "TRAVEL_PACKAGE",
      id: "internal-package-id",
      code: "PKG-2026-10",
      name: "Europa 2026",
      destination: "España",
      departureDate: new Date("2026-10-01T00:00:00.000Z"),
      returnDate: new Date("2026-10-10T00:00:00.000Z"),
    },
    status: AdditionalServiceOrderStatus.DRAFT,
    lines: [
      {
        id: "internal-line-id",
        tenantId: "internal-tenant-id",
        orderId: "internal-order-id",
        additionalServiceCatalogId: "internal-catalog-id",
        serviceCode: "BAGGAGE",
        serviceName: "Equipaje adicional",
        serviceDetailsVersion: 1,
        serviceDetails: {
          baggageTypes: ["CHECKED_BAGGAGE"],
          tripScope: "SINGLE_TRIP",
          pieceQuantity: 1,
          weightKg: 23,
          unexpectedInternalValue: "must-not-leak",
        },
        supplierId: "internal-supplier-id",
        supplierName: "Proveedor interno",
        supplierCostUrl: "https://internal.example/cost",
        supplierCost: "70.00",
        supplierCostCurrency: AdditionalServiceCurrency.USD,
        quotationCurrency: AdditionalServiceCurrency.USD,
        supplierCostInQuotationCurrency: "70.00",
        exchangeRateId: "internal-rate-id",
        exchangeRateDate: new Date("2026-08-06T00:00:00.000Z"),
        exchangeRateSource: "INTERNAL",
        exchangeRateBuyRate: "500.00",
        exchangeRateSellRate: "510.00",
        exchangeRateType: "SELL",
        appliedExchangeRate: "510.00",
        marginType: AdditionalServiceMarginType.PERCENTAGE,
        marginValue: "42.86",
        marginAmount: "30.00",
        subtotal: "100.00",
        vatPercentage: "13.00",
        vatAmount: "13.00",
        finalSellingPrice: "113.00",
        commercialNotes: "Sujeto a disponibilidad.",
        participants: [
          {
            clientId: "internal-customer-id",
            role: "HOLDER",
            fullName: "Ana Cliente",
            identification: "1-1111-1111",
            email: "ana@example.com",
            phone: "+506 8888-8888",
          },
        ],
        createdAt: new Date("2026-08-06T15:00:00.000Z"),
        updatedAt: new Date("2026-08-06T15:00:00.000Z"),
      },
    ],
    createdByUserId: "internal-user-id",
    createdByName: "Agente Interno",
    createdAt: new Date("2026-08-06T15:00:00.000Z"),
    updatedAt: new Date("2026-08-06T15:00:00.000Z"),
  };
}

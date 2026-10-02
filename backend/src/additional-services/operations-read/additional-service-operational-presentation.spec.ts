import { operationalAdditionalServicePresentation } from "./additional-service-operational-presentation";

describe("operationalAdditionalServicePresentation", () => {
  it.each([
    ["LODGING", { lodgingType: "HOTEL_WITH_BREAKFAST", checkInDate: "2026-09-18", checkOutDate: "2026-09-22" }, "Hotel con desayuno", "Entrada"],
    ["FLIGHT_TICKET", { tripType: "ONE_WAY", originAirport: { iata: "SJO", name: "Juan Santamaría", city: "Alajuela" }, destinationAirport: { iata: "MAD", name: "Barajas", city: "Madrid" }, departureDate: "2026-09-18", returnDate: null, quantity: 1 }, "SJO · Juan Santamaría · Alajuela → MAD · Barajas · Madrid", "Salida"],
    ["TRANSPORTATION", { transportationType: "PRIVATE_TRANSPORT", tripType: "ONE_WAY", serviceDate: "2026-09-18", origin: "Hotel", destination: "SJO" }, "Transporte privado", "Origen"],
    ["TOUR", { tourName: "Arenal", serviceDate: "2026-09-18" }, "Arenal", "Fecha"],
    ["EVENT_TICKET", { eventName: "Concierto", serviceDate: "2026-09-18", venueOrCity: "Estadio", quantity: 2 }, "Concierto", "Lugar"],
    ["SEAT_SELECTION", { seatPreference: "WINDOW", otherPreferenceDescription: null, quantity: 1 }, "Ventana", "Cantidad"],
    ["BAGGAGE", { baggageTypes: ["CHECKED_BAGGAGE"], tripScope: "SINGLE_TRIP", pieceQuantity: 1, weightKg: 23 }, "Equipaje documentado", "Peso por pieza"],
    ["INSURANCE", { coverage: "USD_60000", customCoverageAmount: null, currency: "USD" }, "USD 60.000", "Cobertura"],
  ])("maps %s structured details to semantic Spanish fields", (serviceCode, details, subtitle, fieldLabel) => {
    const presentation = operationalAdditionalServicePresentation(serviceCode, "Servicio", details);
    expect(presentation).toEqual(expect.objectContaining({ title: "Servicio", subtitle }));
    expect(presentation.fields).toEqual(expect.arrayContaining([expect.objectContaining({ label: fieldLabel })]));
    expect(JSON.stringify(presentation)).not.toMatch(/checkInDate|lodgingType|HOTEL_WITH_BREAKFAST|tripType/);
  });

  it("preserves date-only values and safely degrades unknown details without serializing payload keys", () => {
    const lodging = operationalAdditionalServicePresentation("LODGING", "Hospedaje", { lodgingType: "HOTEL_WITH_BREAKFAST", checkInDate: "2026-09-18", checkOutDate: "2026-09-22" });
    expect(lodging.fields).toContainEqual({ key: "start-date", label: "Entrada", value: "2026-09-18", valueType: "DATE" });
    expect(operationalAdditionalServicePresentation("OTHER", "Otro servicio", { rawInternalKey: "secret" })).toEqual({ title: "Otro servicio", subtitle: null, fields: [] });
  });
});

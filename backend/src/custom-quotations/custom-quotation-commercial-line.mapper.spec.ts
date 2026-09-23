import { mapCostComponentsToCommercialLines } from "./custom-quotation-commercial-line.mapper";

describe("Custom Quotation commercial line mapper", () => {
  it.each([
    ["AIRFARE", { flightType: "INTERNATIONAL", tripType: "ROUND_TRIP", origin: "SJO", destination: "MAD", departureDate: "2026-10-01", returnDate: "2026-10-10", airline: "Iberia", cabinClass: "BUSINESS" }, null, "Vuelo: SJO → MAD", "1"],
    ["BAGGAGE", { baggageType: "CHECKED", pieces: 2, weightKg: "23" }, null, "Equipaje: Equipaje documentado", "2"],
    ["LODGING", { propertyName: "Hotel Central", city: "Madrid", lodgingType: "HOTEL", roomType: "DOUBLE", checkIn: "2026-10-01", checkOut: "2026-10-10", nights: 9, roomCount: 2 }, null, "Hospedaje: Hotel Central · Madrid", "1"],
    ["TRANSPORTATION", { transportationType: "PRIVATE_TRANSFER", tripType: "ONE_WAY", origin: "Aeropuerto", destination: "Hotel", serviceDate: "2026-10-01", serviceTime: "14:30" }, null, "Transporte: Aeropuerto → Hotel", "1"],
    ["TOUR", { activityName: "Museo del Prado", tourType: "HALF_DAY", location: "Madrid", serviceDate: "2026-10-03", duration: "4 horas" }, null, "Tour: Museo del Prado", "1"],
    ["INSURANCE", { coverageType: "MEDICAL", startDate: "2026-10-01", endDate: "2026-10-10", coverageAmount: "50000" }, null, "Seguro: Cobertura médica", "1"],
    ["EVENT_TICKET", { eventName: "Concierto", venue: "Teatro", city: "Madrid", eventDate: "2026-10-04" }, "3.00000", "Entradas: Concierto", "3.00000"],
    ["VISA_ASSISTANCE", { destinationCountry: "España", visaType: "TOURISM", expectedTravelDate: "2026-10-01" }, null, "Asistencia de visa: España", "1"],
    ["MEALS", { mealPlanType: "FULL_BOARD", startDate: "2026-10-01", endDate: "2026-10-10" }, "2", "Alimentación: Pensión completa", "2"],
    ["OTHER", null, "2.5000", "Tasa portuaria", "2.5000"],
    ["CUSTOM_SERVICE", null, "4", "Gestión especial", "4"],
  ])("maps %s deterministically from existing structured fields", (code, detailPayload, quantity, expectedDescription, expectedQuantity) => {
    const [line] = mapCostComponentsToCommercialLines([component({ code, detailPayload, quantity, title: code === "OTHER" ? "Tasa portuaria" : code === "CUSTOM_SERVICE" ? "Gestión especial" : "Título no usado" })]);
    expect(line).toEqual(expect.objectContaining({ displayOrder: 1, description: expectedDescription, quantity: expectedQuantity }));
  });

  it("uses only customer-safe structured data and never leaks Cost Engine authority fields", () => {
    const [line] = mapCostComponentsToCommercialLines([{
      ...component({ code: "AIRFARE", detailPayload: { flightType: "INTERNATIONAL", tripType: "ONE_WAY", origin: "SJO", destination: "MAD", departureDate: "2026-10-01" } }),
      costSupplier: { name: "Proveedor interno" }, currentSnapshot: { amount: "999.99999", sourceUrl: "https://internal.example", sourceReference: "secreto" }, evidence: [{ id: "evidence-a" }], internalNotes: "No mostrar",
    } as any]);

    expect(line).toEqual(expect.objectContaining({ description: "Vuelo: SJO → MAD", quantity: "1" }));
    expect(JSON.stringify(line)).not.toContain("Proveedor interno");
    expect(JSON.stringify(line)).not.toContain("999.99999");
    expect(JSON.stringify(line)).not.toContain("internal.example");
    expect(JSON.stringify(line)).not.toContain("secreto");
    expect(JSON.stringify(line)).not.toContain("No mostrar");
  });

  it("uses stable input ordering and never derives quantity from a financial amount", () => {
    const lines = mapCostComponentsToCommercialLines([
      component({ id: "component-b", code: "OTHER", title: "Segundo", quantity: null }),
      component({ id: "component-a", code: "BAGGAGE", detailPayload: { baggageType: "CARRY_ON", pieces: 1 } }),
    ]);

    expect(lines).toEqual([
      expect.objectContaining({ displayOrder: 1, description: "Segundo", quantity: "1" }),
      expect.objectContaining({ displayOrder: 2, description: "Equipaje: Equipaje de mano", quantity: "1" }),
    ]);
  });
});

function component(overrides: Record<string, unknown>) {
  const code = String(overrides.code ?? "OTHER");
  return {
    id: "component-a", title: "Servicio", description: "Detalle comercial", detailPayload: null, detailSchemaVersion: overrides.detailPayload ? 1 : null,
    quantity: null, unit: null, costCategory: { code, origin: code === "CUSTOM_SERVICE" ? "CUSTOM" : "STANDARD" },
    ...overrides,
  };
}

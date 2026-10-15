import { resolveAdditionalServiceCustomerFacingDescription } from "./additional-service-customer-description.resolver";

describe("resolveAdditionalServiceCustomerFacingDescription", () => {
  it("uses persisted airport cities for flight tickets and never IATA codes", () => {
    const description = resolveAdditionalServiceCustomerFacingDescription({
      serviceCode: "FLIGHT_TICKET",
      serviceName: "Boleto aéreo",
      serviceDetails: {
        originAirport: {
          iata: "SJO",
          name: "Aeropuerto Internacional Juan Santamaría",
          city: "Alajuela",
        },
        destinationAirport: {
          iata: "MAD",
          name: "Aeropuerto Adolfo Suárez Madrid-Barajas",
          city: "Madrid",
        },
      },
    });

    expect(description).toBe("Alajuela – Madrid");
    expect(description).not.toContain("SJO");
    expect(description).not.toContain("MAD");
  });

  it("removes an IATA code when the persisted airport name is the only display authority", () => {
    expect(
      resolveAdditionalServiceCustomerFacingDescription({
        serviceCode: "FLIGHT_TICKET",
        serviceName: "Boleto aéreo",
        serviceDetails: {
          originAirport: { iata: "SJO", name: "Aeropuerto Juan Santamaría (SJO)" },
          destinationAirport: { iata: "MAD", name: "Aeropuerto de Madrid (MAD)" },
        },
      }),
    ).toBe("Aeropuerto Juan Santamaría – Aeropuerto de Madrid");
  });

  it.each([
    ["HOTEL_WITH_BREAKFAST", "Hotel con desayuno Madrid"],
    ["HOTEL_WITHOUT_BREAKFAST", "Hotel Madrid"],
  ])("builds a generic lodging label for %s", (lodgingType, expected) => {
    expect(
      resolveAdditionalServiceCustomerFacingDescription({
        serviceCode: "LODGING",
        serviceName: "Hotel Riu Plaza España",
        serviceDetails: { lodgingType },
        commercialDestination: "Madrid",
      }),
    ).toBe(expected);
  });

  it("uses the generic Airbnb label without property or supplier identity", () => {
    expect(
      resolveAdditionalServiceCustomerFacingDescription({
        serviceCode: "LODGING",
        serviceName: "Apartamento específico",
        serviceDetails: { lodgingType: "AIRBNB" },
        commercialDestination: "Madrid",
      }),
    ).toBe("Airbnb Madrid");
  });

  it("uses a generic transportation label rather than raw route codes", () => {
    expect(
      resolveAdditionalServiceCustomerFacingDescription({
        serviceCode: "TRANSPORTATION",
        serviceName: "Traslado privado",
        serviceDetails: {
          transportationType: "PRIVATE_TRANSPORT",
          origin: "SJO",
          destination: "MAD",
        },
        commercialDestination: "Madrid",
      }),
    ).toBe("Traslado Madrid");
  });

  it("cannot include supplier, cost, or evidence values", () => {
    const description = resolveAdditionalServiceCustomerFacingDescription({
      serviceCode: "TRANSPORTATION",
      serviceName: "Traslado",
      serviceDetails: {
        supplierName: "Proveedor interno",
        supplierCostUrl: "https://supplier.example/cost",
        costEvidenceObjectKey: "tenant/private/evidence.webp",
        supplierCost: "123.45",
      },
      commercialDestination: "Madrid",
    });

    expect(description).toBe("Traslado Madrid");
    expect(description).not.toContain("Proveedor interno");
    expect(description).not.toContain("supplier.example");
    expect(description).not.toContain("evidence.webp");
    expect(description).not.toContain("123.45");
  });

  it("falls back safely for unknown services and suppresses code-shaped names", () => {
    expect(
      resolveAdditionalServiceCustomerFacingDescription({
        serviceCode: "CUSTOM_SERVICE",
        serviceName: "Servicio especial",
        serviceDetails: {},
      }),
    ).toBe("Servicio especial");
    expect(
      resolveAdditionalServiceCustomerFacingDescription({
        serviceCode: "CUSTOM_SERVICE",
        serviceName: "INTERNAL_SERVICE_CODE",
        serviceDetails: {},
      }),
    ).toBe("Servicio adicional");
  });

  it("is deterministic for the same persisted commercial input", () => {
    const input = {
      serviceCode: "LODGING",
      serviceName: "Hotel",
      serviceDetails: { lodgingType: "HOSTEL" },
      commercialDestination: "Madrid",
    };

    expect(resolveAdditionalServiceCustomerFacingDescription(input)).toBe(
      resolveAdditionalServiceCustomerFacingDescription(input),
    );
  });
});

import {
  MAX_FISCAL_LINE_DESCRIPTION_LENGTH,
  buildSalesOrderLineFiscalDescription,
  formatCustomerVisibleServiceAttributes,
} from "./sales-order-line-fiscal-description";

describe("SalesOrderLine fiscal description", () => {
  it("formats persisted Insurance coverage deterministically", () => {
    const snapshot = Object.freeze({
      serviceName: "Seguro",
      serviceCode: "INSURANCE",
      serviceDetailsVersion: 1,
      serviceDetails: Object.freeze({
        coverage: "USD_60000",
        customCoverageAmount: null,
        currency: "USD",
      }),
    });

    expect(buildSalesOrderLineFiscalDescription(snapshot)).toBe(
      "Seguro · Cobertura: USD 60,000",
    );
    expect(buildSalesOrderLineFiscalDescription(snapshot)).toBe(
      buildSalesOrderLineFiscalDescription(snapshot),
    );
  });

  it("uses the immutable Additional Services snapshot without reintroducing IATA", () => {
    const result = buildSalesOrderLineFiscalDescription({
      sourceType: "ADDITIONAL_SERVICE_ORDER",
      customerFacingDescription: "Alajuela – Madrid",
      serviceName: "Vuelo interno SJO-MAD",
      serviceCode: "FLIGHT_TICKET",
      serviceDetailsVersion: 1,
      serviceDetails: {
        tripType: "ONE_WAY",
        originAirport: { iata: "SJO" },
        destinationAirport: { iata: "MAD" },
        departureDate: "2026-10-01",
        returnDate: null,
        quantity: 1,
      },
    });

    expect(result).toBe(
      "Alajuela – Madrid · Tipo de viaje: Solo ida · Salida: 01/10/2026 · Cantidad: 1 unidad",
    );
    expect(result).not.toContain("SJO");
    expect(result).not.toContain("MAD");
  });

  it("uses the legacy formatter for null snapshots and other source types", () => {
    const legacyInput = {
      sourceType: "ADDITIONAL_SERVICE_ORDER",
      customerFacingDescription: null,
      serviceName: "Vuelo",
      serviceCode: "FLIGHT_TICKET",
      serviceDetailsVersion: 1,
      serviceDetails: {
        tripType: "ONE_WAY",
        originAirport: { iata: "SJO" },
        destinationAirport: { iata: "MAD" },
        departureDate: "2026-10-01",
        returnDate: null,
        quantity: 1,
      },
    };

    expect(buildSalesOrderLineFiscalDescription(legacyInput)).toContain(
      "Ruta: SJO → MAD",
    );
    expect(
      buildSalesOrderLineFiscalDescription({
        ...legacyInput,
        sourceType: "CUSTOM_QUOTATION",
        customerFacingDescription: "No usar esta descripción",
      }),
    ).toContain("Ruta: SJO → MAD");
  });

  it.each([
    [null, { coverage: "USD_60000" }],
    [2, { coverage: "USD_60000" }],
    [1, null],
    [1, { coverage: "UNKNOWN" }],
    [1, ["USD_60000"]],
  ])(
    "falls back to serviceName for unsupported version or details %#",
    (serviceDetailsVersion, serviceDetails) => {
      expect(
        buildSalesOrderLineFiscalDescription({
          serviceName: "Seguro",
          serviceCode: "INSURANCE",
          serviceDetailsVersion,
          serviceDetails,
        }),
      ).toBe("Seguro");
    },
  );

  it("includes only allow-listed customer-visible attributes", () => {
    const serviceDetails = {
      coverage: "USD_60000",
      customCoverageAmount: null,
      currency: "USD",
      supplierId: "supplier-secret",
      supplierName: "Secret Provider",
      supplierCost: "999.99",
      supplierCostUrl: "https://private.example.test",
      procurementCurrency: "CRC",
      procurementExchangeRate: "500",
      marginType: "PERCENTAGE",
      marginValue: "40",
      marginAmount: "400",
      participants: [
        { fullName: "Private Person", identification: "private-id" },
      ],
      commercialNotes: "Internal note",
      tenantId: "tenant-secret",
      customerId: "customer-secret",
    };

    const result = buildSalesOrderLineFiscalDescription({
      serviceName: "Seguro",
      serviceCode: "INSURANCE",
      serviceDetailsVersion: 1,
      serviceDetails,
    });

    expect(result).toBe("Seguro · Cobertura: USD 60,000");
    expect(result).not.toMatch(
      /supplier|provider|999|private|margin|internal|tenant|customer/i,
    );
  });

  it("does not consume either line-note snapshot", () => {
    const snapshot = {
      serviceName: "Seguro",
      serviceCode: "INSURANCE",
      serviceDetailsVersion: 1,
      serviceDetails: {
        coverage: "USD_60000",
        customCoverageAmount: null,
        currency: "USD",
      },
      commercialNotes: "Internal note",
      customerFacingNotes: "Customer note",
    };

    const result = buildSalesOrderLineFiscalDescription(snapshot);

    expect(result).toBe("Seguro · Cobertura: USD 60,000");
    expect(result).not.toMatch(/internal note|customer note/i);
  });

  it("supports the version-one serviceDetails contract beyond Insurance", () => {
    expect(
      formatCustomerVisibleServiceAttributes({
        serviceCode: "TRANSPORTATION",
        serviceDetailsVersion: 1,
        serviceDetails: {
          transportationType: "PRIVATE_TRANSPORT",
          tripType: "ROUND_TRIP",
          serviceDate: "2026-09-01",
          origin: "San José",
          destination: "Liberia",
        },
      }),
    ).toEqual([
      { label: "Tipo", value: "Transporte privado" },
      { label: "Tipo de viaje", value: "Ida y vuelta" },
      { label: "Origen", value: "San José" },
      { label: "Destino", value: "Liberia" },
      { label: "Fecha", value: "01/09/2026" },
    ]);
  });

  it("normalizes whitespace and appends only whole attributes within the bound", () => {
    const result = buildSalesOrderLineFiscalDescription({
      serviceName: `  ${"S".repeat(MAX_FISCAL_LINE_DESCRIPTION_LENGTH - 1)}  `,
      serviceCode: "INSURANCE",
      serviceDetailsVersion: 1,
      serviceDetails: {
        coverage: "USD_60000",
        customCoverageAmount: null,
        currency: "USD",
      },
    });

    expect(Array.from(result)).toHaveLength(
      MAX_FISCAL_LINE_DESCRIPTION_LENGTH - 1,
    );
    expect(result).not.toContain("Cobertura");
  });
});

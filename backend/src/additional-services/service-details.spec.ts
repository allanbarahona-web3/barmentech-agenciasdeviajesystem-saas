import { normalizeAdditionalServiceDetails } from "./service-details";

describe("normalizeAdditionalServiceDetails", () => {
  it.each([
    ["BAGGAGE", {
      baggageTypes: ["CARRY_ON"],
      tripScope: "SINGLE_TRIP",
      pieceQuantity: 1,
      weightKg: 10,
    }],
    ["LODGING", {
      lodgingType: "HOTEL_WITH_BREAKFAST",
      checkInDate: "2026-08-01",
      checkOutDate: "2026-08-05",
    }],
    ["ACCOMMODATION_TYPE", { accommodationType: "DOUBLE" }],
    ["INSURANCE", {
      coverage: "USD_35000",
      customCoverageAmount: null,
      currency: "USD",
    }],
    ["TRANSPORTATION", {
      transportationType: "PRIVATE_TRANSPORT",
      tripType: "ROUND_TRIP",
      serviceDate: "2026-08-02",
      origin: "Airport",
      destination: "Hotel",
    }],
    ["TOUR", { tourName: "City Tour", serviceDate: "2026-08-03" }],
    ["FLIGHT_TICKET", {
      tripType: "ROUND_TRIP",
      originAirport: {
        iata: "SJO",
        name: "Juan Santamaría International Airport",
        city: "San José",
        country: "Costa Rica",
        countryCode: "CR",
      },
      destinationAirport: {
        iata: "MIA",
        name: "Miami International Airport",
        city: "Miami",
        country: "United States",
        countryCode: "US",
      },
      departureDate: "2026-08-01",
      returnDate: "2026-08-10",
      quantity: 1,
    }],
    ["EVENT_TICKET", {
      eventName: "Concert",
      serviceDate: "2026-08-04",
      quantity: 2,
      venueOrCity: "Miami",
    }],
    ["SEAT_SELECTION", {
      seatPreference: "OTHER",
      otherPreferenceDescription: "Near the restroom",
      quantity: 1,
    }],
    ["TRAVEL_EXTENSION", { newReturnDate: "2026-08-12", quantity: 1 }],
    ["TRIP_REDUCTION", { newReturnDate: "2026-08-08", quantity: 1 }],
    ["VISA_ASSISTANCE", {
      destinationCountry: "United States",
      visaType: "TOURISM",
      expectedTravelDate: null,
    }],
  ])("keeps only the commercial fields for %s", (serviceCode, details) => {
    expect(
      normalizeAdditionalServiceDetails(serviceCode, {
        ...details,
        participantIds: ["client-1"],
        supplierId: "supplier-1",
        commercialNotes: "do not persist",
        finalSellingPrice: 100,
        uiExpanded: true,
      }),
    ).toEqual(details);
  });

  it.each([
    ["BAGGAGE", {
      baggageTypes: ["CARRY_ON"],
      tripScope: "ALL_TRIPS",
      pieceQuantity: 1,
      weightKg: 10,
    }],
    ["TRANSPORTATION", {
      transportationType: "PRIVATE_TRANSPORT",
      tripType: "MULTI_CITY",
      serviceDate: "2026-08-02",
      origin: "Airport",
      destination: "Hotel",
    }],
  ])("rejects an unsupported enum value for %s", (serviceCode, details) => {
    expect(() =>
      normalizeAdditionalServiceDetails(serviceCode, details),
    ).toThrow();
  });
});

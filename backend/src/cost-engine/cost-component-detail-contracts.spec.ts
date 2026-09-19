import { BadRequestException } from "@nestjs/common";
import { normalizeCostComponentDetails } from "./cost-component-detail-contracts";

const empty = { detailPayload: null, detailSchemaVersion: null, quantity: null, unit: null };

describe("Cost Engine standard component detail contracts", () => {
  it.each([
    ["AIRFARE", { flightType: "international", tripType: "round_trip", origin: "SJO", destination: "MAD", departureDate: "2026-10-01", returnDate: "2026-10-12", cabinClass: "business" }],
    ["BAGGAGE", { baggageType: "checked", pieces: 1, weightKg: "23.000" }],
    ["LODGING", { propertyName: "Hotel Example", city: "Madrid", lodgingType: "hotel", roomType: "double", checkIn: "2026-10-01", checkOut: "2026-10-03", nights: 2, roomCount: 1 }],
    ["TRANSPORTATION", { transportationType: "private_transfer", origin: "Airport", destination: "Hotel", serviceDate: "2026-10-01", serviceTime: "09:30" }],
    ["TOUR", { activityName: "Museum visit", location: "Madrid", serviceDate: "2026-10-02", duration: "3 hours" }],
    ["INSURANCE", { coverageType: "medical", startDate: "2026-10-01", endDate: "2026-10-12", coverageAmount: "50000.00" }],
    ["EVENT_TICKET", { eventName: "Concert", venue: "Arena", city: "Madrid", eventDate: "2026-10-04" }],
    ["VISA_ASSISTANCE", { destinationCountry: "Spain", visaType: "tourist", expectedTravelDate: "2026-10-01" }],
    ["MEALS", { mealPlanType: "breakfast", startDate: "2026-10-01", endDate: "2026-10-03" }],
  ])("normalizes valid %s v1 details", (code, detailPayload) => {
    const result = normalizeCostComponentDetails(
      { code, origin: "STANDARD" },
      { ...empty, detailPayload, detailSchemaVersion: 1, quantity: "2.000", unit: "rooms" },
    );

    expect(result.detailSchemaVersion).toBe(1);
    expect(result.quantity).toBe("2");
    expect(result.unit).toBe("rooms");
  });

  it("accepts the supported LODGING and room types with stable uppercase codes", () => {
    for (const lodgingType of ["HOTEL", "HOSTEL", "AIRBNB", "APARTMENT", "OTHER"]) {
      const result = normalizeCostComponentDetails(
        { code: "LODGING", origin: "STANDARD" },
        { ...empty, detailSchemaVersion: 1, detailPayload: { propertyName: "Stay", city: "City", lodgingType: lodgingType.toLowerCase(), roomType: "MATRIMONIAL", checkIn: "2026-10-01", checkOut: "2026-10-03", nights: 2, roomCount: 1 } },
      );
      expect(result.detailPayload).toMatchObject({ lodgingType, roomType: "MATRIMONIAL" });
    }
    for (const roomType of ["SINGLE", "MATRIMONIAL", "DOUBLE", "TRIPLE", "QUADRUPLE", "OTHER"]) {
      const result = normalizeCostComponentDetails(
        { code: "LODGING", origin: "STANDARD" },
        { ...empty, detailSchemaVersion: 1, detailPayload: { propertyName: "Stay", city: "City", lodgingType: "HOTEL", roomType: roomType.toLowerCase(), checkIn: "2026-10-01", checkOut: "2026-10-03", nights: 2, roomCount: 1 } },
      );
      expect(result.detailPayload).toMatchObject({ lodgingType: "HOTEL", roomType });
    }
  });

  it("accepts stable AIRFARE flight, trip, and cabin codes while requiring a return date only for round trips", () => {
    for (const flightType of ["INTERNAL", "INTERNATIONAL"]) {
      const result = normalizeCostComponentDetails(
        { code: "AIRFARE", origin: "STANDARD" },
        { ...empty, detailSchemaVersion: 1, detailPayload: { flightType: flightType.toLowerCase(), tripType: "one_way", origin: "SJO", destination: "MAD", departureDate: "2026-10-01", cabinClass: "other" } },
      );
      expect(result.detailPayload).toEqual({ flightType, tripType: "ONE_WAY", origin: "SJO", destination: "MAD", departureDate: "2026-10-01", cabinClass: "OTHER" });
    }
    expect(normalizeCostComponentDetails(
      { code: "AIRFARE", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { flightType: "INTERNATIONAL", tripType: "ROUND_TRIP", origin: "SJO", destination: "MAD", departureDate: "2026-10-01", returnDate: "2026-10-12" } },
    ).detailPayload).toMatchObject({ tripType: "ROUND_TRIP", returnDate: "2026-10-12" });
  });

  it("rejects missing required fields, invalid LODGING types, unknown fields, and invalid date ranges", () => {
    expect(() => normalizeCostComponentDetails(
      { code: "AIRFARE", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { flightType: "INTERNATIONAL", tripType: "ROUND_TRIP", origin: "SJO", destination: "MAD", departureDate: "2026-10-03" } },
    )).toThrow(BadRequestException);
    expect(() => normalizeCostComponentDetails(
      { code: "AIRFARE", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { flightType: "DOMESTIC", tripType: "ONE_WAY", origin: "SJO", destination: "MAD", departureDate: "2026-10-03" } },
    )).toThrow(BadRequestException);
    expect(() => normalizeCostComponentDetails(
      { code: "AIRFARE", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { flightType: "INTERNATIONAL", tripType: "ROUND_TRIP", origin: "SJO", destination: "MAD", departureDate: "2026-10-03", returnDate: "2026-10-01" } },
    )).toThrow(BadRequestException);
    expect(() => normalizeCostComponentDetails(
      { code: "TOUR", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { activityName: "Tour", location: "City", serviceDate: "2026-10-01", unsupported: true } },
    )).toThrow(BadRequestException);
    expect(() => normalizeCostComponentDetails(
      { code: "LODGING", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { propertyName: "Hotel", city: "City", lodgingType: "HOTEL", roomType: "DOUBLE", checkIn: "2026-10-03", checkOut: "2026-10-01", nights: 2, roomCount: 1 } },
    )).toThrow(BadRequestException);
    expect(() => normalizeCostComponentDetails(
      { code: "LODGING", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { propertyName: "Hotel", city: "City", lodgingType: "RESORT", roomType: "DOUBLE", checkIn: "2026-10-01", checkOut: "2026-10-03", nights: 2, roomCount: 1 } },
    )).toThrow(BadRequestException);
    expect(() => normalizeCostComponentDetails(
      { code: "LODGING", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { propertyName: "Hotel", city: "City", lodgingType: "HOTEL", roomType: "SUITE", checkIn: "2026-10-01", checkOut: "2026-10-03", nights: 2, roomCount: 1 } },
    )).toThrow(BadRequestException);
  });

  it("rejects non-positive numeric values and unsupported schema versions", () => {
    expect(() => normalizeCostComponentDetails(
      { code: "BAGGAGE", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { baggageType: "CHECKED", pieces: 0 } },
    )).toThrow(BadRequestException);
    expect(() => normalizeCostComponentDetails(
      { code: "INSURANCE", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { coverageType: "MEDICAL", startDate: "2026-10-01", endDate: "2026-10-02", coverageAmount: "0" } },
    )).toThrow(BadRequestException);
    expect(() => normalizeCostComponentDetails(
      { code: "AIRFARE", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 2, detailPayload: { origin: "SJO", destination: "MAD", departureDate: "2026-10-01" } },
    )).toThrow(BadRequestException);
  });

  it("permits OTHER without specialized details and rejects specialized details for OTHER and CUSTOM", () => {
    expect(normalizeCostComponentDetails({ code: "OTHER", origin: "STANDARD" }, empty)).toEqual(empty);
    expect(() => normalizeCostComponentDetails(
      { code: "OTHER", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { anything: "else" } },
    )).toThrow(BadRequestException);
    expect(() => normalizeCostComponentDetails(
      { code: "TENANT_DEFINED", origin: "CUSTOM" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { anything: "else" } },
    )).toThrow(BadRequestException);
  });
});

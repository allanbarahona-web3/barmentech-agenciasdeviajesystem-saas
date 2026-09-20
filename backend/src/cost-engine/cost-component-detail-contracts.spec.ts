import { BadRequestException } from "@nestjs/common";
import { normalizeCostComponentDetails } from "./cost-component-detail-contracts";

const empty = { detailPayload: null, detailSchemaVersion: null, quantity: null, unit: null };

describe("Cost Engine standard component detail contracts", () => {
  it.each([
    ["AIRFARE", { flightType: "international", tripType: "round_trip", origin: "SJO", destination: "MAD", departureDate: "2026-10-01", returnDate: "2026-10-12", cabinClass: "business" }],
    ["BAGGAGE", { baggageType: "checked", pieces: 1, weightKg: "23.000" }],
    ["LODGING", { propertyName: "Hotel Example", city: "Madrid", lodgingType: "hotel", roomType: "double", checkIn: "2026-10-01", checkOut: "2026-10-03", nights: 2, roomCount: 1 }],
    ["TRANSPORTATION", { transportationType: "private_transfer", tripType: "one_way", origin: "Airport", destination: "Hotel", serviceDate: "2026-10-01", serviceTime: "09:30" }],
    ["TOUR", { activityName: "Museum visit", tourType: "full_day", location: "Madrid", serviceDate: "2026-10-02", duration: "3 hours" }],
    ["INSURANCE", { coverageType: "medical", startDate: "2026-10-01", endDate: "2026-10-12", coverageAmount: "50000.00" }],
    ["EVENT_TICKET", { eventName: "Concert", venue: "Arena", city: "Madrid", eventDate: "2026-10-04" }],
    ["VISA_ASSISTANCE", { destinationCountry: "ES", visaType: "tourism", expectedTravelDate: "2026-10-01" }],
    ["MEALS", { mealPlanType: "breakfast", startDate: "2026-10-01", endDate: "2026-10-03" }],
  ])("normalizes valid %s v1 details", (code, detailPayload) => {
    const result = normalizeCostComponentDetails(
      { code, origin: "STANDARD" },
      { ...empty, detailPayload, detailSchemaVersion: 1, quantity: code === "EVENT_TICKET" || code === "MEALS" ? "2" : "2.000", unit: "rooms" },
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

  it("requires TRANSPORTATION tripType and a return date only for round trips", () => {
    for (const transportationType of ["PRIVATE_TRANSFER", "SHARED_SHUTTLE", "BUS", "TRAIN", "FERRY", "TAXI_LOCAL", "RENTAL_CAR", "OTHER", "SHARED_TRANSFER", "CAR_RENTAL", "RAIL"]) {
      const result = normalizeCostComponentDetails(
        { code: "TRANSPORTATION", origin: "STANDARD" },
        { ...empty, detailSchemaVersion: 1, detailPayload: { transportationType: transportationType.toLowerCase(), tripType: "ONE_WAY", origin: "Origen", destination: "Destino", serviceDate: "2026-11-20", serviceTime: "14:30" } },
      );
      expect(result.detailPayload).toEqual({ transportationType, tripType: "ONE_WAY", origin: "Origen", destination: "Destino", serviceDate: "2026-11-20", serviceTime: "14:30" });
    }
    expect(normalizeCostComponentDetails(
      { code: "TRANSPORTATION", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { transportationType: "BUS", tripType: "ROUND_TRIP", origin: "Madrid", destination: "Toledo", serviceDate: "2026-11-22", returnDate: "2026-11-23" } },
    ).detailPayload).toMatchObject({ tripType: "ROUND_TRIP", returnDate: "2026-11-23" });
    for (const payload of [
      { transportationType: "BUS", tripType: "ROUND_TRIP", origin: "Madrid", destination: "Toledo", serviceDate: "2026-11-22" },
      { transportationType: "BUS", tripType: "ROUND_TRIP", origin: "Madrid", destination: "Toledo", serviceDate: "2026-11-22", returnDate: "2026-11-21" },
    ]) {
      expect(() => normalizeCostComponentDetails(
        { code: "TRANSPORTATION", origin: "STANDARD" },
        { ...empty, detailSchemaVersion: 1, detailPayload: payload },
      )).toThrow(BadRequestException);
    }
  });

  it("accepts approved VISA_ASSISTANCE values while retaining the legacy tourist value", () => {
    for (const visaType of ["TOURISM", "BUSINESS", "TRANSIT", "STUDENT", "WORK", "OTHER", "TOURIST"]) {
      const result = normalizeCostComponentDetails(
        { code: "VISA_ASSISTANCE", origin: "STANDARD" },
        { ...empty, detailSchemaVersion: 1, detailPayload: { destinationCountry: "EG", visaType: visaType.toLowerCase(), expectedTravelDate: "2027-04-15" } },
      );
      expect(result.detailPayload).toEqual({ destinationCountry: "EG", visaType, expectedTravelDate: "2027-04-15" });
    }
    for (const payload of [
      { visaType: "TOURISM", expectedTravelDate: "2027-04-15" },
      { destinationCountry: "EG", visaType: "TOURISM" },
    ]) {
      expect(() => normalizeCostComponentDetails(
        { code: "VISA_ASSISTANCE", origin: "STANDARD" },
        { ...empty, detailSchemaVersion: 1, detailPayload: payload },
      )).toThrow(BadRequestException);
    }
  });

  it("requires the compact TOUR type while accepting legacy duration data", () => {
    for (const tourType of ["HALF_DAY", "FULL_DAY", "MULTI_DAY", "OTHER"]) {
      const result = normalizeCostComponentDetails(
        { code: "TOUR", origin: "STANDARD" },
        { ...empty, detailSchemaVersion: 1, detailPayload: { activityName: "Petra", tourType: tourType.toLowerCase(), location: "Jordania", serviceDate: "2027-10-09", duration: "historical detail" } },
      );
      expect(result.detailPayload).toEqual({ activityName: "Petra", tourType, location: "Jordania", serviceDate: "2027-10-09", duration: "historical detail" });
    }
    expect(() => normalizeCostComponentDetails(
      { code: "TOUR", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { activityName: "Petra", location: "Jordania", serviceDate: "2027-10-09" } },
    )).toThrow(BadRequestException);
  });

  it("accepts approved INSURANCE coverage codes while retaining the legacy cancellation value", () => {
    for (const coverageType of ["MEDICAL", "CANCELLATION", "BAGGAGE", "COMPREHENSIVE", "OTHER", "TRIP_CANCELLATION"]) {
      const result = normalizeCostComponentDetails(
        { code: "INSURANCE", origin: "STANDARD" },
        { ...empty, detailSchemaVersion: 1, detailPayload: { coverageType, startDate: "2026-11-20", endDate: "2026-12-18", coverageAmount: "50000" } },
      );
      expect(result.detailPayload).toMatchObject({ coverageType, startDate: "2026-11-20", endDate: "2026-12-18", coverageAmount: "50000" });
    }
    for (const payload of [
      { coverageType: "MEDICAL", startDate: "2026-11-20", endDate: "2026-11-19" },
      { coverageType: "MEDICAL", startDate: "2026-11-20", endDate: "2026-12-18", coverageAmount: "0" },
    ]) {
      expect(() => normalizeCostComponentDetails(
        { code: "INSURANCE", origin: "STANDARD" },
        { ...empty, detailSchemaVersion: 1, detailPayload: payload },
      )).toThrow(BadRequestException);
    }
  });

  it("preserves an optional BAGGAGE related AIRFARE component identifier in the v1 detail payload", () => {
    const result = normalizeCostComponentDetails(
      { code: "BAGGAGE", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { baggageType: "checked", pieces: 1, weightKg: "23.000", relatedAirfareComponentId: "component-airfare-a" } },
    );

    expect(result.detailPayload).toEqual({ baggageType: "CHECKED", pieces: 1, weightKg: "23", relatedAirfareComponentId: "component-airfare-a" });
  });

  it("requires EVENT_TICKET quantity to be a positive integer while preserving the generic quantity field", () => {
    const valid = normalizeCostComponentDetails(
      { code: "EVENT_TICKET", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { eventName: "Museo", venue: "Louvre", city: "París", eventDate: "2027-03-24" }, quantity: "4" },
    );
    expect(valid.quantity).toBe("4");

    for (const quantity of [null, "0", "1.5"]) {
      expect(() => normalizeCostComponentDetails(
        { code: "EVENT_TICKET", origin: "STANDARD" },
        { ...empty, detailSchemaVersion: 1, detailPayload: { eventName: "Museo", venue: "Louvre", city: "París", eventDate: "2027-03-24" }, quantity },
      )).toThrow(BadRequestException);
    }
  });

  it("requires MEALS quantity to be a positive integer while retaining optional endDate", () => {
    const valid = normalizeCostComponentDetails(
      { code: "MEALS", origin: "STANDARD" },
      { ...empty, detailSchemaVersion: 1, detailPayload: { mealPlanType: "LUNCH", startDate: "2026-11-20" }, quantity: "15" },
    );
    expect(valid.detailPayload).toEqual({ mealPlanType: "LUNCH", startDate: "2026-11-20" });
    expect(valid.quantity).toBe("15");

    for (const quantity of [null, "0", "1.5"]) {
      expect(() => normalizeCostComponentDetails(
        { code: "MEALS", origin: "STANDARD" },
        { ...empty, detailSchemaVersion: 1, detailPayload: { mealPlanType: "BREAKFAST", startDate: "2026-11-20" }, quantity },
      )).toThrow(BadRequestException);
    }
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

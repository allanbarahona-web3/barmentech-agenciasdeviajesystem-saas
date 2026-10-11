import { BadRequestException } from "@nestjs/common";
import {
  enrichOperationalDetail,
  resolveOperationalServicePurpose,
  validateOperationalDetail,
} from "./operational-service-detail-contracts";

describe("Operational service detail contracts", () => {
  it.each([
    ["TRAVEL_PACKAGE_COST_COMPONENT", "AIRFARE"],
    ["ADDITIONAL_SERVICE_ORDER_LINE", "AIRFARE"],
    ["CUSTOM_QUOTATION_LINE", "AIRFARE"],
  ])("uses the same AIRFARE v1 contract for %s", (_sourceType, purpose) => {
    expect(validateOperationalDetail(purpose, {
      bookingLocator: " ABC123 ", flightNumber: "CM123", departureAt: "2026-10-20T08:00:00-06:00",
    }, 1)).toEqual({
      bookingLocator: "ABC123", flightNumber: "CM123", departureAt: "2026-10-20T14:00:00.000Z",
    });
  });

  it.each([
    ["LODGING", { propertyName: "Hotel Central", roomCount: 2, checkInAt: "2026-10-20T15:00:00.000Z" }],
    ["TOUR_ACTIVITY", { activityName: "Canopy", participantCount: 2, startAt: "2026-10-21T08:00:00.000Z" }],
    ["TRANSPORTATION", { pickupLocation: "SJO", dropoffLocation: "Hotel", pickupAt: "2026-10-20T10:00:00.000Z" }],
  ])("accepts valid %s v1 detail", (purpose, payload) => {
    expect(validateOperationalDetail(purpose, payload, 1)).toEqual(payload);
  });

  it.each([
    ["AIRFARE", { unknown: "no" }, 1, "OPERATIONAL_FULFILLMENT_DETAIL_PURPOSE_MISMATCH"],
    ["AIRFARE", { providerName: "Must remain a strong fulfillment field" }, 1, "OPERATIONAL_FULFILLMENT_DETAIL_PURPOSE_MISMATCH"],
    ["AIRFARE", { flightNumber: "CM123" }, 2, "OPERATIONAL_FULFILLMENT_DETAIL_VERSION_UNSUPPORTED"],
    ["LODGING", { flightNumber: "CM123" }, 1, "OPERATIONAL_FULFILLMENT_DETAIL_PURPOSE_MISMATCH"],
    ["TRANSPORTATION", { pickupAt: "not-a-date" }, 1, "OPERATIONAL_FULFILLMENT_DETAIL_INVALID"],
  ])("rejects malformed, incompatible, or unsupported typed detail", (purpose, payload, version, code) => {
    expect(() => validateOperationalDetail(purpose, payload, version)).toThrow(BadRequestException);
    try {
      validateOperationalDetail(purpose, payload, version);
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({ message: code });
    }
  });

  it("provides strict GENERIC compatibility without accepting arbitrary new JSON", () => {
    expect(resolveOperationalServicePurpose("unmapped-category")).toMatchObject({ code: "GENERIC" });
    expect(validateOperationalDetail("CUSTOM_QUOTATION", { serviceInstructions: "Call on arrival" }, 1))
      .toEqual({ serviceInstructions: "Call on arrival" });
    expect(() => validateOperationalDetail("GENERIC", { legacy: true }, 1)).toThrow(BadRequestException);
  });

  it("enriches one compatible payload, preserving omitted fields and allowing explicit replacement/clear", () => {
    expect(enrichOperationalDetail("AIRFARE", 1,
      { bookingLocator: "ABC123", flightNumber: "CM123", seat: "12A" },
      { seat: "14C", bookingLocator: null },
    )).toEqual({ flightNumber: "CM123", seat: "14C" });
  });

  it("rejects enrichment with an incompatible purpose or version", () => {
    expect(() => enrichOperationalDetail("LODGING", 1, { propertyName: "Hotel" }, { flightNumber: "CM123" }))
      .toThrow(BadRequestException);
    expect(() => enrichOperationalDetail("AIRFARE", 2, { flightNumber: "CM123" }, { seat: "12A" }))
      .toThrow(BadRequestException);
  });
});

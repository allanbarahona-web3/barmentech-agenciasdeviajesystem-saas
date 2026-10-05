import {
  OPERATIONAL_WORK_SOURCE_CATEGORIES,
  sourceTypesForOperationalWorkCategory,
} from "./operational-work-source-filter";

describe("Operational work source filter", () => {
  it("keeps ALL optional and maps only supported user-facing categories", () => {
    expect(OPERATIONAL_WORK_SOURCE_CATEGORIES).toEqual(["ALL", "BASE_TRIP", "ADDITIONAL_SERVICES"]);
    expect(sourceTypesForOperationalWorkCategory()).toBeUndefined();
    expect(sourceTypesForOperationalWorkCategory("ALL")).toBeUndefined();
    expect(sourceTypesForOperationalWorkCategory("BASE_TRIP")).toEqual(["TRAVEL_PACKAGE_COST_COMPONENT"]);
    expect(sourceTypesForOperationalWorkCategory("ADDITIONAL_SERVICES")).toEqual(["ADDITIONAL_SERVICE_ORDER_LINE"]);
  });

  it("does not remap historical source types into user-facing categories", () => {
    expect(sourceTypesForOperationalWorkCategory("BASE_TRIP")).not.toContain("CONTRACT");
    expect(sourceTypesForOperationalWorkCategory("BASE_TRIP")).not.toContain("MANUAL");
    expect(sourceTypesForOperationalWorkCategory("ADDITIONAL_SERVICES")).not.toContain("CONTRACT");
    expect(sourceTypesForOperationalWorkCategory("ADDITIONAL_SERVICES")).not.toContain("MANUAL");
  });
});

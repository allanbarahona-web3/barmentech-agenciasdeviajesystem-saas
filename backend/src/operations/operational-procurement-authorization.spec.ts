import { procurementAuthorizationForRequirement } from "./operational-procurement-authorization";

describe("procurementAuthorizationForRequirement", () => {
  it("authorizes a complete base component identity by source policy without a Finance result", () => {
    expect(procurementAuthorizationForRequirement({
      travelPackageId: "travel-a", sourceType: "TRAVEL_PACKAGE_COST_COMPONENT", sourceId: "project-a", sourceLineId: "component-a", sourceVersionId: "snapshot-a",
    })).toEqual({ kind: "AUTHORIZED_BY_SOURCE_POLICY", reason: "TRAVEL_PACKAGE_BASE_COMPONENT" });
  });

  it("retains Finance eligibility only for existing commercial sources and leaves manual history unavailable", () => {
    expect(procurementAuthorizationForRequirement({ travelPackageId: "travel-a", sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", sourceVersionId: null }))
      .toMatchObject({ kind: "FINANCE_ELIGIBILITY_REQUIRED", source: { sourceType: "ADDITIONAL_SERVICE_ORDER_LINE" } });
    expect(procurementAuthorizationForRequirement({ travelPackageId: "travel-a", sourceType: "MANUAL", sourceId: null, sourceLineId: null, sourceVersionId: null }))
      .toEqual({ kind: "UNAVAILABLE" });
  });
});

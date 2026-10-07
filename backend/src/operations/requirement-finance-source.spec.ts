import { commercialSourceRefKey, requirementToCommercialSourceRef } from "./requirement-finance-source";

describe("requirementToCommercialSourceRef", () => {
  const base = {
    travelPackageId: "trip-a",
    sourceType: "CONTRACT",
    sourceId: "contract-a",
    sourceLineId: null,
    sourceVersionId: null,
  };

  it("preserves Contract source identity without reconstructing commercial provenance", () => {
    expect(requirementToCommercialSourceRef(base)).toEqual({ sourceType: "CONTRACT", sourceId: "contract-a" });
  });

  it("preserves an Additional Service order/line identity and package scope", () => {
    expect(requirementToCommercialSourceRef({ ...base, sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", sourceVersionId: "3" }))
      .toEqual({ sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", versionId: "3", travelPackageId: "trip-a" });
  });

  it("preserves a standalone Custom Quotation version-line identity without package scope", () => {
    expect(requirementToCommercialSourceRef({
      ...base,
      travelPackageId: null,
      sourceType: "CUSTOM_QUOTATION_LINE",
      sourceId: "version-a",
      sourceLineId: "version-line-a",
    })).toEqual({
      sourceType: "CUSTOM_QUOTATION_LINE",
      sourceId: "version-a",
      sourceLineId: "version-line-a",
    });
  });

  it.each([
    { ...base, sourceType: "MANUAL", sourceId: null },
    { ...base, sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: null },
    { ...base, sourceType: "CUSTOM_QUOTATION", sourceId: "quotation-a" },
  ])("fails closed for unsupported or incomplete source snapshots", (requirement) => {
    expect(requirementToCommercialSourceRef(requirement)).toBeNull();
  });

  it("keys all source identity fields to avoid cross-source collisions", () => {
    const contract = requirementToCommercialSourceRef(base)!;
    const service = requirementToCommercialSourceRef({ ...base, sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "contract-a", sourceLineId: "line-a" })!;
    expect(commercialSourceRefKey(contract)).not.toBe(commercialSourceRefKey(service));
  });
});

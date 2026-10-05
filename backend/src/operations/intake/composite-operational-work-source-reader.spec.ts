import { CompositeOperationalWorkSourceReader } from "./composite-operational-work-source-reader";

describe("CompositeOperationalWorkSourceReader", () => {
  const reference = { tenantId: "tenant-a", travelPackageId: "travel-a", sourceId: "source-a", sourceLineId: "line-a" };

  it("preserves Additional Services dispatch", async () => {
    const additionalServices = { readSourceItem: jest.fn().mockResolvedValue({ source: "additional" }) };
    const baseComponents = { readSourceItem: jest.fn() };
    const reader = new CompositeOperationalWorkSourceReader(additionalServices as never, baseComponents as never);
    await expect(reader.readSourceItem({ ...reference, sourceType: "ADDITIONAL_SERVICE_ORDER_LINE" })).resolves.toEqual({ source: "additional" });
    expect(additionalServices.readSourceItem).toHaveBeenCalledTimes(1);
    expect(baseComponents.readSourceItem).not.toHaveBeenCalled();
  });

  it("routes package CostComponents by their distinct source identity", async () => {
    const additionalServices = { readSourceItem: jest.fn() };
    const baseComponents = { readSourceItem: jest.fn().mockResolvedValue({ source: "base" }) };
    const reader = new CompositeOperationalWorkSourceReader(additionalServices as never, baseComponents as never);
    await expect(reader.readSourceItem({ ...reference, sourceType: "TRAVEL_PACKAGE_COST_COMPONENT" })).resolves.toEqual({ source: "base" });
    expect(baseComponents.readSourceItem).toHaveBeenCalledTimes(1);
    expect(additionalServices.readSourceItem).not.toHaveBeenCalled();
  });
});

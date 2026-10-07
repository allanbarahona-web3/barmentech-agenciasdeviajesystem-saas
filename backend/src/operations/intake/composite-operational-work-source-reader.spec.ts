import { CompositeOperationalWorkSourceReader } from "./composite-operational-work-source-reader";

describe("CompositeOperationalWorkSourceReader", () => {
  const travelReference = { tenantId: "tenant-a", scopeType: "TRAVEL_PACKAGE" as const, travelPackageId: "travel-a", sourceId: "source-a", sourceLineId: "line-a" };
  const standaloneReference = { tenantId: "tenant-a", scopeType: "STANDALONE_CUSTOMER" as const, customerId: "customer-a", sourceId: "source-a", sourceLineId: "line-a" };

  it("preserves Additional Services dispatch", async () => {
    const additionalServices = { readSourceItem: jest.fn().mockResolvedValue({ source: "additional" }) };
    const baseComponents = { readSourceItem: jest.fn() };
    const customQuotationLines = { readSourceItem: jest.fn() };
    const reader = new CompositeOperationalWorkSourceReader(additionalServices as never, baseComponents as never, customQuotationLines as never);
    await expect(reader.readSourceItem({ ...travelReference, sourceType: "ADDITIONAL_SERVICE_ORDER_LINE" })).resolves.toEqual({ source: "additional" });
    expect(additionalServices.readSourceItem).toHaveBeenCalledTimes(1);
    expect(baseComponents.readSourceItem).not.toHaveBeenCalled();
    expect(customQuotationLines.readSourceItem).not.toHaveBeenCalled();
  });

  it("routes package CostComponents by their distinct source identity", async () => {
    const additionalServices = { readSourceItem: jest.fn() };
    const baseComponents = { readSourceItem: jest.fn().mockResolvedValue({ source: "base" }) };
    const customQuotationLines = { readSourceItem: jest.fn() };
    const reader = new CompositeOperationalWorkSourceReader(additionalServices as never, baseComponents as never, customQuotationLines as never);
    await expect(reader.readSourceItem({ ...travelReference, sourceType: "TRAVEL_PACKAGE_COST_COMPONENT" })).resolves.toEqual({ source: "base" });
    expect(baseComponents.readSourceItem).toHaveBeenCalledTimes(1);
    expect(additionalServices.readSourceItem).not.toHaveBeenCalled();
    expect(customQuotationLines.readSourceItem).not.toHaveBeenCalled();
  });

  it("routes immutable Custom Quotation Version Lines by their source identity", async () => {
    const additionalServices = { readSourceItem: jest.fn() };
    const baseComponents = { readSourceItem: jest.fn() };
    const customQuotationLines = { readSourceItem: jest.fn().mockResolvedValue({ source: "custom-quotation" }) };
    const reader = new CompositeOperationalWorkSourceReader(additionalServices as never, baseComponents as never, customQuotationLines as never);

    await expect(reader.readSourceItem({ ...standaloneReference, sourceType: "CUSTOM_QUOTATION_LINE" })).resolves.toEqual({ source: "custom-quotation" });
    expect(customQuotationLines.readSourceItem).toHaveBeenCalledTimes(1);
    expect(additionalServices.readSourceItem).not.toHaveBeenCalled();
    expect(baseComponents.readSourceItem).not.toHaveBeenCalled();
  });
});

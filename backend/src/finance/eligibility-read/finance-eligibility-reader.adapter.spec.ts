import { FinanceEligibilityReaderAdapter } from "./finance-eligibility-reader.adapter";

describe("FinanceEligibilityReaderAdapter", () => {
  it("dispatches Contract and Additional Service refs through their Finance-owned resolvers while preserving input order", async () => {
    const contracts = {
      readMany: jest.fn().mockResolvedValue([
        { source: { sourceType: "CONTRACT", sourceId: "contract-a" }, eligibility: "ELIGIBLE", reason: "SETTLED" },
      ]),
    };
    const additionalServices = {
      readMany: jest.fn().mockResolvedValue([
        { source: { sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", travelPackageId: "trip-a" }, eligibility: "BLOCKED", reason: "OUTSTANDING_BALANCE" },
      ]),
    };
    const adapter = new FinanceEligibilityReaderAdapter(
      contracts as never,
      additionalServices as never,
    );

    await expect(adapter.readMany({
      tenantId: "tenant-a",
      sources: [
        { sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", travelPackageId: "trip-a" },
        { sourceType: "CONTRACT", sourceId: "contract-a" },
        { sourceType: "CUSTOM_QUOTATION", sourceId: "quote-a" },
      ],
    })).resolves.toEqual([
      expect.objectContaining({ source: expect.objectContaining({ sourceType: "ADDITIONAL_SERVICE_ORDER_LINE" }), reason: "OUTSTANDING_BALANCE" }),
      expect.objectContaining({ source: expect.objectContaining({ sourceType: "CONTRACT" }), reason: "SETTLED" }),
      expect.objectContaining({ source: expect.objectContaining({ sourceType: "CUSTOM_QUOTATION" }), eligibility: "BLOCKED", reason: "FINANCIAL_DATA_MISSING" }),
    ]);
    expect(contracts.readMany).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      sources: [{ sourceType: "CONTRACT", sourceId: "contract-a" }],
    });
    expect(additionalServices.readMany).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      sources: [{ sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", travelPackageId: "trip-a" }],
    });
  });
});

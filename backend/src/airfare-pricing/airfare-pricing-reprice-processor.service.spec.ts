import { AirfarePricingRepriceProcessorService } from "./airfare-pricing-reprice-processor.service";

describe("AirfarePricingRepriceProcessorService", () => {
  let tx: any; let costs: any; let pricing: any; let travel: any; let service: AirfarePricingRepriceProcessorService;

  beforeEach(() => {
    tx = { $executeRaw: jest.fn(), $queryRaw: jest.fn((query: TemplateStringsArray) => query.join("").includes("airfare_daily_authorities") ? [{ currentRevisionId: "revision-a" }] : [request()]), airfarePricingRepriceRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) };
    costs = { read: jest.fn().mockResolvedValue({ authoritativeTotalCost: "1200.00000", baseCurrency: "USD" }) };
    pricing = { createAutomaticDraftIfHigher: jest.fn().mockResolvedValue({ id: "version-a" }), getCalculation: jest.fn().mockResolvedValue({ status: "DRAFT" }), approveCalculation: jest.fn().mockResolvedValue({ status: "APPROVED" }) };
    travel = { getPublicationContext: jest.fn().mockResolvedValue(context()), publish: jest.fn().mockResolvedValue({ publication: { id: "publication-a" } }) };
    service = new AirfarePricingRepriceProcessorService(prisma as never, costs, pricing, travel);
  });

  it("creates, system-approves, and upward-publishes one immutable version", async () => {
    await expect(service.process("tenant-a", "request-a")).resolves.toEqual({ kind: "COMPLETED", outcome: "PUBLISHED" });
    expect(pricing.createAutomaticDraftIfHigher).toHaveBeenCalledWith("tenant-a", "project-a", "1200.00000", "1363.71000", expect.objectContaining({ userId: "SYSTEM" }));
    expect(pricing.approveCalculation).toHaveBeenCalledWith("tenant-a", "version-a", expect.objectContaining({ userId: "SYSTEM", name: "Ajuste automático por tarifa aérea" }));
    expect(travel.publish).toHaveBeenCalledWith("tenant-a", "version-a", expect.objectContaining({ userId: "SYSTEM" }), true);
    expect(tx.airfarePricingRepriceRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ pricingCalculationVersionId: "version-a", status: "COMPLETED", outcome: "PUBLISHED" }) }));
  });

  it("completes equal/lower calculations without a version or publication", async () => {
    pricing.createAutomaticDraftIfHigher.mockResolvedValue(null);
    await expect(service.process("tenant-a", "request-a")).resolves.toEqual({ kind: "COMPLETED", outcome: "NO_INCREASE" });
    expect(pricing.approveCalculation).not.toHaveBeenCalled(); expect(travel.publish).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "LEGACY"])("does not bootstrap %s travel pricing", async (status) => {
    travel.getPublicationContext.mockResolvedValue({ ...context(), commercialPriceStatus: status, latestPublication: null, currentCommercialPrice: status === "PENDING" ? null : "1363.71000" });
    await expect(service.process("tenant-a", "request-a")).resolves.toEqual({ kind: "COMPLETED", outcome: "INELIGIBLE" });
    expect(pricing.createAutomaticDraftIfHigher).not.toHaveBeenCalled(); expect(travel.publish).not.toHaveBeenCalled();
  });

  it("supersedes a request when the authoritative total changed", async () => {
    costs.read.mockResolvedValue({ authoritativeTotalCost: "1201.00000", baseCurrency: "USD" });
    await expect(service.process("tenant-a", "request-a")).resolves.toEqual({ kind: "COMPLETED", outcome: "SUPERSEDED" });
    expect(pricing.createAutomaticDraftIfHigher).not.toHaveBeenCalled();
  });

  it("supersedes a request when its AIRFARE revision is no longer current", async () => {
    tx.$queryRaw.mockImplementation((query: TemplateStringsArray) => query.join("").includes("airfare_daily_authorities") ? [{ currentRevisionId: "revision-b" }] : [request()]);
    await expect(service.process("tenant-a", "request-a")).resolves.toEqual({ kind: "COMPLETED", outcome: "SUPERSEDED" });
    expect(pricing.createAutomaticDraftIfHigher).not.toHaveBeenCalled();
  });

  it("returns the existing terminal outcome on duplicate delivery", async () => {
    tx.$queryRaw.mockResolvedValue([{ ...request(), status: "COMPLETED", outcome: "PUBLISHED" }]);
    await expect(service.process("tenant-a", "request-a")).resolves.toEqual({ kind: "TERMINAL", status: "COMPLETED", outcome: "PUBLISHED" });
    expect(pricing.createAutomaticDraftIfHigher).not.toHaveBeenCalled();
  });

  it("releases transient failures for bounded retry without changing AIRFARE authority data", async () => {
    costs.read.mockRejectedValue(new Error("temporary database failure"));
    await expect(service.process("tenant-a", "request-a")).resolves.toEqual({ kind: "RETRY_SCHEDULED" });
    expect(tx.airfarePricingRepriceRequest.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING", failureCode: "AIRFARE_REPRICE_PROCESSING_FAILED" }) }));
  });
});

function request(overrides: Record<string, unknown> = {}) { return { id: "request-a", tenantId: "tenant-a", costingProjectId: "project-a", costComponentId: "component-a", airfareDailyAuthorityId: "authority-a", airfareDailyAuthorityRevisionId: "revision-a", costSnapshotId: "snapshot-a", revisionKind: "AGENT_INITIAL", authoritativeTotalAmount: "1200.00000", currency: "USD", status: "PENDING", attemptCount: 0, leaseUntil: null, claimToken: null, outcome: null, pricingCalculationVersionId: null, ...overrides }; }
function context() { return { commercialPriceStatus: "PRICING_PUBLISHED", currentCommercialPrice: "1363.71000", currency: "USD", baseCurrency: "USD", latestPublication: { id: "prior-publication", publishedPrice: "1363.71000", commercialFloorPrice: "1363.71000" } }; }

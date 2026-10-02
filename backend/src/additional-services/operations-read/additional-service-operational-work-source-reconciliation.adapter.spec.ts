import { AdditionalServiceOperationalWorkSourceReconciliationAdapter } from "./additional-service-operational-work-source-reconciliation.adapter";

describe("AdditionalServiceOperationalWorkSourceReconciliationAdapter", () => {
  const reference = { tenantId: "tenant-a", travelPackageId: "travel-a", sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a" };

  it("scans approved, non-cancelled source lines in a bounded deterministic page", async () => {
    const c = context();
    c.tx.additionalServiceOrderLine.findMany.mockResolvedValue([line("line-a"), line("line-b")]);
    const page = await c.adapter.scanApprovedSourceItems({ tenantId: "tenant-a", travelPackageId: "travel-a", limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe("line-a");
    expect(c.tx.additionalServiceOrderLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: "tenant-a", order: expect.objectContaining({ commercialStatus: "APPROVED", status: { not: "CANCELLED" } }) }),
      orderBy: { id: "asc" }, take: 2,
    }));
    expect(page.items[0].description).not.toContain("lodgingType");
    expect(page.items[0].description).toContain("Hotel con desayuno");
  });

  it.each([
    [undefined, "SOURCE_MISSING"],
    [line("line-a", { order: { ...order(), status: "CANCELLED" } }), "SOURCE_CANCELLED"],
    [line("line-a", { order: { ...order(), commercialStatus: "REJECTED" } }), "SOURCE_NOT_ELIGIBLE"],
    [line("line-a", { order: { ...order(), travelPackageId: "travel-b" } }), "PACKAGE_MISMATCH"],
  ])("inspects source validity without exposing source payloads", async (value, expected) => {
    const c = context();
    c.tx.additionalServiceOrderLine.findMany.mockResolvedValue(value === undefined ? [] : [value]);
    const result = await c.adapter.inspectSourceItems({ tenantId: "tenant-a", references: [reference] });
    expect(result.get("order-a\u0000line-a")).toMatchObject({ state: expected });
  });
});

function context() {
  const tx = { $executeRaw: jest.fn(), additionalServiceOrderLine: { findMany: jest.fn() } };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  return { tx, adapter: new AdditionalServiceOperationalWorkSourceReconciliationAdapter(prisma as never) };
}

function line(id: string, overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-a", id, serviceCode: "LODGING", serviceName: "Hospedaje", serviceDetailsVersion: 1,
    serviceDetails: { lodgingType: "HOTEL_WITH_BREAKFAST", checkInDate: "2026-10-18" },
    finalSellingPrice: { toString: () => "850.0000" }, quotationCurrency: "USD", participants: [{ clientId: "client-a" }],
    order: order(), ...overrides,
  };
}

function order() {
  return { id: "order-a", travelPackageId: "travel-a", commercialStatus: "APPROVED", status: "CONFIRMED", proposalApprovedAt: new Date("2026-10-01T12:00:00.000Z") };
}

import { TravelPackageCostComponentOperationalWorkSourceReconciliationAdapter } from "./travel-package-cost-component-operational-work-source-reconciliation.adapter";

describe("TravelPackageCostComponentOperationalWorkSourceReconciliationAdapter", () => {
  it("scans valid and archived linked components by deterministic bounded keyset", async () => {
    const c = context();
    c.tx.costComponent.findMany.mockResolvedValue([component(), component({ id: "component-b", status: "ARCHIVED" }), component({ id: "component-c" })]);

    const page = await c.adapter.scanSources({ tenantId: "tenant-a", travelPackageId: "travel-a", cursor: "component-0", limit: 2 });
    expect(page).toMatchObject({
      nextCursor: "component-b",
      sources: [
        expect.objectContaining({ state: "VALID", reference: expect.objectContaining({ sourceId: "project-a", sourceLineId: "component-a" }) }),
        expect.objectContaining({ state: "SOURCE_INACTIVE", reference: expect.objectContaining({ sourceLineId: "component-b" }) }),
      ],
    });
    expect(c.tx.costComponent.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.costComponent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: "tenant-a", id: { gt: "component-0" } }),
      orderBy: { id: "asc" }, take: 3,
    }));
  });

  it("does not make an active component actionable without a current matching-currency snapshot", async () => {
    const c = context();
    c.tx.costComponent.findMany.mockResolvedValue([component({ currentSnapshotId: null, currentSnapshot: null })]);
    await expect(c.adapter.scanSources({ tenantId: "tenant-a", limit: 25 })).resolves.toMatchObject({
      sources: [expect.objectContaining({ state: "SOURCE_NOT_ELIGIBLE", item: null })],
    });
  });
});

function context() {
  const tx = { $executeRaw: jest.fn(), costComponent: { findMany: jest.fn() } };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  return { tx, adapter: new TravelPackageCostComponentOperationalWorkSourceReconciliationAdapter(prisma as never) };
}

function component(overrides: Record<string, unknown> = {}) {
  return {
    id: "component-a", costingProjectId: "project-a", title: "Hotel Central", description: "Four nights",
    detailPayload: { rooms: 2 }, detailSchemaVersion: 1, quantity: { toString: () => "4.00000" }, unit: "night",
    status: "ACTIVE", currentSnapshotId: "snapshot-a", costCategory: { code: "LODGING", displayName: "Lodging" },
    costSupplier: { id: "supplier-a", name: "Hotel Central" }, currentSnapshot: { id: "snapshot-a", amount: { toString: () => "810.25000" }, currency: "USD" },
    costingProject: { baseCurrency: "USD", travelPackageLinks: [{ travelPackageId: "travel-a" }] },
    ...overrides,
  };
}

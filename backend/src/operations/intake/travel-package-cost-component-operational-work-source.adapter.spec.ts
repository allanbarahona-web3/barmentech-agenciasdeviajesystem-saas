import { TravelPackageCostComponentOperationalWorkSourceAdapter } from "./travel-package-cost-component-operational-work-source.adapter";

describe("TravelPackageCostComponentOperationalWorkSourceAdapter", () => {
  const reference = {
    tenantId: "tenant-a",
    scopeType: "TRAVEL_PACKAGE" as const,
    travelPackageId: "travel-a",
    sourceType: "TRAVEL_PACKAGE_COST_COMPONENT",
    sourceId: "project-a",
    sourceLineId: "component-a",
  };

  it("maps one active component to the neutral base Operations source without fabricating sold value", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue(travelPackage());
    c.tx.costComponent.findFirst.mockResolvedValue(component());
    c.tx.costingProject.findFirst.mockResolvedValue({ id: "project-a", baseCurrency: "USD" });

    await expect(c.adapter.readSourceItem(reference)).resolves.toEqual(expect.objectContaining({
      ...reference,
      sourceVersionId: "snapshot-a",
      servicePurposeCode: "LODGING",
      servicePurposeName: "Lodging",
      participantClientIds: [],
      participantScope: "ALL_CONTRACTED_TRAVEL_PACKAGE_PARTICIPANTS",
      soldValueScope: "NONE",
      soldValue: null,
      sourceSnapshot: {
        travelPackageId: "travel-a",
        costingProjectId: "project-a",
        costComponentId: "component-a",
        category: { code: "LODGING", displayName: "Lodging" },
        title: "Hotel Central",
        description: "Four nights",
        structuredDetails: { rooms: 2 },
        detailSchemaVersion: 1,
        quantity: "4.00000",
        unit: "night",
        supplier: { id: "supplier-a", name: "Hotel Central" },
        currentCostSnapshotId: "snapshot-a",
        currentInternalCost: { amount: "810.25000", currency: "USD" },
      },
    }));
    expect((c.tx as Record<string, unknown>).costSnapshot).toBeUndefined();
    expect((c.tx as Record<string, unknown>).costSupplier).toBeUndefined();
    expect(c.tx.costComponent.findFirst).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing tenant package", null, component(), { id: "project-a", baseCurrency: "USD" }, "SOURCE_NOT_FOUND"],
    ["wrong package/project link", travelPackage({ costingProjectLinks: [] }), component(), { id: "project-a", baseCurrency: "USD" }, "PACKAGE_MISMATCH"],
    ["component from another project", travelPackage(), null, { id: "project-a", baseCurrency: "USD" }, "SOURCE_NOT_FOUND"],
    ["archived component", travelPackage(), component({ status: "ARCHIVED" }), { id: "project-a", baseCurrency: "USD" }, "SOURCE_NOT_ELIGIBLE"],
    ["missing current snapshot", travelPackage(), component({ currentSnapshotId: null, currentSnapshot: null }), { id: "project-a", baseCurrency: "USD" }, "SOURCE_NOT_ELIGIBLE"],
    ["mismatched project currency", travelPackage(), component(), { id: "project-a", baseCurrency: "CRC" }, "SOURCE_NOT_ELIGIBLE"],
  ])("rejects %s", async (_caseName, packageRow, componentRow, project, code) => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue(packageRow);
    c.tx.costComponent.findFirst.mockResolvedValue(componentRow);
    c.tx.costingProject.findFirst.mockResolvedValue(project);
    await expect(c.adapter.readSourceItem(reference)).rejects.toMatchObject({ code });
  });

  it("keeps tenant predicates on package, link, component, and project reads", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue(travelPackage());
    c.tx.costComponent.findFirst.mockResolvedValue(component());
    c.tx.costingProject.findFirst.mockResolvedValue({ id: "project-a", baseCurrency: "USD" });
    await c.adapter.readSourceItem(reference);
    expect(c.tx.travelPackage.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "travel-a", tenantId: "tenant-a" }),
    }));
    expect(c.tx.costComponent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "component-a", tenantId: "tenant-a", costingProjectId: "project-a" }),
    }));
    expect(c.tx.costingProject.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "project-a", tenantId: "tenant-a" },
    }));
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn(),
    travelPackage: { findFirst: jest.fn() },
    costComponent: { findFirst: jest.fn() },
    costingProject: { findFirst: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  return { tx, adapter: new TravelPackageCostComponentOperationalWorkSourceAdapter(prisma as never) };
}

function travelPackage(overrides: Record<string, unknown> = {}) {
  return { id: "travel-a", costingProjectLinks: [{ costingProjectId: "project-a" }], ...overrides };
}

function component(overrides: Record<string, unknown> = {}) {
  return {
    id: "component-a", costingProjectId: "project-a", title: "Hotel Central", description: "Four nights",
    detailPayload: { rooms: 2 }, detailSchemaVersion: 1, quantity: { toString: () => "4.00000" }, unit: "night",
    status: "ACTIVE", currentSnapshotId: "snapshot-a", costCategory: { code: "LODGING", displayName: "Lodging" },
    costSupplier: { id: "supplier-a", name: "Hotel Central" },
    currentSnapshot: { id: "snapshot-a", amount: { toString: () => "810.25000" }, currency: "USD" },
    ...overrides,
  };
}

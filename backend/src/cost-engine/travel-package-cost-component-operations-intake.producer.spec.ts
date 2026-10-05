import { TravelPackageCostComponentOperationsIntakeProducer } from "./travel-package-cost-component-operations-intake.producer";

describe("TravelPackageCostComponentOperationsIntakeProducer", () => {
  it("persists one pending event for an eligible active TravelPackage CostComponent", async () => {
    const c = context();
    c.tx.costComponent.findMany.mockResolvedValue([component()]);
    c.tx.travelPackageCostingProjectLink.findMany.mockResolvedValue([link()]);
    c.tx.operationsIntakeOutboxEvent.createMany.mockResolvedValue({ count: 1 });

    await expect(c.producer.persistEligibleComponent(c.tx as never, "tenant-a", "component-a")).resolves.toBe(1);
    expect(c.tx.operationsIntakeOutboxEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        tenantId: "tenant-a", travelPackageId: "travel-a", eventType: "SOURCE_ITEM_APPROVED", eventVersion: 1,
        sourceType: "TRAVEL_PACKAGE_COST_COMPONENT", sourceId: "project-a", sourceLineId: "component-a",
        sourceVersionId: "snapshot-a", availableAt: new Date("2026-10-04T12:00:00.000Z"),
      })],
      skipDuplicates: true,
    });
  });

  it("uses one bounded createMany operation for multiple valid components and is idempotent", async () => {
    const c = context();
    c.tx.costComponent.findMany.mockResolvedValue([component(), component({ id: "component-b" })]);
    c.tx.travelPackageCostingProjectLink.findMany.mockResolvedValue([link()]);
    c.tx.operationsIntakeOutboxEvent.createMany.mockResolvedValue({ count: 0 });

    await expect(c.producer.persistEligibleComponents(c.tx as never, "tenant-a", ["component-a", "component-b", "component-a"])).resolves.toBe(0);
    expect(c.tx.operationsIntakeOutboxEvent.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [
        expect.objectContaining({ sourceLineId: "component-a" }),
        expect.objectContaining({ sourceLineId: "component-b" }),
      ],
      skipDuplicates: true,
    }));
    expect(c.tx.costComponent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: "tenant-a", status: "ACTIVE", currentSnapshotId: { not: null } }),
    }));
  });

  it.each([
    ["wrong tenant or component", [], [link()]],
    ["not TravelPackage-linked", [component()], []],
    ["missing current snapshot", [component({ currentSnapshot: null })], [link()]],
    ["mismatched base currency", [component({ currentSnapshot: { id: "snapshot-a", currency: "CRC", capturedAt: new Date("2026-10-04T12:00:00.000Z") } })], [link()]],
  ])("does not enqueue %s", async (_caseName, components, links) => {
    const c = context();
    c.tx.costComponent.findMany.mockResolvedValue(components);
    c.tx.travelPackageCostingProjectLink.findMany.mockResolvedValue(links);
    await expect(c.producer.persistEligibleComponent(c.tx as never, "tenant-a", "component-a")).resolves.toBe(0);
    expect(c.tx.operationsIntakeOutboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("does not read a passenger roster or Finance source while producing events", async () => {
    const c = context();
    c.tx.costComponent.findMany.mockResolvedValue([component()]);
    c.tx.travelPackageCostingProjectLink.findMany.mockResolvedValue([link()]);
    c.tx.operationsIntakeOutboxEvent.createMany.mockResolvedValue({ count: 1 });
    await c.producer.persistEligibleComponent(c.tx as never, "tenant-a", "component-a");
    expect((c.tx as Record<string, unknown>).travelPackageParticipant).toBeUndefined();
    expect((c.tx as Record<string, unknown>).commercialObligation).toBeUndefined();
  });
});

function context() {
  const tx = {
    costComponent: { findMany: jest.fn() },
    travelPackageCostingProjectLink: { findMany: jest.fn() },
    operationsIntakeOutboxEvent: { createMany: jest.fn() },
  };
  return { tx, producer: new TravelPackageCostComponentOperationsIntakeProducer() };
}

function component(overrides: Record<string, unknown> = {}) {
  return {
    id: "component-a", costingProjectId: "project-a",
    currentSnapshot: { id: "snapshot-a", currency: "USD", capturedAt: new Date("2026-10-04T12:00:00.000Z") },
    costingProject: { baseCurrency: "USD" },
    ...overrides,
  };
}

function link() {
  return { costingProjectId: "project-a", travelPackage: { id: "travel-a" } };
}

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
    expect(c.tx.travelPackageParticipant.findMany).not.toHaveBeenCalled();
    expect((c.tx as Record<string, unknown>).commercialObligation).toBeUndefined();
  });

  it("queues a pre-existing eligible component after reservation approval makes a contracted roster available", async () => {
    const c = context();
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    c.tx.costComponent.findMany
      .mockResolvedValueOnce([component()])
      .mockResolvedValueOnce([component()]);
    c.tx.travelPackageCostingProjectLink.findMany.mockResolvedValue([link()]);
    c.tx.operationsIntakeOutboxEvent.createMany.mockResolvedValue({ count: 1 });
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([]);
    c.tx.operationalRequirement.findMany.mockResolvedValue([]);

    await expect(c.producer.reconcileAfterContractedRoster(c.tx as never, "tenant-a", "travel-a"))
      .resolves.toEqual({ eligibleComponents: 1, eventsCreated: 1, eventsRequeued: 0 });

    expect(c.tx.operationsIntakeOutboxEvent.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        travelPackageId: "travel-a",
        sourceType: "TRAVEL_PACKAGE_COST_COMPONENT",
        sourceId: "project-a",
        sourceLineId: "component-a",
      })],
    }));
    expect((c.tx as Record<string, unknown>).billingDocument).toBeUndefined();
    expect((c.tx as Record<string, unknown>).operationalRequirement).toBeDefined();
  });

  it("queues every eligible AIRFARE component for the newly contracted roster", async () => {
    const c = context();
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    c.tx.costComponent.findMany
      .mockResolvedValueOnce([component(), component({ id: "component-b", currentSnapshot: { id: "snapshot-b", currency: "USD", capturedAt: new Date("2026-10-04T12:00:00.000Z") } })])
      .mockResolvedValueOnce([component(), component({ id: "component-b", currentSnapshot: { id: "snapshot-b", currency: "USD", capturedAt: new Date("2026-10-04T12:00:00.000Z") } })]);
    c.tx.travelPackageCostingProjectLink.findMany.mockResolvedValue([link()]);
    c.tx.operationsIntakeOutboxEvent.createMany.mockResolvedValue({ count: 2 });
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([]);
    c.tx.operationalRequirement.findMany.mockResolvedValue([]);

    await expect(c.producer.reconcileAfterContractedRoster(c.tx as never, "tenant-a", "travel-a"))
      .resolves.toEqual({ eligibleComponents: 2, eventsCreated: 2, eventsRequeued: 0 });

    expect(c.tx.operationsIntakeOutboxEvent.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ sourceLineId: "component-a" }),
        expect.objectContaining({ sourceLineId: "component-b" }),
      ]),
    }));
  });

  it("requeues a processed source only when the contracted roster has a missing requirement assignment", async () => {
    const c = context();
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }, { id: "participant-b" }]);
    c.tx.costComponent.findMany
      .mockResolvedValueOnce([component()])
      .mockResolvedValueOnce([component()]);
    c.tx.travelPackageCostingProjectLink.findMany.mockResolvedValue([link()]);
    c.tx.operationsIntakeOutboxEvent.createMany.mockResolvedValue({ count: 0 });
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([{ id: "event-a", sourceId: "project-a", sourceLineId: "component-a", status: "PROCESSED", lastError: null }]);
    c.tx.operationalRequirement.findMany.mockResolvedValue([{ id: "requirement-a", sourceId: "project-a", sourceLineId: "component-a" }]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([{ operationalRequirementId: "requirement-a", travelPackageParticipantId: "participant-a" }]);
    c.tx.operationsIntakeOutboxEvent.updateMany.mockResolvedValue({ count: 1 });

    await expect(c.producer.reconcileAfterContractedRoster(c.tx as never, "tenant-a", "travel-a"))
      .resolves.toEqual({ eligibleComponents: 1, eventsCreated: 0, eventsRequeued: 1 });

    expect(c.tx.operationsIntakeOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["event-a"] }, OR: expect.any(Array) }),
      data: expect.objectContaining({ status: "PENDING", attemptCount: 0 }),
    }));
    expect((c.tx as Record<string, unknown>).operationalRequirementPassenger).toBeDefined();
    expect((c.tx as Record<string, unknown>).operationalFulfillment).toBeUndefined();
    expect((c.tx as Record<string, unknown>).operationalPurchase).toBeUndefined();
    expect((c.tx as Record<string, unknown>).operationalEvidence).toBeUndefined();
  });

  it("does not replay a processed event when every contracted participant is already assigned", async () => {
    const c = context();
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }, { id: "participant-b" }]);
    c.tx.costComponent.findMany
      .mockResolvedValueOnce([component()])
      .mockResolvedValueOnce([component()]);
    c.tx.travelPackageCostingProjectLink.findMany.mockResolvedValue([link()]);
    c.tx.operationsIntakeOutboxEvent.createMany.mockResolvedValue({ count: 0 });
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([{ id: "event-a", sourceId: "project-a", sourceLineId: "component-a", status: "PROCESSED", lastError: null }]);
    c.tx.operationalRequirement.findMany.mockResolvedValue([{ id: "requirement-a", sourceId: "project-a", sourceLineId: "component-a" }]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([
      { operationalRequirementId: "requirement-a", travelPackageParticipantId: "participant-a" },
      { operationalRequirementId: "requirement-a", travelPackageParticipantId: "participant-b" },
    ]);

    await expect(c.producer.reconcileAfterContractedRoster(c.tx as never, "tenant-a", "travel-a"))
      .resolves.toEqual({ eligibleComponents: 1, eventsCreated: 0, eventsRequeued: 0 });

    expect(c.tx.operationsIntakeOutboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it("requeues a legacy pending roster retry immediately after the roster exists", async () => {
    const c = context();
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }, { id: "participant-b" }]);
    c.tx.costComponent.findMany
      .mockResolvedValueOnce([component()])
      .mockResolvedValueOnce([component()]);
    c.tx.travelPackageCostingProjectLink.findMany.mockResolvedValue([link()]);
    c.tx.operationsIntakeOutboxEvent.createMany.mockResolvedValue({ count: 0 });
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([{
      id: "event-a", sourceId: "project-a", sourceLineId: "component-a", status: "PENDING", lastError: "PARTICIPANT_NOT_FOUND: 0 participant(s) missing",
    }]);
    c.tx.operationalRequirement.findMany.mockResolvedValue([{ id: "requirement-a", sourceId: "project-a", sourceLineId: "component-a" }]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([{ operationalRequirementId: "requirement-a", travelPackageParticipantId: "participant-a" }]);
    c.tx.operationsIntakeOutboxEvent.updateMany.mockResolvedValue({ count: 1 });

    await expect(c.producer.reconcileAfterContractedRoster(c.tx as never, "tenant-a", "travel-a"))
      .resolves.toEqual({ eligibleComponents: 1, eventsCreated: 0, eventsRequeued: 1 });

    expect(c.tx.operationsIntakeOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["event-a"] }, OR: expect.any(Array) }),
      data: expect.objectContaining({ status: "PENDING", attemptCount: 0, lastError: null }),
    }));
  });

  it("does not enqueue inactive components during roster reconciliation", async () => {
    const c = context();
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    c.tx.costComponent.findMany.mockResolvedValue([]);

    await expect(c.producer.reconcileAfterContractedRoster(c.tx as never, "tenant-a", "travel-a"))
      .resolves.toEqual({ eligibleComponents: 0, eventsCreated: 0, eventsRequeued: 0 });

    expect(c.tx.operationsIntakeOutboxEvent.createMany).not.toHaveBeenCalled();
    expect(c.tx.operationsIntakeOutboxEvent.updateMany).not.toHaveBeenCalled();
  });
});

function context() {
  const tx = {
    costComponent: { findMany: jest.fn() },
    travelPackageCostingProjectLink: { findMany: jest.fn() },
    travelPackageParticipant: { findMany: jest.fn() },
    operationalRequirement: { findMany: jest.fn() },
    operationalRequirementPassenger: { findMany: jest.fn() },
    operationsIntakeOutboxEvent: { createMany: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
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

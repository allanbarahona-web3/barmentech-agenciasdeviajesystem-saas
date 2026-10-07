import { OperationsIntakeReconciliationService } from "./operations-intake-reconciliation.service";
import type { TravelPackageOperationalWorkSourceItem } from "./operational-work-source-reader.port";

describe("TravelPackage base Operations reconciliation", () => {
  it("reports missing intake in dry-run without writes and repairs through one normal pending event", async () => {
    const c = context();
    c.tx.operationalRequirement.findMany.mockResolvedValue([]);
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([]);

    const dryRun = await c.service.reconcileTravelPackageBaseComponents({ tenantId: "tenant-a" });
    expect(dryRun.items[0]).toMatchObject({ state: "MISSING_INTAKE" });
    expect(dryRun.summary).toMatchObject({ scanned: 1, missingIntake: 1, eventsCreated: 0 });
    expect(c.tx.operationsIntakeOutboxEvent.createMany).not.toHaveBeenCalled();

    c.tx.operationsIntakeOutboxEvent.createMany.mockResolvedValue({ count: 1 });
    const repaired = await c.service.reconcileTravelPackageBaseComponents({ tenantId: "tenant-a", dryRun: false });
    expect(repaired.summary.eventsCreated).toBe(1);
    expect(c.tx.operationsIntakeOutboxEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        tenantId: "tenant-a", travelPackageId: "travel-a", eventType: "SOURCE_ITEM_APPROVED",
        sourceType: "TRAVEL_PACKAGE_COST_COMPONENT", sourceId: "project-a", sourceLineId: "component-a",
      })],
      skipDuplicates: true,
    });
  });

  it("uses the durable source identity so repeated missing-intake repair cannot duplicate an event", async () => {
    const c = context();
    c.tx.operationalRequirement.findMany.mockResolvedValue([]);
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([]);
    c.tx.operationsIntakeOutboxEvent.createMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await c.service.reconcileTravelPackageBaseComponents({ tenantId: "tenant-a", dryRun: false });
    const replay = await c.service.reconcileTravelPackageBaseComponents({ tenantId: "tenant-a", dryRun: false });
    expect(replay.summary.eventsCreated).toBe(0);
    expect(c.tx.operationsIntakeOutboxEvent.createMany).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["PENDING", "IN_FLIGHT"],
    ["PROCESSING", "IN_FLIGHT"],
    ["FAILED", "FAILED"],
    ["PROCESSED", "INCONSISTENT"],
  ])("classifies %s event state without duplicate intake", async (status, state) => {
    const c = context();
    c.tx.operationalRequirement.findMany.mockResolvedValue([]);
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([event({ status })]);
    const result = await c.service.reconcileTravelPackageBaseComponents({ tenantId: "tenant-a", dryRun: false });
    expect(result.items[0]).toMatchObject({ state });
    expect(c.tx.operationsIntakeOutboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("classifies a current requirement as healthy without touching execution records", async () => {
    const c = context({ roster: [{ id: "participant-a", clientId: "client-a" }] });
    c.tx.operationalRequirement.findMany.mockResolvedValue([requirement()]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([{ operationalRequirementId: "requirement-a", travelPackageParticipantId: "participant-a" }]);
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([event({ status: "PROCESSED" })]);

    await expect(c.service.reconcileTravelPackageBaseComponents({ tenantId: "tenant-a" })).resolves.toMatchObject({
      items: [expect.objectContaining({ state: "HEALTHY", operationalRequirementId: "requirement-a" })],
    });
    expect((c.tx as Record<string, unknown>).operationalFulfillment).toBeUndefined();
    expect((c.tx as Record<string, unknown>).operationalPurchase).toBeUndefined();
    expect((c.tx as Record<string, unknown>).operationalEvidence).toBeUndefined();
  });

  it("reports passenger expansion and safely replays the same processed event", async () => {
    const c = context({ roster: [{ id: "participant-a", clientId: "client-a" }, { id: "participant-b", clientId: "client-b" }] });
    c.tx.operationalRequirement.findMany.mockResolvedValue([requirement()]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([{ operationalRequirementId: "requirement-a", travelPackageParticipantId: "participant-a" }]);
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([event({ status: "PROCESSED" })]);
    c.tx.operationsIntakeOutboxEvent.updateMany.mockResolvedValue({ count: 1 });

    const result = await c.service.reconcileTravelPackageBaseComponents({ tenantId: "tenant-a", dryRun: false });
    expect(result.items[0].state).toBe("PASSENGER_EXPANSION");
    expect(result.summary.eventsReplayed).toBe(1);
    expect(c.tx.operationsIntakeOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["event-a"] }, status: "PROCESSED" }),
      data: expect.objectContaining({ status: "PENDING", attemptCount: 0 }),
    }));
    expect((c.tx.operationalRequirementPassenger as Record<string, unknown>).createMany).toBeUndefined();
  });

  it("reports passenger contraction only", async () => {
    const c = context({ roster: [{ id: "participant-a", clientId: "client-a" }] });
    c.tx.operationalRequirement.findMany.mockResolvedValue([requirement()]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([
      { operationalRequirementId: "requirement-a", travelPackageParticipantId: "participant-a" },
      { operationalRequirementId: "requirement-a", travelPackageParticipantId: "participant-b" },
    ]);
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([event({ status: "PROCESSED" })]);
    const result = await c.service.reconcileTravelPackageBaseComponents({ tenantId: "tenant-a", dryRun: false });
    expect(result.items[0]).toMatchObject({ state: "PASSENGER_CONTRACTION", issueCode: "PASSENGER_SCOPE_CONTRACTION" });
    expect(c.tx.operationsIntakeOutboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it("reports deterministic descriptive and CostSnapshot drift without rewriting the persisted snapshot", async () => {
    const c = context({ roster: [{ id: "participant-a", clientId: "client-a" }], source: baseSource({ sourceSnapshot: {
      ...snapshot(), title: "Renamed Hotel", description: "Five nights", structuredDetails: { rooms: 3 }, quantity: "5.00000", unit: "stay",
      supplier: { id: "supplier-b", name: "New Hotel" }, currentCostSnapshotId: "snapshot-b", currentInternalCost: { amount: "999.25000", currency: "USD" },
    } }) });
    c.tx.operationalRequirement.findMany.mockResolvedValue([requirement()]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([{ operationalRequirementId: "requirement-a", travelPackageParticipantId: "participant-a" }]);
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([event({ status: "PROCESSED" })]);
    const result = await c.service.reconcileTravelPackageBaseComponents({ tenantId: "tenant-a", dryRun: false });
    expect(result.items[0]).toMatchObject({ state: "SOURCE_DRIFT", changedFields: [
      "title", "description", "structuredDetails", "quantity", "unit", "supplier", "currentCostSnapshotId", "currentInternalCost",
    ] });
    expect((c.tx.operationalRequirement as Record<string, unknown>).updateMany).toBeUndefined();
  });

  it("keeps legacy null snapshots unavailable and reports archived sources without repair", async () => {
    const legacy = context({ roster: [{ id: "participant-a", clientId: "client-a" }] });
    legacy.tx.operationalRequirement.findMany.mockResolvedValue([requirement({ sourceSnapshot: null })]);
    legacy.tx.operationalRequirementPassenger.findMany.mockResolvedValue([]);
    legacy.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([event({ status: "PROCESSED" })]);
    await expect(legacy.service.reconcileTravelPackageBaseComponents({ tenantId: "tenant-a", dryRun: false })).resolves.toMatchObject({
      items: [expect.objectContaining({ state: "SNAPSHOT_UNAVAILABLE", issueCode: "SNAPSHOT_UNAVAILABLE" })],
    });

    const archived = context({ state: "SOURCE_INACTIVE" });
    archived.tx.operationalRequirement.findMany.mockResolvedValue([requirement()]);
    archived.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([event({ status: "PROCESSED" })]);
    await expect(archived.service.reconcileTravelPackageBaseComponents({ tenantId: "tenant-a", dryRun: false })).resolves.toMatchObject({
      items: [expect.objectContaining({ state: "SOURCE_INACTIVE", issueCode: "ARCHIVED_SOURCE" })],
    });
    expect(archived.tx.operationsIntakeOutboxEvent.updateMany).not.toHaveBeenCalled();
  });
});

function context(input: { source?: TravelPackageOperationalWorkSourceItem; state?: "VALID" | "SOURCE_INACTIVE"; roster?: Array<{ id: string; clientId: string }> } = {}) {
  const source = input.source ?? baseSource();
  const tx = {
    $executeRaw: jest.fn(),
    operationalRequirement: { findMany: jest.fn().mockResolvedValue([]) },
    operationalRequirementPassenger: { findMany: jest.fn().mockResolvedValue([]) },
    operationsIntakeOutboxEvent: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn(), updateMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  const baseSourceReader = { scanSources: jest.fn().mockResolvedValue({
    sources: [{ reference: source, state: input.state ?? "VALID", item: input.state === "SOURCE_INACTIVE" ? null : source }], nextCursor: null,
  }) };
  const rosterReader = { readContractedRoster: jest.fn(), readContractedRosters: jest.fn().mockResolvedValue(new Map([["travel-a", input.roster ?? []]])) };
  const additionalReader = { scanApprovedSourceItems: jest.fn(), inspectSourceItems: jest.fn() };
  const sourceReader = { readSourceItem: jest.fn() };
  return {
    tx,
    service: new OperationsIntakeReconciliationService(prisma as never, additionalReader as never, sourceReader, baseSourceReader as never, rosterReader),
  };
}

function baseSource(overrides: Partial<TravelPackageOperationalWorkSourceItem> = {}): TravelPackageOperationalWorkSourceItem {
  return {
    tenantId: "tenant-a", scopeType: "TRAVEL_PACKAGE", travelPackageId: "travel-a", sourceType: "TRAVEL_PACKAGE_COST_COMPONENT", sourceId: "project-a", sourceLineId: "component-a",
    sourceVersionId: "snapshot-a", sourceReference: null, sourceAcceptedAt: null,
    servicePurposeCode: "LODGING", servicePurposeName: "Lodging", description: "Hotel Central · Four nights",
    participantClientIds: [], participantScope: "ALL_CONTRACTED_TRAVEL_PACKAGE_PARTICIPANTS", sourceSnapshot: snapshot(), soldValueScope: "NONE", soldValue: null,
    ...overrides,
  };
}

function snapshot() {
  return {
    travelPackageId: "travel-a", costingProjectId: "project-a", costComponentId: "component-a",
    category: { code: "LODGING", displayName: "Lodging" }, title: "Hotel Central", description: "Four nights",
    structuredDetails: { rooms: 2 }, detailSchemaVersion: 1, quantity: "4.00000", unit: "night",
    supplier: { id: "supplier-a", name: "Hotel Central" }, currentCostSnapshotId: "snapshot-a",
    currentInternalCost: { amount: "810.25000", currency: "USD" },
  };
}

function requirement(overrides: Record<string, unknown> = {}) {
  return { id: "requirement-a", travelPackageId: "travel-a", sourceId: "project-a", sourceLineId: "component-a", sourceSnapshot: snapshot(), ...overrides };
}

function event(overrides: Record<string, unknown> = {}) {
  return { id: "event-a", travelPackageId: "travel-a", sourceId: "project-a", sourceLineId: "component-a", status: "PENDING", ...overrides };
}

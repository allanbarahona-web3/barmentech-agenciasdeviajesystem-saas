import { OperationsIntakeReconciliationService } from "./operations-intake-reconciliation.service";
import { OperationalWorkMaterializationError, type OperationalWorkSourceItem } from "./operational-work-source-reader.port";

describe("OperationsIntakeReconciliationService", () => {
  const source = sourceItem();

  it("reports missing approved work in dry-run without writing an outbox event", async () => {
    const c = context({ sourceItems: [source] });
    c.tx.operationalRequirement.findMany.mockResolvedValue([]);
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([]);
    const result = await c.service.reconcileAdditionalServices({ tenantId: "tenant-a", dryRun: true });
    expect(result.summary).toMatchObject({ scanned: 1, missingWork: 1, eventsCreated: 0 });
    expect(result.items[0]).toMatchObject({ state: "MISSING_OPERATIONAL_WORK" });
    expect(c.tx.operationsIntakeOutboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("backfills one neutral event in a bounded idempotent batch", async () => {
    const c = context({ sourceItems: [source] });
    c.tx.operationalRequirement.findMany.mockResolvedValue([]);
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([]);
    c.tx.operationsIntakeOutboxEvent.createMany.mockResolvedValue({ count: 1 });
    const result = await c.service.reconcileAdditionalServices({ tenantId: "tenant-a", dryRun: false, limit: 25 });
    expect(result.summary.eventsCreated).toBe(1);
    expect(c.tx.operationsIntakeOutboxEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        tenantId: "tenant-a", travelPackageId: "travel-a", eventType: "SOURCE_ITEM_APPROVED",
        sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a",
      })],
      skipDuplicates: true,
    });
    expect(c.tx.operationsIntakeOutboxEvent.createMany).toHaveBeenCalledTimes(1);
  });

  it("reports zero new events when a repeated backfill hits the durable unique identity", async () => {
    const c = context({ sourceItems: [source] });
    c.tx.operationalRequirement.findMany.mockResolvedValue([]);
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([]);
    c.tx.operationsIntakeOutboxEvent.createMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await c.service.reconcileAdditionalServices({ tenantId: "tenant-a", dryRun: false });
    const replay = await c.service.reconcileAdditionalServices({ tenantId: "tenant-a", dryRun: false });
    expect(replay.summary.eventsCreated).toBe(0);
    expect(c.tx.operationsIntakeOutboxEvent.createMany).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["PENDING", "IN_FLIGHT"],
    ["PROCESSING", "IN_FLIGHT"],
    ["FAILED", "FAILED_INTAKE"],
    ["PROCESSED", "PROCESSED_WITHOUT_WORK"],
  ])("classifies existing %s outbox state without duplicating it", async (status, state) => {
    const c = context({ sourceItems: [source] });
    c.tx.operationalRequirement.findMany.mockResolvedValue([]);
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([outbox({ status })]);
    const result = await c.service.reconcileAdditionalServices({ tenantId: "tenant-a", dryRun: false });
    expect(result.items[0].state).toBe(state);
    expect(c.tx.operationsIntakeOutboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("keeps an existing materialized requirement valid even when its outbox history exists", async () => {
    const c = context({ sourceItems: [source] });
    c.tx.operationalRequirement.findMany.mockResolvedValue([{ id: "requirement-a", travelPackageId: "travel-a", sourceId: "order-a", sourceLineId: "line-a" }]);
    c.tx.operationsIntakeOutboxEvent.findMany.mockResolvedValue([outbox({ status: "PROCESSED" })]);
    const result = await c.service.reconcileAdditionalServices({ tenantId: "tenant-a" });
    expect(result.items[0]).toMatchObject({ state: "VALID", operationalRequirementId: "requirement-a" });
  });

  it("audits snapshot drift without mutation and distinguishes Operations-started work", async () => {
    const c = context({ inspections: new Map([[key(source), { reference: source, state: "VALID", item: { ...source, soldValue: { scope: "EXACT_SERVICE_LINE", amount: "900.0000", currency: "USD" } } }]]) });
    c.tx.operationalRequirement.findMany.mockResolvedValue([requirement()]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([{ operationalRequirementId: "requirement-a", travelPackageParticipant: { clientId: "client-a" } }]);
    c.tx.operationalFulfillment.findMany.mockResolvedValue([{ operationalRequirementId: "requirement-a" }]);
    const result = await c.service.auditMaterializedAdditionalServices({ tenantId: "tenant-a" });
    expect(result.items[0]).toMatchObject({ state: "SOURCE_DRIFT_WITH_OPERATIONAL_ACTIVITY", hasOperationalActivity: true });
    expect(result.summary.drift).toBe(1);
    expect((c.tx.operationalRequirement as Record<string, unknown>).updateMany).toBeUndefined();
  });

  it.each([
    ["SOURCE_CANCELLED", [], "SOURCE_CANCELLED_NO_ACTIVITY"],
    ["SOURCE_CANCELLED", [{ operationalRequirementId: "requirement-a" }], "SOURCE_CANCELLED_WITH_ACTIVITY"],
    ["SOURCE_MISSING", [], "SOURCE_MISSING"],
  ])("classifies source validity without changing the requirement", async (state, fulfillments, expected) => {
    const c = context({ inspections: new Map([[key(source), { reference: source, state, item: null }]]) });
    c.tx.operationalRequirement.findMany.mockResolvedValue([requirement()]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([]);
    c.tx.operationalFulfillment.findMany.mockResolvedValue(fulfillments);
    const result = await c.service.auditMaterializedAdditionalServices({ tenantId: "tenant-a" });
    expect(result.items[0].state).toBe(expected);
  });

  it("requeues only an explicitly requested failed event with a safe current source", async () => {
    const c = context();
    c.tx.operationsIntakeOutboxEvent.findFirst.mockResolvedValue(outbox({ status: "FAILED" }));
    c.sourceReader.readSourceItem.mockResolvedValue(source);
    c.tx.operationsIntakeOutboxEvent.updateMany.mockResolvedValue({ count: 1 });
    await expect(c.service.retryFailedAdditionalServiceEvent("tenant-a", "event-a")).resolves.toEqual({ status: "REQUEUED" });
    expect(c.tx.operationsIntakeOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "event-a", tenantId: "tenant-a", status: "FAILED" },
      data: expect.objectContaining({ status: "PENDING", attemptCount: 0, lockedAt: null, lockedBy: null, lastError: null }),
    }));
  });

  it("does not requeue an invalid commercial source or process it directly", async () => {
    const c = context();
    c.tx.operationsIntakeOutboxEvent.findFirst.mockResolvedValue(outbox({ status: "FAILED" }));
    c.sourceReader.readSourceItem.mockRejectedValue(new OperationalWorkMaterializationError("SOURCE_NOT_ELIGIBLE", false));
    await expect(c.service.retryFailedAdditionalServiceEvent("tenant-a", "event-a")).resolves.toEqual({ status: "NOT_RETRYABLE" });
    expect(c.tx.operationsIntakeOutboxEvent.updateMany).not.toHaveBeenCalled();
  });
});

function context(input: { sourceItems?: OperationalWorkSourceItem[]; inspections?: Map<string, any> } = {}) {
  const tx = {
    $executeRaw: jest.fn(),
    operationalRequirement: { findMany: jest.fn() },
    operationalRequirementPassenger: { findMany: jest.fn() },
    operationalFulfillment: { findMany: jest.fn() },
    operationsIntakeOutboxEvent: { findMany: jest.fn(), createMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  const reconciliationReader = {
    scanApprovedSourceItems: jest.fn().mockResolvedValue({ items: input.sourceItems ?? [], nextCursor: null }),
    inspectSourceItems: jest.fn().mockResolvedValue(input.inspections ?? new Map()),
  };
  const sourceReader = { readSourceItem: jest.fn() };
  return { tx, sourceReader, reconciliationReader, service: new OperationsIntakeReconciliationService(prisma as never, reconciliationReader, sourceReader) };
}

function sourceItem(): OperationalWorkSourceItem {
  return {
    tenantId: "tenant-a", travelPackageId: "travel-a", sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a",
    sourceVersionId: "1", sourceReference: null, sourceAcceptedAt: new Date("2026-10-01T12:00:00.000Z"),
    servicePurposeCode: "LODGING", servicePurposeName: "Hospedaje", description: "Hotel con desayuno",
    participantClientIds: ["client-a"], soldValue: { scope: "EXACT_SERVICE_LINE", amount: "850.0000", currency: "USD" },
  };
}

function outbox(overrides: Record<string, unknown> = {}) {
  return { id: "event-a", tenantId: "tenant-a", travelPackageId: "travel-a", eventType: "SOURCE_ITEM_APPROVED", eventVersion: 1, sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", status: "PENDING", ...overrides };
}

function requirement() {
  return {
    id: "requirement-a", tenantId: "tenant-a", travelPackageId: "travel-a", sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", sourceVersionId: "1",
    servicePurposeCode: "LODGING", servicePurposeName: "Hospedaje", description: "Hotel con desayuno", soldAmount: { toFixed: () => "850.0000" }, soldCurrency: "USD", soldValueScope: "EXACT_SERVICE_LINE",
  };
}

function key(source: OperationalWorkSourceItem) {
  return `${source.sourceId}\u0000${source.sourceLineId}`;
}

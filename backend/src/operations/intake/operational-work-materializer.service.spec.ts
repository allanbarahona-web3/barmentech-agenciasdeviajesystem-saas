import { Prisma } from "@prisma/client";
import { OperationalWorkMaterializer } from "./operational-work-materializer.service";
import { OperationalWorkMaterializationError, type OperationalWorkSourceItem, type TravelPackageOperationalWorkSourceItem } from "./operational-work-source-reader.port";

describe("OperationalWorkMaterializer", () => {
  const reference = { tenantId: "tenant-a", scopeType: "TRAVEL_PACKAGE" as const, travelPackageId: "travel-a", sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a" };

  it("creates one PENDING requirement and a bounded batch of exact passenger assignments", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue(null);
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: "travel-a" });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a", clientId: "client-a" }, { id: "participant-b", clientId: "client-b" }]);
    c.tx.operationalRequirement.create.mockResolvedValue({ id: "requirement-a" });

    await expect(c.materializer.materialize(reference)).resolves.toEqual({ status: "CREATED", operationalRequirementId: "requirement-a" });
    expect(c.tx.operationalRequirement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      tenantId: "tenant-a", travelPackageId: "travel-a", sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a",
      scopeType: "TRAVEL_PACKAGE", customerId: null,
      sourceVersionId: "3", status: "PENDING", critical: false, operationalDeadlineAt: null, assignedToUserId: null,
      soldValueScope: "EXACT_SERVICE_LINE", soldCurrency: "USD", createdByUserId: "SYSTEM",
    }) }));
    expect(c.tx.operationalRequirementPassenger.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ travelPackageParticipantId: "participant-a" }),
      expect.objectContaining({ travelPackageParticipantId: "participant-b" }),
    ]) });
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledTimes(1);
    expect((c.tx as Record<string, unknown>).operationalFulfillment).toBeUndefined();
    expect((c.tx as Record<string, unknown>).operationalPurchase).toBeUndefined();
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("returns the existing source-derived requirement on replay without replacing assignments", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue({ id: "requirement-existing" });
    await expect(c.materializer.materialize(reference)).resolves.toEqual({ status: "ALREADY_MATERIALIZED", operationalRequirementId: "requirement-existing" });
    expect(c.tx.travelPackageParticipant.findMany).not.toHaveBeenCalled();
    expect(c.tx.operationalRequirement.create).not.toHaveBeenCalled();
    expect(c.tx.operationalRequirementPassenger.createMany).not.toHaveBeenCalled();
  });

  it("does not create a partial requirement when any source participant is absent", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue(null);
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: "travel-a" });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a", clientId: "client-a" }]);
    await expect(c.materializer.materialize(reference)).rejects.toMatchObject({ code: "PARTICIPANT_NOT_FOUND", retryable: true });
    expect(c.tx.operationalRequirement.create).not.toHaveBeenCalled();
    expect(c.tx.operationalRequirementPassenger.createMany).not.toHaveBeenCalled();
  });

  it("converts a concurrent source-identity conflict into idempotent success", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "requirement-concurrent" });
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: "travel-a" });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a", clientId: "client-a" }, { id: "participant-b", clientId: "client-b" }]);
    c.tx.operationalRequirement.create.mockRejectedValue({ code: "P2002" });
    await expect(c.materializer.materialize(reference)).resolves.toEqual({ status: "ALREADY_MATERIALIZED", operationalRequirementId: "requirement-concurrent" });
  });

  it("rejects a mismatched adapter projection before writing", async () => {
    const c = context({ ...source(), travelPackageId: "travel-b" });
    await expect(c.materializer.materialize(reference)).rejects.toBeInstanceOf(OperationalWorkMaterializationError);
    expect(c.tx.operationalRequirement.create).not.toHaveBeenCalled();
  });

  it("materializes a standalone customer source without package or passenger reads", async () => {
    const c = context(standaloneSource());
    c.tx.operationalRequirement.findFirst.mockResolvedValue(null);
    c.tx.client.findFirst.mockResolvedValue({ id: "customer-a" });
    c.tx.operationalRequirement.create.mockResolvedValue({ id: "requirement-standalone" });

    await expect(c.materializer.materialize(standaloneReference())).resolves.toEqual({ status: "CREATED", operationalRequirementId: "requirement-standalone" });
    expect(c.tx.client.findFirst).toHaveBeenCalledWith({ where: { id: "customer-a", tenantId: "tenant-a" }, select: { id: true } });
    expect(c.tx.operationalRequirement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      scopeType: "STANDALONE_CUSTOMER", customerId: "customer-a", travelPackageId: null,
      sourceType: "CUSTOM_QUOTATION_LINE", sourceId: "version-a", sourceLineId: "version-line-a",
      status: "PENDING", soldValueScope: "EXACT_SERVICE_LINE", soldAmount: expect.any(Prisma.Decimal), soldCurrency: "USD",
    }) }));
    expect(c.tx.travelPackage.findFirst).not.toHaveBeenCalled();
    expect(c.tx.travelPackageParticipant.findMany).not.toHaveBeenCalled();
    expect(c.tx.operationalRequirementPassenger.createMany).not.toHaveBeenCalled();
  });

  it("reuses the standalone source identity without creating passengers or a duplicate requirement", async () => {
    const c = context(standaloneSource());
    c.tx.operationalRequirement.findFirst.mockResolvedValue({ id: "requirement-standalone" });

    await expect(c.materializer.materialize(standaloneReference())).resolves.toEqual({ status: "ALREADY_MATERIALIZED", operationalRequirementId: "requirement-standalone" });
    expect(c.tx.operationalRequirement.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      tenantId: "tenant-a", scopeType: "STANDALONE_CUSTOMER", sourceType: "CUSTOM_QUOTATION_LINE", sourceId: "version-a", sourceLineId: "version-line-a",
    }) }));
    expect(c.tx.client.findFirst).not.toHaveBeenCalled();
    expect(c.tx.operationalRequirement.create).not.toHaveBeenCalled();
    expect(c.tx.operationalRequirementPassenger.createMany).not.toHaveBeenCalled();
  });

  it("recovers a standalone source-identity race by returning the concurrent requirement", async () => {
    const c = context(standaloneSource());
    c.tx.operationalRequirement.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "requirement-concurrent" });
    c.tx.client.findFirst.mockResolvedValue({ id: "customer-a" });
    c.tx.operationalRequirement.create.mockRejectedValue({ code: "P2002" });

    await expect(c.materializer.materialize(standaloneReference())).resolves.toEqual({ status: "ALREADY_MATERIALIZED", operationalRequirementId: "requirement-concurrent" });
    expect(c.tx.operationalRequirementPassenger.createMany).not.toHaveBeenCalled();
  });

  it("rejects a standalone source whose authoritative customer is outside the tenant", async () => {
    const c = context(standaloneSource());
    c.tx.operationalRequirement.findFirst.mockResolvedValue(null);
    c.tx.client.findFirst.mockResolvedValue(null);

    await expect(c.materializer.materialize(standaloneReference())).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND", retryable: false });
    expect(c.tx.operationalRequirement.create).not.toHaveBeenCalled();
    expect(c.tx.travelPackage.findFirst).not.toHaveBeenCalled();
  });

  it("creates one shared base requirement with every contracted participant and no sold value", async () => {
    const c = context(baseSource());
    c.rosterReader.readContractedRoster.mockResolvedValue({
      participants: [
        { id: "holder-a", clientId: "client-holder" },
        { id: "companion-b", clientId: "client-companion" },
        { id: "minor-c", clientId: "client-minor" },
      ],
      nextCursor: null,
    });
    c.tx.operationalRequirement.findFirst.mockResolvedValue(null);
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: "travel-a" });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([
      { id: "holder-a", clientId: "client-holder" },
      { id: "companion-b", clientId: "client-companion" },
      { id: "minor-c", clientId: "client-minor" },
    ]);
    c.tx.operationalRequirement.create.mockResolvedValue({ id: "requirement-base" });

    await expect(c.materializer.materialize(baseReference())).resolves.toEqual({ status: "CREATED", operationalRequirementId: "requirement-base" });
    expect(c.tx.operationalRequirement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      tenantId: "tenant-a", travelPackageId: "travel-a", sourceType: "TRAVEL_PACKAGE_COST_COMPONENT",
      scopeType: "TRAVEL_PACKAGE", customerId: null,
      sourceId: "project-a", sourceLineId: "component-a", sourceVersionId: "snapshot-a",
      servicePurposeCode: "LODGING", servicePurposeName: "Lodging", soldValueScope: "NONE",
      soldAmount: null, soldCurrency: null, assignedToUserId: null, assignedToName: null,
      sourceSnapshot: baseSource().sourceSnapshot,
    }) }));
    expect(c.tx.operationalRequirementPassenger.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ travelPackageParticipantId: "holder-a" }),
      expect.objectContaining({ travelPackageParticipantId: "companion-b" }),
      expect.objectContaining({ travelPackageParticipantId: "minor-c" }),
    ]) });
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["holder-a", "companion-b", "minor-c"] } }),
    }));
    expect(c.rosterReader.readContractedRoster).toHaveBeenCalledWith({ tenantId: "tenant-a", travelPackageId: "travel-a", cursor: undefined, limit: 25 });
  });

  it("adds only newly contracted base participants on replay without rewriting the requirement or execution", async () => {
    const c = context(baseSource());
    c.rosterReader.readContractedRoster.mockResolvedValue({
      participants: [{ id: "participant-a", clientId: "client-a" }, { id: "participant-c", clientId: "client-c" }],
      nextCursor: null,
    });
    c.tx.operationalRequirement.findFirst.mockResolvedValue({ id: "requirement-base" });
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: "travel-a" });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a", clientId: "client-a" }, { id: "participant-c", clientId: "client-c" }]);

    await expect(c.materializer.materialize(baseReference())).resolves.toEqual({ status: "ALREADY_MATERIALIZED", operationalRequirementId: "requirement-base" });
    expect(c.tx.operationalRequirement.create).not.toHaveBeenCalled();
    expect(c.tx.operationalRequirementPassenger.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ travelPackageParticipantId: "participant-a" }), expect.objectContaining({ travelPackageParticipantId: "participant-c" })]),
      skipDuplicates: true,
    });
    expect((c.tx.operationalRequirement as Record<string, unknown>).update).toBeUndefined();
    expect((c.tx as Record<string, unknown>).operationalFulfillment).toBeUndefined();
    expect((c.tx as Record<string, unknown>).operationalPurchase).toBeUndefined();
    expect((c.tx as Record<string, unknown>).operationalEvidence).toBeUndefined();
  });

  it("does not refresh a base source snapshot when replay observes newer CostSnapshot context", async () => {
    const c = context({
      ...baseSource(),
      sourceVersionId: "snapshot-new",
      sourceSnapshot: {
        ...baseSource().sourceSnapshot!,
        currentCostSnapshotId: "snapshot-new",
        currentInternalCost: { amount: "999.12345", currency: "USD" },
      },
    });
    c.rosterReader.readContractedRoster.mockResolvedValue({ participants: [{ id: "participant-a", clientId: "client-a" }], nextCursor: null });
    c.tx.operationalRequirement.findFirst.mockResolvedValue({ id: "requirement-base" });
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: "travel-a" });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a", clientId: "client-a" }]);

    await expect(c.materializer.materialize(baseReference())).resolves.toEqual({ status: "ALREADY_MATERIALIZED", operationalRequirementId: "requirement-base" });
    expect(c.tx.operationalRequirement.create).not.toHaveBeenCalled();
    expect((c.tx.operationalRequirement as Record<string, unknown>).update).toBeUndefined();
  });

  it("persists a supplied Additional Services snapshot without changing its sold-value behavior", async () => {
    const c = context({ ...source(), sourceSnapshot: { serviceVersion: "2", selectedOption: "breakfast" } as never });
    c.tx.operationalRequirement.findFirst.mockResolvedValue(null);
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: "travel-a" });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a", clientId: "client-a" }, { id: "participant-b", clientId: "client-b" }]);
    c.tx.operationalRequirement.create.mockResolvedValue({ id: "requirement-a" });

    await c.materializer.materialize(reference);
    expect(c.tx.operationalRequirement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      sourceSnapshot: { serviceVersion: "2", selectedOption: "breakfast" },
      soldValueScope: "EXACT_SERVICE_LINE", soldCurrency: "USD",
    }) }));
  });

  it("keeps null adapter snapshots absent for new legacy-compatible Additional Services requirements", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue(null);
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: "travel-a" });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a", clientId: "client-a" }, { id: "participant-b", clientId: "client-b" }]);
    c.tx.operationalRequirement.create.mockResolvedValue({ id: "requirement-a" });

    await c.materializer.materialize(reference);
    const create = c.tx.operationalRequirement.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(create.data).not.toHaveProperty("sourceSnapshot");
  });

  it("returns retryable not-ready when a valid base component has no contracted roster", async () => {
    const c = context(baseSource());
    c.rosterReader.readContractedRoster.mockResolvedValue({ participants: [], nextCursor: null });
    c.tx.operationalRequirement.findFirst.mockResolvedValue(null);
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: "travel-a" });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([]);
    await expect(c.materializer.materialize(baseReference())).rejects.toMatchObject({ code: "PARTICIPANT_NOT_FOUND", retryable: true });
    expect(c.tx.operationalRequirement.create).not.toHaveBeenCalled();
    expect(c.tx.operationalRequirementPassenger.createMany).not.toHaveBeenCalled();
  });

  it("keeps base replay concurrency-safe and synchronizes passenger scope after the identity conflict", async () => {
    const c = context(baseSource());
    c.rosterReader.readContractedRoster.mockResolvedValue({ participants: [{ id: "participant-c", clientId: "client-c" }], nextCursor: null });
    c.tx.operationalRequirement.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "requirement-base" });
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: "travel-a" });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-c", clientId: "client-c" }]);
    c.tx.operationalRequirement.create.mockRejectedValue({ code: "P2002" });
    await expect(c.materializer.materialize(baseReference())).resolves.toEqual({ status: "ALREADY_MATERIALIZED", operationalRequirementId: "requirement-base" });
    expect(c.tx.operationalRequirementPassenger.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

  it("does not leave a successful materialization result when passenger insertion fails", async () => {
    const c = context(baseSource());
    c.rosterReader.readContractedRoster.mockResolvedValue({ participants: [{ id: "participant-a", clientId: "client-a" }], nextCursor: null });
    c.tx.operationalRequirement.findFirst.mockResolvedValue(null);
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: "travel-a" });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a", clientId: "client-a" }]);
    c.tx.operationalRequirement.create.mockResolvedValue({ id: "requirement-base" });
    c.tx.operationalRequirementPassenger.createMany.mockRejectedValue(new Error("write failed"));
    await expect(c.materializer.materialize(baseReference())).rejects.toMatchObject({ code: "MATERIALIZATION_FAILED", retryable: true });
    expect(c.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("pages and writes a large contracted roster in bounded batches", async () => {
    const c = context(baseSource());
    const firstPage = Array.from({ length: 25 }, (_, index) => ({ id: `participant-${index + 1}`, clientId: `client-${index + 1}` }));
    const lastParticipant = { id: "participant-26", clientId: "client-26" };
    c.rosterReader.readContractedRoster
      .mockResolvedValueOnce({ participants: firstPage, nextCursor: "participant-25" })
      .mockResolvedValueOnce({ participants: [lastParticipant], nextCursor: null });
    c.tx.operationalRequirement.findFirst.mockResolvedValue(null);
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: "travel-a" });
    c.tx.travelPackageParticipant.findMany
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([lastParticipant]);
    c.tx.operationalRequirement.create.mockResolvedValue({ id: "requirement-base" });

    await expect(c.materializer.materialize(baseReference())).resolves.toEqual({ status: "CREATED", operationalRequirementId: "requirement-base" });
    expect(c.rosterReader.readContractedRoster).toHaveBeenCalledTimes(2);
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledTimes(2);
    expect(c.tx.operationalRequirementPassenger.createMany).toHaveBeenCalledTimes(2);
  });
});

function context(item: OperationalWorkSourceItem = source()) {
  const tx = {
    $executeRaw: jest.fn(),
    travelPackage: { findFirst: jest.fn() },
    travelPackageParticipant: { findMany: jest.fn() },
    client: { findFirst: jest.fn() },
    operationalRequirement: { findFirst: jest.fn(), create: jest.fn() },
    operationalRequirementPassenger: { createMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  const sourceReader = { readSourceItem: jest.fn().mockResolvedValue(item) };
  const rosterReader = { readContractedRoster: jest.fn(), readContractedRosters: jest.fn() };
  return { tx, prisma, sourceReader, rosterReader, materializer: new OperationalWorkMaterializer(prisma as never, sourceReader, rosterReader) };
}

function baseReference() {
  return { tenantId: "tenant-a", scopeType: "TRAVEL_PACKAGE" as const, travelPackageId: "travel-a", sourceType: "TRAVEL_PACKAGE_COST_COMPONENT", sourceId: "project-a", sourceLineId: "component-a" };
}

function standaloneReference() {
  return { tenantId: "tenant-a", scopeType: "STANDALONE_CUSTOMER" as const, customerId: "customer-a", sourceType: "CUSTOM_QUOTATION_LINE", sourceId: "version-a", sourceLineId: "version-line-a" };
}

function standaloneSource(): OperationalWorkSourceItem {
  return {
    ...standaloneReference(),
    sourceVersionId: "version-a",
    sourceReference: null,
    sourceAcceptedAt: new Date("2026-10-01T12:00:00.000Z"),
    servicePurposeCode: "CUSTOM_QUOTATION",
    servicePurposeName: "Cotización personalizada",
    description: "Traslado privado",
    sourceSnapshot: null,
    soldValueScope: "EXACT_SERVICE_LINE",
    soldValue: { scope: "EXACT_SERVICE_LINE", amount: "700.00000", currency: "USD" },
  };
}

function baseSource(): TravelPackageOperationalWorkSourceItem {
  return {
    ...baseReference(),
    sourceVersionId: "snapshot-a", sourceReference: null, sourceAcceptedAt: null,
    servicePurposeCode: "LODGING", servicePurposeName: "Lodging", description: "Hotel Central · Four nights",
    participantClientIds: [], participantScope: "ALL_CONTRACTED_TRAVEL_PACKAGE_PARTICIPANTS",
    sourceSnapshot: {
      travelPackageId: "travel-a", costingProjectId: "project-a", costComponentId: "component-a",
      category: { code: "LODGING", displayName: "Lodging" }, title: "Hotel Central", description: "Four nights",
      structuredDetails: { rooms: 2 }, detailSchemaVersion: 1, quantity: "4.00000", unit: "night",
      supplier: null, currentCostSnapshotId: "snapshot-a", currentInternalCost: { amount: "800.00000", currency: "USD" },
    },
    soldValueScope: "NONE", soldValue: null,
  };
}

function source(): TravelPackageOperationalWorkSourceItem {
  return {
    tenantId: "tenant-a", scopeType: "TRAVEL_PACKAGE", travelPackageId: "travel-a", sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a",
    sourceVersionId: "3", sourceReference: null, sourceAcceptedAt: new Date("2026-09-30T12:00:00.000Z"),
    servicePurposeCode: "LODGING", servicePurposeName: "Hospedaje", description: "Hotel con desayuno · Entrada: 2026-10-18",
    participantClientIds: ["client-a", "client-b"], sourceSnapshot: null, soldValueScope: "EXACT_SERVICE_LINE", soldValue: { scope: "EXACT_SERVICE_LINE", amount: "850.0000", currency: "USD" },
  };
}

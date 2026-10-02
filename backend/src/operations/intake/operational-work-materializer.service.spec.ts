import { OperationalWorkMaterializer } from "./operational-work-materializer.service";
import { OperationalWorkMaterializationError, type OperationalWorkSourceItem } from "./operational-work-source-reader.port";

describe("OperationalWorkMaterializer", () => {
  const reference = { tenantId: "tenant-a", travelPackageId: "travel-a", sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a" };

  it("creates one PENDING requirement and a bounded batch of exact passenger assignments", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue(null);
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: "travel-a" });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a", clientId: "client-a" }, { id: "participant-b", clientId: "client-b" }]);
    c.tx.operationalRequirement.create.mockResolvedValue({ id: "requirement-a" });

    await expect(c.materializer.materialize(reference)).resolves.toEqual({ status: "CREATED", operationalRequirementId: "requirement-a" });
    expect(c.tx.operationalRequirement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      tenantId: "tenant-a", travelPackageId: "travel-a", sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a",
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
});

function context(item: OperationalWorkSourceItem = source()) {
  const tx = {
    $executeRaw: jest.fn(),
    travelPackage: { findFirst: jest.fn() },
    travelPackageParticipant: { findMany: jest.fn() },
    operationalRequirement: { findFirst: jest.fn(), create: jest.fn() },
    operationalRequirementPassenger: { createMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  const sourceReader = { readSourceItem: jest.fn().mockResolvedValue(item) };
  return { tx, sourceReader, materializer: new OperationalWorkMaterializer(prisma as never, sourceReader) };
}

function source(): OperationalWorkSourceItem {
  return {
    tenantId: "tenant-a", travelPackageId: "travel-a", sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a",
    sourceVersionId: "3", sourceReference: null, sourceAcceptedAt: new Date("2026-09-30T12:00:00.000Z"),
    servicePurposeCode: "LODGING", servicePurposeName: "Hospedaje", description: "Hotel con desayuno · Entrada: 2026-10-18",
    participantClientIds: ["client-a", "client-b"], soldValue: { scope: "EXACT_SERVICE_LINE", amount: "850.0000", currency: "USD" },
  };
}

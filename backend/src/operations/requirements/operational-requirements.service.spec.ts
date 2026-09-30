import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { OperationalRequirementsService } from "./operational-requirements.service";

const tenantId = "tenant-a";
const travelPackageId = "travel-a";
const requirementId = "requirement-a";
const actor = { userId: "user-a", name: "Operator A" };

describe("OperationalRequirementsService", () => {
  it("creates a PENDING manual requirement and all deduplicated passenger rows in one tenant transaction", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }, { id: "participant-b" }]);
    c.tx.user.findFirst.mockResolvedValue({ id: "operator-b", fullName: "Operator B" });
    c.tx.operationalRequirement.create.mockResolvedValue({ id: requirementId });
    c.tx.operationalRequirementPassenger.createMany.mockResolvedValue({ count: 2 });
    c.tx.operationalRequirement.findFirst.mockResolvedValue(requirement());

    await expect(c.service.create(tenantId, travelPackageId, {
      servicePurposeCode: "LODGING",
      servicePurposeName: "Lodging",
      description: " Hotel rooms ",
      critical: true,
      assignedToUserId: "operator-b",
      participantIds: ["participant-a", "participant-a", "participant-b"],
      sourceType: "MANUAL",
      soldValueScope: "NONE",
    }, actor)).resolves.toMatchObject({ status: "PENDING", passengers: [{ travelPackageParticipantId: "participant-a" }] });

    expect(c.tx.operationalRequirement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId, travelPackageId, status: "PENDING", description: "Hotel rooms",
        assignedToUserId: "operator-b", assignedToName: "Operator B", sourceType: "MANUAL",
      }),
    }));
    expect(c.tx.operationalRequirementPassenger.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ travelPackageParticipantId: "participant-a", createdByUserId: actor.userId }),
        expect.objectContaining({ travelPackageParticipantId: "participant-b" }),
      ]),
    });
    expect(c.tx.operationalRequirementPassenger.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid participant batch before creating a partial requirement", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);

    await expect(c.service.create(tenantId, travelPackageId, createInput({
      participantIds: ["participant-a", "participant-other-trip"],
    }), actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_REQUIREMENT_PARTICIPANT_NOT_FOUND_IN_TRAVEL_PACKAGE" }) });
    expect(c.tx.operationalRequirement.create).not.toHaveBeenCalled();
    expect(c.tx.operationalRequirementPassenger.createMany).not.toHaveBeenCalled();
  });

  it("keeps non-manual source identity neutral while requiring a source identifier or reference", async () => {
    const c = context();
    await expect(c.service.create(tenantId, travelPackageId, createInput({ sourceType: "CONTRACT" }), actor))
      .rejects.toBeInstanceOf(BadRequestException);

    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    c.tx.operationalRequirement.create.mockResolvedValue({ id: requirementId });
    c.tx.operationalRequirementPassenger.createMany.mockResolvedValue({ count: 1 });
    c.tx.operationalRequirement.findFirst.mockResolvedValue(requirement({ sourceType: "CONTRACT", sourceId: "contract-trace-only" }));
    await c.service.create(tenantId, travelPackageId, createInput({ sourceType: "CONTRACT", sourceId: "contract-trace-only" }), actor);
    expect(c.tx.operationalRequirement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sourceType: "CONTRACT", sourceId: "contract-trace-only" }),
    }));
  });

  it.each([
    [createInput({ soldValueScope: "NONE", soldAmount: "1.00" }), "OPERATIONAL_REQUIREMENT_SOLD_VALUE_NONE_MUST_BE_EMPTY"],
    [createInput({ soldValueScope: "ORDER_TOTAL", soldAmount: "1.00" }), "OPERATIONAL_REQUIREMENT_SOLD_CURRENCY_REQUIRED"],
    [createInput({ soldValueScope: "ORDER_TOTAL", soldCurrency: "USD" }), "OPERATIONAL_REQUIREMENT_SOLD_AMOUNT_REQUIRED"],
  ])("rejects invalid sold-value combinations", async (input, code) => {
    const c = context();
    await expect(c.service.create(tenantId, travelPackageId, input, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: code }) });
  });

  it("rejects an assignee outside the current tenant", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    c.tx.user.findFirst.mockResolvedValue(null);

    await expect(c.service.create(tenantId, travelPackageId, createInput({ assignedToUserId: "user-tenant-b" }), actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_REQUIREMENT_ASSIGNEE_NOT_FOUND" }) });
    expect(c.tx.operationalRequirement.create).not.toHaveBeenCalled();
  });

  it("adds valid passengers idempotently with one bounded participant query", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst
      .mockResolvedValueOnce({ id: requirementId, status: "PENDING" })
      .mockResolvedValueOnce(requirement());
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    c.tx.operationalRequirementPassenger.createMany.mockResolvedValue({ count: 0 });

    await c.service.addPassengers(tenantId, travelPackageId, requirementId, { participantIds: ["participant-a", "participant-a"] }, actor);
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledWith({
      where: { tenantId, travelPackageId, id: { in: ["participant-a"] } }, select: { id: true },
    });
    expect(c.tx.operationalRequirementPassenger.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

  it("rejects cross-package passenger additions before writing", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue({ id: requirementId, status: "PENDING" });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([]);
    await expect(c.service.addPassengers(tenantId, travelPackageId, requirementId, { participantIds: ["participant-other-trip"] }, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_REQUIREMENT_PARTICIPANT_NOT_FOUND_IN_TRAVEL_PACKAGE" }) });
    expect(c.tx.operationalRequirementPassenger.createMany).not.toHaveBeenCalled();
  });

  it("removes members idempotently but rejects removal of the final passenger", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst
      .mockResolvedValueOnce({ id: requirementId, status: "PENDING" })
      .mockResolvedValueOnce(requirement({ passengers: [passenger("participant-b")] }));
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }, { id: "participant-b" }]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([
      { travelPackageParticipantId: "participant-a" }, { travelPackageParticipantId: "participant-b" },
    ]);
    c.tx.operationalRequirementPassenger.deleteMany.mockResolvedValue({ count: 1 });

    await c.service.removePassengers(tenantId, travelPackageId, requirementId, { participantIds: ["participant-a", "participant-not-member"] });
    expect(c.tx.operationalRequirementPassenger.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ travelPackageParticipantId: { in: ["participant-a"] } }),
    }));

    const last = context();
    last.tx.operationalRequirement.findFirst.mockResolvedValue({ id: requirementId, status: "PENDING" });
    last.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    last.tx.operationalRequirementPassenger.findMany.mockResolvedValue([{ travelPackageParticipantId: "participant-a" }]);
    await expect(last.service.removePassengers(tenantId, travelPackageId, requirementId, { participantIds: ["participant-a"] }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it("transitions only the permitted active workflow states and protects FULFILLED", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst
      .mockResolvedValueOnce({ id: requirementId, status: "PENDING" })
      .mockResolvedValueOnce(requirement({ status: "IN_PROGRESS" }));
    c.tx.operationalRequirement.updateMany.mockResolvedValue({ count: 1 });
    await expect(c.service.transitionStatus(tenantId, travelPackageId, requirementId, { status: "IN_PROGRESS" }, actor))
      .resolves.toMatchObject({ status: "IN_PROGRESS" });

    await expect(c.service.transitionStatus(tenantId, travelPackageId, requirementId, { status: "FULFILLED" }, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_REQUIREMENT_FULFILLED_PROTECTED" }) });

    const terminal = context();
    terminal.tx.operationalRequirement.findFirst.mockResolvedValue({ id: requirementId, status: "CANCELLED" });
    await expect(terminal.service.transitionStatus(tenantId, travelPackageId, requirementId, { status: "PENDING" }, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_REQUIREMENT_STATUS_TRANSITION_INVALID" }) });
  });

  it("updates only common fields and resolves the assignee snapshot server-side", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst
      .mockResolvedValueOnce({ id: requirementId, status: "PENDING" })
      .mockResolvedValueOnce(requirement({ assignedToUserId: "user-b", assignedToName: "Operator B" }));
    c.tx.user.findFirst.mockResolvedValue({ id: "user-b", fullName: "Operator B" });
    c.tx.operationalRequirement.updateMany.mockResolvedValue({ count: 1 });
    await c.service.update(tenantId, travelPackageId, requirementId, { assignedToUserId: "user-b", critical: true }, actor);
    expect(c.tx.operationalRequirement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assignedToUserId: "user-b", assignedToName: "Operator B", updatedByUserId: actor.userId }),
    }));
  });

  it("lists a bounded deterministic page with passenger counts and never loads passenger graphs", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.operationalRequirement.findMany.mockResolvedValue([{ ...requirement(), _count: { passengers: 2 } }]);
    c.tx.operationalRequirement.count.mockResolvedValue(26);

    await expect(c.service.list(tenantId, travelPackageId, { status: "PENDING", page: 2, pageSize: 20 }))
      .resolves.toMatchObject({ total: 26, page: 2, totalPages: 2, items: [{ passengerCount: 2 }] });
    expect(c.tx.operationalRequirement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId, travelPackageId, status: "PENDING" }),
      take: 20, skip: 20,
      orderBy: [{ operationalDeadlineAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }));
    expect(c.tx.operationalRequirement.findMany.mock.calls[0][0].select).not.toHaveProperty("passengers");
  });

  it("gets detail only through tenant and TravelPackage predicates with minimal participant display", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue(requirement());
    await expect(c.service.find(tenantId, travelPackageId, requirementId)).resolves.toMatchObject({
      passengers: [{ travelPackageParticipantId: "participant-a", clientId: "client-a", fullName: "Ada Lovelace", role: "TRAVELER" }],
    });
    expect(c.tx.operationalRequirement.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: requirementId, tenantId, travelPackageId },
    }));

    const hidden = context();
    hidden.tx.operationalRequirement.findFirst.mockResolvedValue(null);
    await expect(hidden.service.find("tenant-b", travelPackageId, requirementId)).rejects.toBeInstanceOf(NotFoundException);
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn(),
    travelPackage: { findFirst: jest.fn() },
    travelPackageParticipant: { findMany: jest.fn() },
    user: { findFirst: jest.fn() },
    operationalRequirement: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
    operationalRequirementPassenger: { createMany: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  return { tx, service: new OperationalRequirementsService(prisma as never) };
}

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    servicePurposeCode: "LODGING",
    servicePurposeName: "Lodging",
    description: "Hotel rooms",
    participantIds: ["participant-a"],
    sourceType: "MANUAL",
    soldValueScope: "NONE",
    ...overrides,
  } as any;
}

function passenger(id = "participant-a") {
  return {
    travelPackageParticipantId: id,
    travelPackageParticipant: { id, clientId: id === "participant-a" ? "client-a" : "client-b", role: "TRAVELER", client: { fullName: "Ada Lovelace" } },
  };
}

function requirement(overrides: Record<string, unknown> = {}) {
  return {
    id: requirementId,
    travelPackageId,
    servicePurposeCode: "LODGING",
    servicePurposeName: "Lodging",
    description: "Hotel rooms",
    status: "PENDING",
    critical: false,
    operationalDeadlineAt: null,
    assignedToUserId: null,
    assignedToName: null,
    sourceType: "MANUAL",
    sourceId: null,
    sourceLineId: null,
    sourceVersionId: null,
    sourceReference: null,
    sourceAcceptedAt: null,
    sourcePassengerGroupId: null,
    sourcePassengerGroupName: null,
    sourcePassengerGroupServiceCode: null,
    soldAmount: null,
    soldCurrency: null,
    soldValueScope: "NONE",
    createdAt: new Date("2026-09-29T10:00:00.000Z"),
    updatedAt: new Date("2026-09-29T10:00:00.000Z"),
    passengers: [passenger()],
    ...overrides,
  };
}

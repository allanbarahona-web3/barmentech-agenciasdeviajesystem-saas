import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { OperationalFulfillmentsService } from "./operational-fulfillments.service";

const tenantId = "tenant-a";
const travelPackageId = "travel-a";
const requirementId = "requirement-a";
const fulfillmentId = "fulfillment-a";
const actor = { userId: "operator-a", name: "Operator A" };

describe("OperationalFulfillmentsService", () => {
  it("creates a DRAFT fulfillment with service snapshots and deduplicated passenger rows atomically", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue(requirement());
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }, { id: "participant-b" }]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([{ travelPackageParticipantId: "participant-a" }, { travelPackageParticipantId: "participant-b" }]);
    c.tx.operationalFulfillment.create.mockResolvedValue({ id: fulfillmentId });
    c.tx.operationalFulfillmentPassenger.createMany.mockResolvedValue({ count: 2 });
    c.tx.operationalRequirement.updateMany.mockResolvedValue({ count: 1 });
    c.tx.operationalFulfillment.findFirst.mockResolvedValue(fulfillment());

    await expect(c.service.create(tenantId, travelPackageId, requirementId, createInput({ participantIds: ["participant-a", "participant-a", "participant-b"] }), actor))
      .resolves.toMatchObject({ status: "DRAFT", servicePurposeCode: "LODGING", passengers: [{ travelPackageParticipantId: "participant-a" }] });
    expect(c.tx.operationalFulfillment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ travelPackageId, status: "DRAFT", servicePurposeCode: "LODGING", servicePurposeName: "Lodging", operationalRequirementId: requirementId }),
    }));
    expect(c.tx.operationalFulfillmentPassenger.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(c.tx.operationalRequirement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: requirementId, tenantId, travelPackageId, status: "PENDING" },
      data: expect.objectContaining({ status: "IN_PROGRESS" }),
    }));
    expect(c.finance.readMany).not.toHaveBeenCalled();
  });

  it("does not create a new Fulfillment for passengers already covered by confirmation", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue(requirement());
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([{ travelPackageParticipantId: "participant-a" }]);
    c.tx.operationalFulfillmentPassenger.findMany.mockResolvedValue([{ travelPackageParticipantId: "participant-a" }]);
    await expect(c.service.create(tenantId, travelPackageId, requirementId, createInput(), actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_FULFILLMENT_PARTICIPANT_ALREADY_CONFIRMED" }) });
    expect(c.tx.operationalFulfillment.create).not.toHaveBeenCalled();
  });

  it("rejects package participants that are absent from the parent Requirement before creating", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue(requirement());
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([]);
    await expect(c.service.create(tenantId, travelPackageId, requirementId, createInput(), actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_FULFILLMENT_PARTICIPANT_OUTSIDE_REQUIREMENT" }) });
    expect(c.tx.operationalFulfillment.create).not.toHaveBeenCalled();
  });

  it("rejects participants outside the TravelPackage before Requirement membership lookup", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue(requirement());
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([]);
    await expect(c.service.create(tenantId, travelPackageId, requirementId, createInput(), actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_FULFILLMENT_PARTICIPANT_NOT_FOUND_IN_TRAVEL_PACKAGE" }) });
    expect(c.tx.operationalRequirementPassenger.findMany).not.toHaveBeenCalled();
  });

  it("rejects creation beneath a cancelled or not-applicable Requirement", async () => {
    for (const status of ["CANCELLED", "NOT_APPLICABLE"]) {
      const c = context();
      c.tx.operationalRequirement.findFirst.mockResolvedValue(requirement({ status }));
      await expect(c.service.create(tenantId, travelPackageId, requirementId, createInput(), actor)).rejects.toBeInstanceOf(ConflictException);
    }
  });

  it("updates common fields, validates the assignee, and keeps service identity out of the update", async () => {
    const c = context();
    c.tx.operationalFulfillment.findFirst
      .mockResolvedValueOnce(fulfillmentState())
      .mockResolvedValueOnce(fulfillment({ providerName: "Provider B", assignedToUserId: "user-b", assignedToName: "Operator B" }));
    c.tx.user.findFirst.mockResolvedValue({ id: "user-b", fullName: "Operator B" });
    c.tx.operationalFulfillment.updateMany.mockResolvedValue({ count: 1 });
    await c.service.update(tenantId, travelPackageId, requirementId, fulfillmentId, { providerName: " Provider B ", assignedToUserId: "user-b" }, actor);
    expect(c.tx.operationalFulfillment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ providerName: "Provider B", assignedToName: "Operator B", updatedByUserId: actor.userId }),
    }));
    expect(c.tx.operationalFulfillment.updateMany.mock.calls[0][0].data).not.toHaveProperty("servicePurposeCode");
  });

  it.each([
    [createInput({ detailPayload: { booking: "A" }, detailVersion: null }), "OPERATIONAL_FULFILLMENT_DETAIL_INVALID"],
    [createInput({ detailPayload: { booking: "A" } }), "OPERATIONAL_FULFILLMENT_DETAIL_INVALID"],
    [createInput({ detailPayload: ["not-an-object"] as any, detailVersion: 1 }), "OPERATIONAL_FULFILLMENT_DETAIL_INVALID"],
    [createInput({ serviceStartAt: "2026-10-10T12:00:00.000Z", serviceEndAt: "2026-10-09T12:00:00.000Z" }), "OPERATIONAL_FULFILLMENT_SERVICE_DATE_RANGE_INVALID"],
  ])("validates versioned detail payloads and service-date ranges", async (input, code) => {
    const c = context();
    await expect(c.service.create(tenantId, travelPackageId, requirementId, input, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: code }) });
  });

  it("adds Requirement passengers idempotently and rejects out-of-scope additions", async () => {
    const c = context();
    c.tx.operationalFulfillment.findFirst
      .mockResolvedValueOnce(fulfillmentState())
      .mockResolvedValueOnce(fulfillment());
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([{ travelPackageParticipantId: "participant-a" }]);
    c.tx.operationalFulfillmentPassenger.createMany.mockResolvedValue({ count: 0 });
    await c.service.addPassengers(tenantId, travelPackageId, requirementId, fulfillmentId, { participantIds: ["participant-a", "participant-a"] }, actor);
    expect(c.tx.operationalFulfillmentPassenger.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledTimes(1);

    const rejected = context();
    rejected.tx.operationalFulfillment.findFirst.mockResolvedValue(fulfillmentState());
    rejected.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    rejected.tx.operationalRequirementPassenger.findMany.mockResolvedValue([]);
    await expect(rejected.service.addPassengers(tenantId, travelPackageId, requirementId, fulfillmentId, { participantIds: ["participant-a"] }, actor))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it("removes passengers idempotently but never permits an empty Fulfillment", async () => {
    const c = context();
    c.tx.operationalFulfillment.findFirst
      .mockResolvedValueOnce(fulfillmentState())
      .mockResolvedValueOnce(fulfillment({ passengers: [passenger("participant-b")] }));
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }, { id: "participant-b" }]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([{ travelPackageParticipantId: "participant-a" }, { travelPackageParticipantId: "participant-b" }]);
    c.tx.operationalFulfillmentPassenger.findMany.mockResolvedValue([{ travelPackageParticipantId: "participant-a" }, { travelPackageParticipantId: "participant-b" }]);
    c.tx.operationalFulfillmentPassenger.deleteMany.mockResolvedValue({ count: 1 });
    await c.service.removePassengers(tenantId, travelPackageId, requirementId, fulfillmentId, { participantIds: ["participant-a", "participant-not-member"] });
    expect(c.tx.operationalFulfillmentPassenger.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ travelPackageParticipantId: { in: ["participant-a"] } }) }));

    const last = context();
    last.tx.operationalFulfillment.findFirst.mockResolvedValue(fulfillmentState());
    last.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    last.tx.operationalRequirementPassenger.findMany.mockResolvedValue([{ travelPackageParticipantId: "participant-a" }]);
    last.tx.operationalFulfillmentPassenger.findMany.mockResolvedValue([{ travelPackageParticipantId: "participant-a" }]);
    await expect(last.service.removePassengers(tenantId, travelPackageId, requirementId, fulfillmentId, { participantIds: ["participant-a"] })).rejects.toBeInstanceOf(ConflictException);
  });

  it("requires operational references for RESERVED and Finance eligibility for spend-committing transitions", async () => {
    const withoutReference = context();
    withoutReference.tx.operationalFulfillment.findFirst.mockResolvedValue(fulfillmentState());
    await expect(withoutReference.service.transitionStatus(tenantId, travelPackageId, requirementId, fulfillmentId, { targetStatus: "RESERVED" }, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_FULFILLMENT_RESERVATION_CONTEXT_REQUIRED" }) });

    const unavailable = context();
    unavailable.tx.operationalFulfillment.findFirst.mockResolvedValue(fulfillmentState({ reservationCode: "R-1", operationalRequirement: requirement({ sourceType: "MANUAL" }) }));
    await expect(unavailable.service.transitionStatus(tenantId, travelPackageId, requirementId, fulfillmentId, { targetStatus: "RESERVED" }, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_FULFILLMENT_FINANCIAL_ELIGIBILITY_UNAVAILABLE" }) });
    expect(unavailable.finance.readMany).not.toHaveBeenCalled();
  });

  it("calls the FinanceEligibilityReader once for Contract transitions and permits ELIGIBLE state", async () => {
    const c = context();
    c.tx.operationalFulfillment.findFirst
      .mockResolvedValueOnce(fulfillmentState({ reservationCode: "R-1", operationalRequirement: requirement({ sourceType: "CONTRACT", sourceId: "contract-a" }) }))
      .mockResolvedValueOnce(fulfillmentState({ reservationCode: "R-1", operationalRequirement: requirement({ sourceType: "CONTRACT", sourceId: "contract-a" }) }))
      .mockResolvedValueOnce(fulfillment({ status: "RESERVED", reservationCode: "R-1", operationalRequirement: requirement({ sourceType: "CONTRACT", sourceId: "contract-a" }) }));
    c.finance.readMany.mockResolvedValue([{ eligibility: "ELIGIBLE", reason: "SETTLED" }]);
    c.tx.operationalFulfillment.updateMany.mockResolvedValue({ count: 1 });
    await expect(c.service.transitionStatus(tenantId, travelPackageId, requirementId, fulfillmentId, { targetStatus: "RESERVED" }, actor))
      .resolves.toMatchObject({ status: "RESERVED" });
    expect(c.finance.readMany).toHaveBeenCalledWith({ tenantId, sources: [{ sourceType: "CONTRACT", sourceId: "contract-a" }] });
    expect(c.tx.operationalFulfillment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "DRAFT" }), data: expect.objectContaining({ status: "RESERVED" }) }));
  });

  it.each(["RESERVED", "PURCHASED", "CONFIRMED"] as const)("uses the exact Additional Service source for %s transitions", async (targetStatus) => {
    const c = context();
    const initialStatus = targetStatus === "RESERVED" ? "DRAFT" : targetStatus === "PURCHASED" ? "RESERVED" : "PURCHASED";
    const transitionContext = targetStatus === "CONFIRMED" ? { confirmationReference: "C-1" } : { reservationCode: "R-1" };
    const source = requirement({ sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a" });
    c.tx.operationalFulfillment.findFirst
      .mockResolvedValueOnce(fulfillmentState({ status: initialStatus, ...transitionContext, operationalRequirement: source }))
      .mockResolvedValueOnce(fulfillmentState({ status: initialStatus, ...transitionContext, operationalRequirement: source }))
      .mockResolvedValueOnce(fulfillment({ status: targetStatus, ...transitionContext, operationalRequirement: source }));
    c.finance.readMany.mockResolvedValue([{ eligibility: "ELIGIBLE", reason: "SETTLED" }]);
    c.tx.operationalFulfillment.updateMany.mockResolvedValue({ count: 1 });

    await expect(c.service.transitionStatus(tenantId, travelPackageId, requirementId, fulfillmentId, { targetStatus }, actor)).resolves.toMatchObject({ status: targetStatus });
    expect(c.finance.readMany).toHaveBeenCalledWith({ tenantId, sources: [{ sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", travelPackageId }] });
  });

  it.each(["RESERVED", "PURCHASED", "CONFIRMED"] as const)("progresses base work to %s without Finance", async (targetStatus) => {
    const c = context();
    const source = requirement({ sourceType: "TRAVEL_PACKAGE_COST_COMPONENT", sourceId: "project-a", sourceLineId: "component-a", sourceVersionId: "snapshot-a" });
    const initialStatus = targetStatus === "RESERVED" ? "DRAFT" : targetStatus === "PURCHASED" ? "RESERVED" : "PURCHASED";
    const transitionContext = targetStatus === "CONFIRMED" ? { confirmationReference: "C-1" } : { reservationCode: "R-1" };
    c.tx.operationalFulfillment.findFirst
      .mockResolvedValueOnce(fulfillmentState({ status: initialStatus, ...transitionContext, operationalRequirement: source }))
      .mockResolvedValueOnce(fulfillmentState({ status: initialStatus, ...transitionContext, operationalRequirement: source }))
      .mockResolvedValueOnce(fulfillment({ status: targetStatus, ...transitionContext, operationalRequirement: source }));
    c.tx.operationalFulfillment.updateMany.mockResolvedValue({ count: 1 });
    await expect(c.service.transitionStatus(tenantId, travelPackageId, requirementId, fulfillmentId, { targetStatus }, actor))
      .resolves.toMatchObject({ status: targetStatus });
    expect(c.finance.readMany).not.toHaveBeenCalled();
  });

  it("blocks finance-ineligible transitions and enforces confirmation references and terminal states", async () => {
    const blocked = context();
    blocked.tx.operationalFulfillment.findFirst.mockResolvedValue(fulfillmentState({ reservationCode: "R-1", operationalRequirement: requirement({ sourceType: "CONTRACT", sourceId: "contract-a" }) }));
    blocked.finance.readMany.mockResolvedValue([{ eligibility: "BLOCKED", reason: "OUTSTANDING_BALANCE" }]);
    await expect(blocked.service.transitionStatus(tenantId, travelPackageId, requirementId, fulfillmentId, { targetStatus: "RESERVED" }, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_FULFILLMENT_FINANCIAL_ELIGIBILITY_BLOCKED" }) });

    const confirmation = context();
    confirmation.tx.operationalFulfillment.findFirst.mockResolvedValue(fulfillmentState({ status: "PURCHASED", operationalRequirement: requirement({ sourceType: "CONTRACT", sourceId: "contract-a" }) }));
    await expect(confirmation.service.transitionStatus(tenantId, travelPackageId, requirementId, fulfillmentId, { targetStatus: "CONFIRMED" }, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_FULFILLMENT_CONFIRMATION_CONTEXT_REQUIRED" }) });

    const terminal = context();
    terminal.tx.operationalFulfillment.findFirst.mockResolvedValue(fulfillmentState({ status: "CANCELLED" }));
    await expect(terminal.service.transitionStatus(tenantId, travelPackageId, requirementId, fulfillmentId, { targetStatus: "RESERVED" }, actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it("lists a bounded deterministic page and returns detail only under tenant/package/Requirement scope", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue(requirement());
    c.tx.operationalFulfillment.findMany.mockResolvedValue([{ ...fulfillment(), _count: { passengers: 1, purchases: 2 } }]);
    c.tx.operationalFulfillment.count.mockResolvedValue(21);
    await expect(c.service.list(tenantId, travelPackageId, requirementId, { page: 1, pageSize: 20, status: "DRAFT" }))
      .resolves.toMatchObject({ total: 21, totalPages: 2, items: [{ passengerCount: 1, passengerPreview: ["Ada Lovelace"], purchaseCount: 2 }] });
    expect(c.tx.operationalFulfillment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId, travelPackageId, operationalRequirementId: requirementId, status: "DRAFT" }),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20,
    }));
    expect(c.tx.operationalFulfillment.findMany.mock.calls[0][0].select).toMatchObject({
      passengers: { take: 2 }, _count: { select: { passengers: true, purchases: true } },
    });

    c.tx.operationalFulfillment.findFirst.mockResolvedValue(fulfillment());
    await expect(c.service.find(tenantId, travelPackageId, requirementId, fulfillmentId)).resolves.toMatchObject({ passengers: [{ clientId: "client-a", fullName: "Ada Lovelace" }] });
    expect(c.tx.operationalFulfillment.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: fulfillmentId, tenantId, travelPackageId, operationalRequirementId: requirementId } }));

    const hidden = context();
    hidden.tx.operationalFulfillment.findFirst.mockResolvedValue(null);
    await expect(hidden.service.find("tenant-b", travelPackageId, requirementId, fulfillmentId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("creates standalone fulfillment without package or passenger reads", async () => {
    const c = context();
    const standaloneRequirement = requirement({ scopeType: "STANDALONE_CUSTOMER", travelPackageId: null, customerId: "customer-a" });
    c.tx.operationalRequirement.findFirst.mockResolvedValue(standaloneRequirement);
    c.tx.operationalFulfillment.create.mockResolvedValue({ id: fulfillmentId });
    c.tx.operationalRequirement.updateMany.mockResolvedValue({ count: 1 });
    c.tx.operationalFulfillment.findFirst.mockResolvedValue(fulfillment({ travelPackageId: null, operationalRequirement: standaloneRequirement, passengers: [] }));
    await expect(c.service.createStandalone(tenantId, requirementId, { providerName: "Standalone supplier" }, actor)).resolves.toMatchObject({ travelPackageId: null, passengers: [] });
    expect(c.tx.operationalFulfillment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId, travelPackageId: null, operationalRequirementId: requirementId }) }));
    expect(c.tx.travelPackageParticipant.findMany).not.toHaveBeenCalled();
    expect(c.tx.operationalRequirementPassenger.findMany).not.toHaveBeenCalled();
    expect(c.tx.operationalFulfillmentPassenger.createMany).not.toHaveBeenCalled();
  });

  it("rejects standalone passenger operations clearly", async () => {
    const c = context();
    c.tx.operationalFulfillment.findFirst.mockResolvedValue(fulfillmentState({ travelPackageId: null, operationalRequirement: requirement({ scopeType: "STANDALONE_CUSTOMER", travelPackageId: null }) }));
    await expect(c.service.rejectStandalonePassengerAssignment(tenantId, requirementId, fulfillmentId)).rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_STANDALONE_PASSENGERS_UNSUPPORTED" }) });
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn(),
    travelPackageParticipant: { findMany: jest.fn() },
    user: { findFirst: jest.fn() },
    operationalRequirement: { findFirst: jest.fn(), updateMany: jest.fn() },
    operationalRequirementPassenger: { findMany: jest.fn() },
    operationalFulfillment: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
    operationalFulfillmentPassenger: { createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  const finance = { readMany: jest.fn() };
  return { tx, finance, service: new OperationalFulfillmentsService(prisma as never, finance) };
}

function createInput(overrides: Record<string, unknown> = {}) {
  return { participantIds: ["participant-a"], ...overrides } as any;
}

function requirement(overrides: Record<string, unknown> = {}) {
  return { id: requirementId, travelPackageId, status: "PENDING", servicePurposeCode: "LODGING", servicePurposeName: "Lodging", sourceType: "MANUAL", sourceId: null, sourceLineId: null, sourceVersionId: null, ...overrides };
}

function passenger(id = "participant-a") {
  return { travelPackageParticipantId: id, travelPackageParticipant: { id, clientId: id === "participant-a" ? "client-a" : "client-b", role: "TRAVELER", client: { fullName: "Ada Lovelace" } } };
}

function fulfillmentState(overrides: Record<string, unknown> = {}) {
  return {
    id: fulfillmentId, travelPackageId, operationalRequirementId: requirementId,
    servicePurposeCode: "LODGING", servicePurposeName: "Lodging",
    providerName: null, providerReference: null, reservationCode: null, confirmationReference: null, voucherReference: null, ticketReference: null,
    serviceStartAt: null, serviceEndAt: null, detailPayload: null, detailVersion: null,
    status: "DRAFT", assignedToUserId: null, assignedToName: null, confirmationNotes: null,
    createdAt: new Date("2026-09-30T10:00:00.000Z"), updatedAt: new Date("2026-09-30T10:00:00.000Z"),
    operationalRequirement: requirement(), ...overrides,
  };
}

function fulfillment(overrides: Record<string, unknown> = {}) {
  return { ...fulfillmentState(), passengers: [passenger()], _count: { purchases: 0 }, ...overrides };
}

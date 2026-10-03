import { BadRequestException, NotFoundException } from "@nestjs/common";
import { OperationalReadinessService } from "./operational-readiness.service";

const tenantId = "tenant-a";
const travelPackageId = "package-a";

describe("OperationalReadinessService", () => {
  it("derives package, service, critical, and inconsistency summaries from SQL coverage aggregates", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.$queryRaw
      .mockResolvedValueOnce([{ totalAssignments: 4, fulfilledAssignments: 2, participantCountWithRequirements: 3, completePassengerCount: 1, totalRosterPassengerCount: 5, criticalAssignmentCount: 2, criticalPending: 1, criticalOverdue: 1, criticalDueSoon: 1, nonCriticalPending: 1, inconsistentFulfilledRequirementCount: 1, services: [{ servicePurposeCode: "LODGING", servicePurposeName: "Lodging", totalAssignments: 3, fulfilledAssignments: 2 }, { servicePurposeCode: "TOUR", servicePurposeName: "Tour", totalAssignments: 1, fulfilledAssignments: 0 }] }]);

    await expect(c.service.readiness(tenantId, travelPackageId, new Date("2026-10-01T12:00:00.000Z"))).resolves.toMatchObject({
      overall: { totalAssignments: 4, fulfilledAssignments: 2, pendingAssignments: 2, progressPercent: 50, completePassengerCount: 1, participantCountWithRequirements: 3, totalRosterPassengerCount: 5 },
      readinessState: "AT_RISK", critical: { pending: 1, overdue: 1, dueSoon: 1 },
      services: [{ servicePurposeCode: "LODGING", progressPercent: 66.67 }, { servicePurposeCode: "TOUR", pendingAssignments: 1 }],
      inconsistency: { fulfilledRequirementWithoutCoverageCount: 1 },
    });
    expect(c.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(String(c.tx.$queryRaw.mock.calls[0][0])).toContain("all_assignments AS MATERIALIZED");
    expect(String(c.tx.$queryRaw.mock.calls[0][0])).toContain("CONFIRMED");
  });

  it("reports the confirmed 1-of-2 coverage fixture without consulting persisted Requirement status", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.$queryRaw.mockResolvedValueOnce([{ totalAssignments: 2, fulfilledAssignments: 1, participantCountWithRequirements: 2, completePassengerCount: 1, totalRosterPassengerCount: 2, criticalAssignmentCount: 1, criticalPending: 0, criticalOverdue: 0, criticalDueSoon: 0, nonCriticalPending: 1, inconsistentFulfilledRequirementCount: 0, services: [
      { servicePurposeCode: "INSURANCE", servicePurposeName: "Seguro", totalAssignments: 1, fulfilledAssignments: 1 },
      { servicePurposeCode: "BAGGAGE", servicePurposeName: "Equipaje", totalAssignments: 1, fulfilledAssignments: 0 },
    ] }]);
    await expect(c.service.readiness(tenantId, travelPackageId)).resolves.toMatchObject({
      overall: { totalAssignments: 2, fulfilledAssignments: 1, pendingAssignments: 1, progressPercent: 50, completePassengerCount: 1, participantCountWithRequirements: 2, totalRosterPassengerCount: 2 },
      services: [{ servicePurposeCode: "INSURANCE", progressPercent: 100, pendingAssignments: 0 }, { servicePurposeCode: "BAGGAGE", progressPercent: 0, pendingAssignments: 1 }],
    });
  });

  it.each([
    [{ criticalAssignmentCount: 1, criticalPending: 0, criticalOverdue: 0, criticalDueSoon: 0, nonCriticalPending: 0 }, "READY"],
    [{ criticalAssignmentCount: 1, criticalPending: 1, criticalOverdue: 0, criticalDueSoon: 0, nonCriticalPending: 0 }, "NOT_READY"],
    [{ criticalAssignmentCount: 0, criticalPending: 0, criticalOverdue: 0, criticalDueSoon: 0, nonCriticalPending: 0 }, "NO_CRITICAL_REQUIREMENTS"],
  ])("derives %s readiness state", async (risk, expected) => {
    const c = readinessContext(risk);
    await expect(c.service.readiness(tenantId, travelPackageId)).resolves.toMatchObject({ readinessState: expected });
  });

  it("does not expose cross-tenant or missing packages", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue(null);
    await expect(c.service.readiness(tenantId, travelPackageId)).rejects.toBeInstanceOf(NotFoundException);
    expect(c.tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("derives confirmed coverage once per Requirement/passenger and excludes cancelled/not-applicable assignments", async () => {
    const c = matrixContext({
      participants: [participant("a"), participant("b"), participant("c"), participant("d")],
      columns: [{ servicePurposeCode: "LODGING", servicePurposeName: "Lodging" }],
      assignments: [
        assignment("a", "r1", "FULFILLED"), assignment("a", "r2", "PENDING"),
        assignment("b", "r3", "CANCELLED"), assignment("c", "r4", "NOT_APPLICABLE"), assignment("d", "r5", "PENDING"),
      ],
      fulfillmentPassengers: [fulfillmentPassenger("a", "r1", "CONFIRMED"), fulfillmentPassenger("a", "r1", "CONFIRMED"), fulfillmentPassenger("d", "r5", "PURCHASED")],
    });
    const result = await c.service.passengerMatrix(tenantId, travelPackageId, {});
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ travelPackageParticipantId: "a", requirementCount: 2, fulfilledRequirementCount: 1, progressPercent: 50, isOperationallyComplete: false, serviceCells: [{ servicePurposeCode: "LODGING", status: "PENDING" }] }),
      expect.objectContaining({ travelPackageParticipantId: "b", requirementCount: 0, progressPercent: null, isOperationallyComplete: false, serviceCells: [{ servicePurposeCode: "LODGING", status: "NONE" }] }),
      expect.objectContaining({ travelPackageParticipantId: "c", requirementCount: 0, progressPercent: null, isOperationallyComplete: false, serviceCells: [{ servicePurposeCode: "LODGING", status: "NOT_APPLICABLE" }] }),
      expect.objectContaining({ travelPackageParticipantId: "d", progressPercent: 0, serviceCells: [{ servicePurposeCode: "LODGING", status: "IN_PROGRESS" }] }),
    ]));
  });

  it("marks fully covered passengers and service cells FULFILLED only with confirmed fulfillment passengers", async () => {
    const c = matrixContext({
      participants: [participant("a"), participant("b")], columns: [{ servicePurposeCode: "FLIGHT_TICKET", servicePurposeName: "Flight" }, { servicePurposeCode: "TOUR", servicePurposeName: "Tour" }],
      assignments: [assignment("a", "flight", "PENDING", "FLIGHT_TICKET"), assignment("a", "tour", "PENDING", "TOUR"), assignment("b", "flight", "PENDING", "FLIGHT_TICKET")],
      fulfillmentPassengers: [fulfillmentPassenger("a", "flight", "CONFIRMED"), fulfillmentPassenger("a", "tour", "CONFIRMED"), fulfillmentPassenger("a", "flight", "CONFIRMED")],
    });
    const result = await c.service.passengerMatrix(tenantId, travelPackageId, { page: 1, pageSize: 20 });
    expect(result.items[0]).toMatchObject({ isOperationallyComplete: true, progressPercent: 100, fulfilledRequirementCount: 2, serviceCells: [{ servicePurposeCode: "FLIGHT_TICKET", status: "FULFILLED" }, { servicePurposeCode: "TOUR", status: "FULFILLED" }] });
    expect(result.items[1]).toMatchObject({ isOperationallyComplete: false, progressPercent: 0 });
  });

  it("marks the confirmed passenger fulfilled while leaving the unrelated pending passenger incomplete", async () => {
    const c = matrixContext({
      participants: [participant("a"), participant("b")], columns: [{ servicePurposeCode: "INSURANCE", servicePurposeName: "Seguro" }, { servicePurposeCode: "BAGGAGE", servicePurposeName: "Equipaje" }],
      assignments: [assignment("a", "insurance", "IN_PROGRESS", "INSURANCE"), assignment("b", "baggage", "IN_PROGRESS", "BAGGAGE")],
      fulfillmentPassengers: [fulfillmentPassenger("a", "insurance", "CONFIRMED")],
    });
    const result = await c.service.passengerMatrix(tenantId, travelPackageId, {});
    expect(result.items[0]).toMatchObject({ progressPercent: 100, isOperationallyComplete: true, serviceCells: [{ servicePurposeCode: "INSURANCE", status: "FULFILLED" }, { servicePurposeCode: "BAGGAGE", status: "NONE" }] });
    expect(result.items[1]).toMatchObject({ progressPercent: 0, isOperationallyComplete: false, serviceCells: [{ servicePurposeCode: "INSURANCE", status: "NONE" }, { servicePurposeCode: "BAGGAGE", status: "IN_PROGRESS" }] });
  });

  it("uses one roster page, one assignment batch, and one fulfillment-passenger batch without per-cell queries", async () => {
    const c = matrixContext({ participants: [participant("a"), participant("b")], columns: [{ servicePurposeCode: "LODGING", servicePurposeName: "Lodging" }], assignments: [assignment("a", "r1", "IN_PROGRESS"), assignment("b", "r2", "PENDING")], fulfillmentPassengers: [] });
    await c.service.passengerMatrix(tenantId, travelPackageId, {});
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.operationalRequirementPassenger.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.operationalFulfillmentPassenger.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20 }));
  });

  it("aggregates a participant's multiple service purposes deterministically in one matrix pass", async () => {
    const c = matrixContext({
      participants: [participant("a")],
      columns: [
        { servicePurposeCode: "FLIGHT_TICKET", servicePurposeName: "Flight" },
        { servicePurposeCode: "LODGING", servicePurposeName: "Lodging" },
        { servicePurposeCode: "TOUR", servicePurposeName: "Tour" },
      ],
      assignments: [assignment("a", "flight", "PENDING", "FLIGHT_TICKET"), assignment("a", "lodging", "PENDING"), assignment("a", "tour", "IN_PROGRESS", "TOUR")],
      fulfillmentPassengers: [fulfillmentPassenger("a", "flight", "CONFIRMED")],
    });
    await expect(c.service.passengerMatrix(tenantId, travelPackageId, {})).resolves.toMatchObject({
      items: [expect.objectContaining({ serviceCells: [
        { servicePurposeCode: "FLIGHT_TICKET", status: "FULFILLED" },
        { servicePurposeCode: "LODGING", status: "PENDING" },
        { servicePurposeCode: "TOUR", status: "IN_PROGRESS" },
      ] })],
    });
  });

  it("enforces passenger-matrix bounds and safely handles an empty package", async () => {
    const c = matrixContext({ participants: [], columns: [], assignments: [], fulfillmentPassengers: [], total: 0 });
    await expect(c.service.passengerMatrix(tenantId, travelPackageId, { pageSize: 26 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(c.service.passengerMatrix(tenantId, travelPackageId, {})).resolves.toMatchObject({ items: [], total: 0, pageSize: 20, totalPages: 0 });
    expect(c.tx.operationalRequirementPassenger.findMany).not.toHaveBeenCalled();
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined), $queryRaw: jest.fn(),
    travelPackage: { findFirst: jest.fn() },
    travelPackageParticipant: { findMany: jest.fn(), count: jest.fn() },
    operationalRequirement: {}, operationalRequirementPassenger: { findMany: jest.fn() }, operationalFulfillmentPassenger: { findMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
  return { tx, service: new OperationalReadinessService(prisma as never) };
}

function readinessContext(risk: Record<string, number>) {
  const c = context();
  c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
  c.tx.$queryRaw
    .mockResolvedValueOnce([{ totalAssignments: 1, fulfilledAssignments: 0, participantCountWithRequirements: 1, completePassengerCount: 0, totalRosterPassengerCount: 1, ...risk, inconsistentFulfilledRequirementCount: 0, services: [] }]);
  return c;
}

function matrixContext(input: { participants: ReturnType<typeof participant>[]; columns: Array<{ servicePurposeCode: string; servicePurposeName: string }>; assignments: ReturnType<typeof assignment>[]; fulfillmentPassengers: ReturnType<typeof fulfillmentPassenger>[]; total?: number }) {
  const c = context();
  c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
  c.tx.travelPackageParticipant.findMany.mockResolvedValue(input.participants);
  c.tx.travelPackageParticipant.count.mockResolvedValue(input.total ?? input.participants.length);
  c.tx.$queryRaw.mockResolvedValue(input.columns);
  c.tx.operationalRequirementPassenger.findMany.mockResolvedValue(input.assignments);
  c.tx.operationalFulfillmentPassenger.findMany.mockResolvedValue(input.fulfillmentPassengers);
  return c;
}
function participant(id: string) { return { id, clientId: `client-${id}`, role: "PASSENGER", createdAt: new Date("2026-10-01T12:00:00.000Z"), client: { fullName: `Passenger ${id}` } }; }
function assignment(participantId: string, requirementId: string, status: string, servicePurposeCode = "LODGING") { return { travelPackageParticipantId: participantId, operationalRequirementId: requirementId, operationalRequirement: { id: requirementId, status, servicePurposeCode, servicePurposeName: servicePurposeCode === "LODGING" ? "Lodging" : servicePurposeCode === "TOUR" ? "Tour" : "Flight" } }; }
function fulfillmentPassenger(participantId: string, requirementId: string, status: string) { return { travelPackageParticipantId: participantId, operationalFulfillment: { operationalRequirementId: requirementId, status } }; }

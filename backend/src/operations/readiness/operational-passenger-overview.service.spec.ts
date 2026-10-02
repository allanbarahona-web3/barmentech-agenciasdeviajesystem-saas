import { OperationalPassengerOverviewService } from "./operational-passenger-overview.service";

const tenantId = "tenant-a", travelPackageId = "trip-a";

describe("OperationalPassengerOverviewService", () => {
  it("uses Requirement source snapshots for one bounded Finance read", async () => {
    const c = context();
    setupTrip(c);
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "p-a", clientId: "c-a", role: "HOLDER", client: { fullName: "Ada" } }, { id: "p-b", clientId: "c-b", role: "COMPANION", client: { fullName: "Ben" } }]);
    c.tx.travelPackageParticipant.count.mockResolvedValue(2);
    c.tx.passengerGroupMember.findMany.mockResolvedValue([]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([
      assignment("p-a", "r-contract", sourceRequirement("CONTRACT", "contract-a")),
      assignment("p-b", "r-service", sourceRequirement("ADDITIONAL_SERVICE_ORDER_LINE", "order-a", "line-a")),
    ]);
    c.tx.operationalFulfillmentPassenger.findMany.mockResolvedValue([]);
    c.notes.readNotesForParticipants.mockResolvedValue(new Map());
    c.additional.readForClients.mockResolvedValue(new Map());
    c.finance.readMany.mockResolvedValue([
      { source: { sourceType: "CONTRACT", sourceId: "contract-a" }, eligibility: "ELIGIBLE", reason: "SETTLED" },
      { source: { sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", travelPackageId }, eligibility: "BLOCKED", reason: "OUTSTANDING_BALANCE", financial: { outstandingAmount: "25", currency: "USD" } },
    ]);

    await expect(c.service.list(tenantId, travelPackageId, { page: 1, pageSize: 20 })).resolves.toMatchObject({ items: [
      { fullName: "Ada", financeEligibility: { eligibility: "ELIGIBLE" } },
      { fullName: "Ben", financeEligibility: { eligibility: "BLOCKED", outstandingAmount: "25" } },
    ] });
    expect(c.finance.readMany).toHaveBeenCalledTimes(1);
    expect(c.finance.readMany).toHaveBeenCalledWith({ tenantId, sources: [
      { sourceType: "CONTRACT", sourceId: "contract-a" },
      { sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", travelPackageId },
    ] });
  });

  it("fails closed for historical MANUAL work without calling Finance", async () => {
    const c = context();
    setupTrip(c);
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "p-a", clientId: "c-a", role: "HOLDER", client: { fullName: "Ada" } }]);
    c.tx.travelPackageParticipant.count.mockResolvedValue(1);
    c.tx.passengerGroupMember.findMany.mockResolvedValue([]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([assignment("p-a", "r-manual", sourceRequirement("MANUAL", null))]);
    c.tx.operationalFulfillmentPassenger.findMany.mockResolvedValue([]);
    c.notes.readNotesForParticipants.mockResolvedValue(new Map());
    c.additional.readForClients.mockResolvedValue(new Map());

    await expect(c.service.list(tenantId, travelPackageId, { page: 1, pageSize: 20 })).resolves.toMatchObject({ items: [{ financeEligibility: { eligibility: "UNKNOWN", sources: [] } }] });
    expect(c.finance.readMany).not.toHaveBeenCalled();
  });

  it("keeps the roster usable when optional readers are unavailable", async () => {
    const c = context();
    setupTrip(c);
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "p-a", clientId: "c-a", role: "HOLDER", client: { fullName: "Ada" } }]);
    c.tx.travelPackageParticipant.count.mockResolvedValue(1);
    c.tx.passengerGroupMember.findMany.mockResolvedValue([]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([]);
    c.notes.readNotesForParticipants.mockRejectedValue(new Error());
    c.additional.readForClients.mockRejectedValue(new Error());

    await expect(c.service.list(tenantId, travelPackageId, { page: 1, pageSize: 20 })).resolves.toMatchObject({ items: [{ fullName: "Ada", groups: [], operationalNotes: [], additionalServices: [], progress: { percent: null }, financeEligibility: { eligibility: "UNKNOWN" } }] });
    expect(c.tx.operationalFulfillmentPassenger.findMany).not.toHaveBeenCalled();
  });

  it("filters the paginated roster by an active group inside the tenant query", async () => {
    const c = context();
    setupTrip(c);
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([]);
    c.tx.travelPackageParticipant.count.mockResolvedValue(0);
    c.notes.readNotesForParticipants.mockResolvedValue(new Map());
    c.additional.readForClients.mockResolvedValue(new Map());

    await c.service.list(tenantId, travelPackageId, { page: 1, pageSize: 20, passengerGroupId: "group-a" });
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId, travelPackageId, passengerGroupMembers: { some: expect.objectContaining({ passengerGroupId: "group-a", passengerGroup: { tenantId, travelPackageId, status: "ACTIVE" } }) } }) }));
  });
});

function context() {
  const tx = { $executeRaw: jest.fn().mockResolvedValue(undefined), travelPackage: { findFirst: jest.fn() }, travelPackageParticipant: { findMany: jest.fn(), count: jest.fn() }, passengerGroupMember: { findMany: jest.fn() }, operationalRequirementPassenger: { findMany: jest.fn() }, operationalFulfillmentPassenger: { findMany: jest.fn() } };
  const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
  const notes = { readNotesForParticipants: jest.fn() }, additional = { readForClients: jest.fn() }, finance = { readMany: jest.fn() };
  return { tx, notes, additional, finance, service: new OperationalPassengerOverviewService(prisma as never, notes as never, finance as never, additional as never) };
}
function setupTrip(c: ReturnType<typeof context>) { c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId, packageCode: "PKG-1", name: "Costa Rica", destination: "San José", departureDate: new Date(), returnDate: new Date() }); }
function sourceRequirement(sourceType: string, sourceId: string | null, sourceLineId: string | null = null) { return { travelPackageId, status: "IN_PROGRESS", servicePurposeCode: "FLIGHT_TICKET", servicePurposeName: "Vuelo", critical: true, operationalDeadlineAt: null, sourceType, sourceId, sourceLineId, sourceVersionId: null }; }
function assignment(travelPackageParticipantId: string, operationalRequirementId: string, operationalRequirement: ReturnType<typeof sourceRequirement>) { return { travelPackageParticipantId, operationalRequirementId, operationalRequirement }; }

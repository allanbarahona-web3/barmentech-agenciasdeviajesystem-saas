import { OperationalPassengerRosterService } from "./operational-passenger-roster.service";

const tenantId = "tenant-a", travelPackageId = "trip-a";

describe("OperationalPassengerRosterService", () => {
  it("returns only the bounded roster projection with batched groups and progress", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a", clientId: "client-a", role: "HOLDER", client: { fullName: "Ada" } }]);
    c.tx.travelPackageParticipant.count.mockResolvedValue(1);
    c.tx.passengerGroupMember.findMany.mockResolvedValue([{ travelPackageParticipantId: "participant-a", passengerGroup: { id: "group-a", name: "Familia", serviceCode: "LODGING", serviceName: "Hospedaje", color: "#123" } }]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([{ travelPackageParticipantId: "participant-a", operationalRequirementId: "requirement-a", operationalRequirement: { status: "IN_PROGRESS" } }]);
    c.tx.operationalFulfillmentPassenger.findMany.mockResolvedValue([{ travelPackageParticipantId: "participant-a", operationalFulfillment: { operationalRequirementId: "requirement-a", status: "CONFIRMED" } }]);

    const result = await c.service.list(tenantId, travelPackageId, { page: 1, pageSize: 20 });

    expect(result).toMatchObject({ page: 1, pageSize: 20, total: 1, totalPages: 1, items: [{ travelPackageParticipantId: "participant-a", clientId: "client-a", fullName: "Ada", role: "HOLDER", groups: [{ id: "group-a", name: "Familia" }], progress: { fulfilled: 1, total: 1, percent: 100, isOperationallyComplete: true } }] });
    expect(Object.keys(result.items[0]).sort()).toEqual(["clientId", "fullName", "groups", "progress", "role", "travelPackageParticipantId"]);
    expect(c.tx.passengerGroupMember.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.operationalRequirementPassenger.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.operationalFulfillmentPassenger.findMany).toHaveBeenCalledTimes(1);
    expect(c.service).not.toHaveProperty("notes");
    expect(c.service).not.toHaveProperty("additional");
    expect(c.service).not.toHaveProperty("finance");
  });

  it("applies tenant/package/search predicates and deterministic pagination before batch enrichment", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([]);
    c.tx.travelPackageParticipant.count.mockResolvedValue(0);

    await c.service.list(tenantId, travelPackageId, { page: 2, pageSize: 20, search: " Ada " });

    expect(c.tx.travelPackage.findFirst).toHaveBeenCalledWith({ where: { id: travelPackageId, tenantId }, select: { id: true } });
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId, travelPackageId, client: { fullName: { contains: "Ada", mode: "insensitive" } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: 20, take: 20 }));
    expect(c.tx.passengerGroupMember.findMany).not.toHaveBeenCalled();
    expect(c.tx.operationalRequirementPassenger.findMany).not.toHaveBeenCalled();
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    travelPackage: { findFirst: jest.fn() },
    travelPackageParticipant: { findMany: jest.fn(), count: jest.fn() },
    passengerGroupMember: { findMany: jest.fn() },
    operationalRequirementPassenger: { findMany: jest.fn() },
    operationalFulfillmentPassenger: { findMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
  return { tx, service: new OperationalPassengerRosterService(prisma as never) };
}

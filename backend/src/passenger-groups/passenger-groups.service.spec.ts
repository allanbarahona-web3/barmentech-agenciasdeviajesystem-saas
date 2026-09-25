import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { PassengerGroupsService } from "./passenger-groups.service";

const tenantId = "tenant-a";
const travelPackageId = "travel-a";
const actor = { userId: "user-a", name: "Agent A" };

describe("PassengerGroupsService", () => {
  it("creates an ACTIVE group from the tenant catalog snapshots", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.additionalServiceCatalog.findFirst.mockResolvedValue(catalog());
    c.tx.passengerGroup.create.mockResolvedValue(group());

    await expect(c.service.create(tenantId, travelPackageId, {
      additionalServiceCatalogId: "catalog-lodging",
      name: " Room 1 ",
      color: " blue ",
      notes: " Matrimonial para 3 ",
    }, actor)).resolves.toMatchObject({
      status: "ACTIVE",
      serviceCode: "LODGING",
      serviceName: "Hospedaje",
      name: "Room 1",
    });

    expect(c.tx.passengerGroup.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId,
        travelPackageId,
        additionalServiceCatalogId: "catalog-lodging",
        serviceCode: "LODGING",
        serviceName: "Hospedaje",
        name: "Room 1",
        color: "blue",
        notes: "Matrimonial para 3",
        status: "ACTIVE",
        createdByUserId: actor.userId,
      }),
    }));
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it.each([
    [catalog({ isActive: false }), ConflictException, "PASSENGER_GROUP_CATALOG_INACTIVE"],
    [catalog({ code: "VISA_ASSISTANCE" }), BadRequestException, "PASSENGER_GROUP_CATALOG_CODE_NOT_ALLOWED"],
    [null, NotFoundException, "PASSENGER_GROUP_CATALOG_NOT_FOUND"],
  ])("rejects inactive, non-groupable, and cross-tenant catalogs", async (resolvedCatalog, error, code) => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.additionalServiceCatalog.findFirst.mockResolvedValue(resolvedCatalog);

    await expect(c.service.create(tenantId, travelPackageId, {
      additionalServiceCatalogId: "catalog-other-tenant",
      name: "Room 1",
    }, actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: code }) });
    expect(c.tx.passengerGroup.create).not.toHaveBeenCalled();
    expect(error).toBeDefined();
  });

  it("lists groups with participant and Client display data in one nested query", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.passengerGroup.findMany.mockResolvedValue([group()]);

    await expect(c.service.list(tenantId, travelPackageId)).resolves.toEqual([
      expect.objectContaining({
        id: "group-a",
        members: [{ travelPackageParticipantId: "participant-a", clientId: "client-a", fullName: "Ada Lovelace" }],
      }),
    ]);
    expect(c.tx.passengerGroup.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId, travelPackageId },
      select: expect.objectContaining({ members: expect.any(Object) }),
    }));
  });

  it("gets one group only through tenant and TravelPackage predicates", async () => {
    const c = context();
    c.tx.passengerGroup.findFirst.mockResolvedValue(group());

    await expect(c.service.find(tenantId, travelPackageId, "group-a")).resolves.toMatchObject({ id: "group-a" });
    expect(c.tx.passengerGroup.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "group-a", tenantId, travelPackageId },
    }));
  });

  it("hides cross-tenant group access as not found", async () => {
    const c = context();
    c.tx.passengerGroup.findFirst.mockResolvedValue(null);

    await expect(c.service.find("tenant-b", travelPackageId, "group-a"))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "PASSENGER_GROUP_NOT_FOUND" }) });
  });

  it("updates only group metadata and records the actor", async () => {
    const c = context();
    c.tx.passengerGroup.findFirst.mockResolvedValue(group());
    c.tx.passengerGroup.updateMany.mockResolvedValue({ count: 1 });

    await expect(c.service.update(tenantId, travelPackageId, "group-a", {
      name: " Room 2 ", color: " green ", notes: " Shared transfer ",
    }, actor)).resolves.toMatchObject({ id: "group-a" });
    expect(c.tx.passengerGroup.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "group-a", tenantId, travelPackageId, status: "ACTIVE" },
      data: expect.objectContaining({
        name: "Room 2", color: "green", notes: "Shared transfer",
        updatedByUserId: actor.userId,
      }),
    }));
  });

  it("refreshes snapshots only when the catalog identity changes", async () => {
    const c = context();
    c.tx.passengerGroup.findFirst.mockResolvedValue(group());
    c.tx.additionalServiceCatalog.findFirst.mockResolvedValue(catalog({ id: "catalog-flight", code: "FLIGHT_TICKET", name: "Boletos aéreos" }));
    c.tx.passengerGroup.updateMany.mockResolvedValue({ count: 1 });

    await c.service.update(tenantId, travelPackageId, "group-a", {
      additionalServiceCatalogId: "catalog-flight",
    }, actor);
    expect(c.tx.passengerGroup.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        additionalServiceCatalogId: "catalog-flight",
        serviceCode: "FLIGHT_TICKET",
        serviceName: "Boletos aéreos",
      }),
    }));
  });

  it("rejects empty updates and archived group updates", async () => {
    const c = context();
    expect(() => c.service.update(tenantId, travelPackageId, "group-a", {}, actor))
      .toThrow("PASSENGER_GROUP_UPDATE_EMPTY");

    c.tx.passengerGroup.findFirst.mockResolvedValue(group({ status: "ARCHIVED" }));
    await expect(c.service.update(tenantId, travelPackageId, "group-a", { name: "Changed" }, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "PASSENGER_GROUP_ARCHIVED_IMMUTABLE" }) });
  });

  it("adds multiple valid participants atomically and returns current membership", async () => {
    const c = context();
    c.tx.passengerGroup.findFirst.mockResolvedValue(group());
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }, { id: "participant-b" }]);
    c.tx.passengerGroupMember.createMany.mockResolvedValue({ count: 2 });

    await expect(c.service.addMembers(tenantId, travelPackageId, "group-a", {
      participantIds: ["participant-a", "participant-b"],
    }, actor)).resolves.toMatchObject({ id: "group-a" });
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledWith({
      where: { tenantId, travelPackageId, id: { in: ["participant-a", "participant-b"] } },
      select: { id: true },
    });
    expect(c.tx.passengerGroupMember.createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: expect.arrayContaining([
        expect.objectContaining({ travelPackageParticipantId: "participant-a", travelPackageId }),
        expect.objectContaining({ travelPackageParticipantId: "participant-b", travelPackageId }),
      ]),
    }));
  });

  it("deduplicates membership input so repeated assignment is idempotent", async () => {
    const c = context();
    c.tx.passengerGroup.findFirst.mockResolvedValue(group());
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    c.tx.passengerGroupMember.createMany.mockResolvedValue({ count: 0 });

    await c.service.addMembers(tenantId, travelPackageId, "group-a", {
      participantIds: ["participant-a", "participant-a"],
    }, actor);
    expect(c.tx.passengerGroupMember.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ travelPackageParticipantId: "participant-a" })],
      skipDuplicates: true,
    }));
  });

  it("rejects an invalid batch before any membership write", async () => {
    const c = context();
    c.tx.passengerGroup.findFirst.mockResolvedValue(group());
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);

    await expect(c.service.addMembers(tenantId, travelPackageId, "group-a", {
      participantIds: ["participant-a", "participant-other-trip"],
    }, actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: "PASSENGER_GROUP_PARTICIPANT_NOT_FOUND_IN_TRAVEL_PACKAGE" }) });
    expect(c.tx.passengerGroupMember.createMany).not.toHaveBeenCalled();
  });

  it("treats a cross-tenant participant as unavailable in the current TravelPackage", async () => {
    const c = context();
    c.tx.passengerGroup.findFirst.mockResolvedValue(group());
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([]);

    await expect(c.service.addMembers(tenantId, travelPackageId, "group-a", {
      participantIds: ["participant-tenant-b"],
    }, actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: "PASSENGER_GROUP_PARTICIPANT_NOT_FOUND_IN_TRAVEL_PACKAGE" }) });
  });

  it("removes multiple members, while non-members remain an idempotent no-op", async () => {
    const c = context();
    c.tx.passengerGroup.findFirst.mockResolvedValue(group());
    c.tx.passengerGroupMember.deleteMany.mockResolvedValue({ count: 1 });

    await expect(c.service.removeMembers(tenantId, travelPackageId, "group-a", {
      participantIds: ["participant-a", "participant-not-member"],
    })).resolves.toMatchObject({ id: "group-a" });
    expect(c.tx.passengerGroupMember.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId,
        travelPackageId,
        passengerGroupId: "group-a",
        travelPackageParticipantId: { in: ["participant-a", "participant-not-member"] },
      },
    });
  });

  it("archives idempotently and preserves members", async () => {
    const c = context();
    c.tx.passengerGroup.findFirst
      .mockResolvedValueOnce(group())
      .mockResolvedValueOnce(group({ status: "ARCHIVED" }));
    c.tx.passengerGroup.updateMany.mockResolvedValue({ count: 1 });

    await expect(c.service.archive(tenantId, travelPackageId, "group-a", actor))
      .resolves.toMatchObject({ status: "ARCHIVED", members: expect.any(Array) });
    expect(c.tx.passengerGroup.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ARCHIVED" }),
    }));

    const archived = context();
    archived.tx.passengerGroup.findFirst.mockResolvedValue(group({ status: "ARCHIVED" }));
    await expect(archived.service.archive(tenantId, travelPackageId, "group-a", actor))
      .resolves.toMatchObject({ status: "ARCHIVED" });
    expect(archived.tx.passengerGroup.updateMany).not.toHaveBeenCalled();
  });

  it("rejects membership changes for archived groups", async () => {
    const c = context();
    c.tx.passengerGroup.findFirst.mockResolvedValue(group({ status: "ARCHIVED" }));

    await expect(c.service.addMembers(tenantId, travelPackageId, "group-a", {
      participantIds: ["participant-a"],
    }, actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: "PASSENGER_GROUP_ARCHIVED_IMMUTABLE" }) });
    await expect(c.service.removeMembers(tenantId, travelPackageId, "group-a", {
      participantIds: ["participant-a"],
    })).rejects.toMatchObject({ response: expect.objectContaining({ message: "PASSENGER_GROUP_ARCHIVED_IMMUTABLE" }) });
  });

  it("returns paginated grouping summaries with unique active-member counts in two aggregate reads", async () => {
    const c = context();
    c.tx.$queryRaw
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce([
        {
          travelPackageId: "travel-a",
          packageCode: "TP-A",
          name: "Europa",
          destination: "Madrid",
          departureDate: new Date("2027-01-10T00:00:00.000Z"),
          returnDate: new Date("2027-01-20T00:00:00.000Z"),
          status: "OPEN",
          passengerCount: 3,
          groupedPassengerCount: 2,
        },
        {
          travelPackageId: "travel-empty",
          packageCode: "TP-B",
          name: "Sin pasajeros",
          destination: "Roma",
          departureDate: new Date("2027-02-10T00:00:00.000Z"),
          returnDate: new Date("2027-02-20T00:00:00.000Z"),
          status: "OPEN",
          passengerCount: 0,
          groupedPassengerCount: 0,
        },
      ]);

    await expect(c.service.listTravelPackageSummaries(tenantId, {
      travelType: "INTERNATIONAL" as any,
      page: 1,
      pageSize: 20,
    })).resolves.toMatchObject({
      total: 2,
      totalPages: 1,
      items: [
        { travelPackageId: "travel-a", passengerCount: 3, groupedPassengerCount: 2, ungroupedPassengerCount: 1 },
        { travelPackageId: "travel-empty", passengerCount: 0, groupedPassengerCount: 0, ungroupedPassengerCount: 0 },
      ],
    });

    expect(c.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(c.tx.travelPackage.findFirst).not.toHaveBeenCalled();
    expect(c.tx.passengerGroup.findMany).not.toHaveBeenCalled();
    const aggregateSql = c.tx.$queryRaw.mock.calls[1][0].join(" ");
    expect(aggregateSql).toContain('COUNT(DISTINCT member."travelPackageParticipantId")');
    expect(aggregateSql).toContain('passenger_group."status" = \'ACTIVE\'');
    expect(aggregateSql).toContain('selected_packages');
    expect(c.tx.$queryRaw.mock.calls.flat()).toContain(tenantId);
  });

  it("scopes grouping summaries by requested tenant and TravelPackage category", async () => {
    const c = context();
    c.tx.$queryRaw.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);

    await c.service.listTravelPackageSummaries("tenant-b", {
      travelType: "MIGRATION" as any,
      page: 2,
      pageSize: 20,
      search: "Canadá",
    });

    const countSql = c.tx.$queryRaw.mock.calls[0][0].join(" ");
    const aggregateSql = c.tx.$queryRaw.mock.calls[1][0].join(" ");
    expect(countSql).toContain('travel_package."tenantId"');
    expect(countSql).toContain('travel_package."travelType"');
    expect(aggregateSql).toContain('LIMIT');
    expect(aggregateSql).toContain('OFFSET');
    expect(c.tx.$queryRaw.mock.calls.flat()).toContain("tenant-b");
    expect(c.tx.$queryRaw.mock.calls.flat()).toContain("MIGRATION");
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    travelPackage: { findFirst: jest.fn() },
    additionalServiceCatalog: { findFirst: jest.fn() },
    passengerGroup: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    travelPackageParticipant: { findMany: jest.fn() },
    passengerGroupMember: { createMany: jest.fn(), deleteMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
  };
  return { tx, service: new PassengerGroupsService(prisma as never) };
}

function catalog(overrides: Record<string, unknown> = {}) {
  return { id: "catalog-lodging", code: "LODGING", name: "Hospedaje", isActive: true, ...overrides };
}

function group(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-a",
    travelPackageId,
    additionalServiceCatalogId: "catalog-lodging",
    serviceCode: "LODGING",
    serviceName: "Hospedaje",
    name: "Room 1",
    color: "blue",
    notes: "Matrimonial para 3",
    status: "ACTIVE" as const,
    createdAt: new Date("2026-09-24T10:00:00.000Z"),
    updatedAt: new Date("2026-09-24T10:00:00.000Z"),
    members: [{
      travelPackageParticipantId: "participant-a",
      travelPackageParticipant: {
        id: "participant-a",
        clientId: "client-a",
        client: { fullName: "Ada Lovelace" },
      },
    }],
    ...overrides,
  };
}

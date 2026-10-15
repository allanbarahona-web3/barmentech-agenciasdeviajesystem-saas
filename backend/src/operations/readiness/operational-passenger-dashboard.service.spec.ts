import { OperationalPassengerDashboardService } from "./operational-passenger-dashboard.service";

const tenantId = "tenant-a";
const travelPackageId = "trip-a";

describe("OperationalPassengerDashboardService", () => {
  it("returns base and Additional Service work per passenger, repeats shared authority, and keeps execution state passenger-specific", async () => {
    const c = context();
    c.tx.$queryRaw.mockResolvedValue(pageRows());
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([
      assignment("p-a", "r-shared", "TRAVEL_PACKAGE_COST_COMPONENT", "PENDING", 4),
      assignment("p-a", "r-additional", "ADDITIONAL_SERVICE_ORDER_LINE", "PENDING", 1),
      assignment("p-b", "r-shared", "TRAVEL_PACKAGE_COST_COMPONENT", "PENDING", 4),
    ]);
    c.tx.operationalFulfillmentPassenger.findMany.mockResolvedValue([
      fulfillment("p-a", "r-shared", "PURCHASED", 1),
      fulfillment("p-b", "r-shared", "CONFIRMED", 1),
    ]);

    const result = await c.service.list(tenantId, travelPackageId, { page: 1, pageSize: 20 });

    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ participant: expect.objectContaining({ travelPackageParticipantId: "p-a", clientId: "c-a", fullName: "Álvaro", identification: "1-100" }), requirements: expect.arrayContaining([
        expect.objectContaining({ requirementId: "r-shared", sourceLabel: "Contrato base", sharedPassengerCount: 4, purchaseStatus: "PURCHASED", confirmationStatus: "PENDING" }),
        expect.objectContaining({ requirementId: "r-additional", sourceLabel: "Servicio adicional", sharedPassengerCount: 1 }),
      ]) }),
      expect.objectContaining({ participant: expect.objectContaining({ travelPackageParticipantId: "p-b" }), requirements: [expect.objectContaining({ requirementId: "r-shared", purchaseStatus: "PURCHASED", confirmationStatus: "CONFIRMED" })] }),
    ]));
    expect(result.items[0]!.participant).not.toHaveProperty("dateOfBirth");
    expect(result.items[0]!.participant).not.toHaveProperty("documents");
    expect(result.items[0]!.participant).toMatchObject({ ageAtTrip: 30 });
    expect(c.tx.operationalRequirementPassenger.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.operationalFulfillmentPassenger.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.contractNote.groupBy).toHaveBeenCalledTimes(1);
  });

  it("derives age at trip departure from the participant snapshot only and leaves absent snapshots null", async () => {
    const c = context();
    const rows = pageRows().map((row, index) => ({ ...row, dateOfBirth: index === 1 ? null : row.dateOfBirth }));
    c.tx.$queryRaw.mockResolvedValue(rows);

    const result = await c.service.list(tenantId, travelPackageId, { page: 1, pageSize: 20 });

    expect(result.items.map((item) => item.participant.ageAtTrip)).toEqual([30, null]);
    expect(result.items[0]!.participant).not.toHaveProperty("dateOfBirth");
    const [sql] = c.tx.$queryRaw.mock.calls[0]!;
    expect(sql.join(" ")).toContain('p."dateOfBirth"');
    expect(sql.join(" ")).not.toContain('c."dateOfBirth"');
  });

  it("preserves every Contract source, group membership, and trip-level facets without per-passenger reads", async () => {
    const c = context();
    c.tx.$queryRaw.mockResolvedValue(pageRows());
    c.tx.travelPackageParticipantContractSource.findMany.mockResolvedValue([
      contract("p-a", "contract-a", "ALM-B899", "HOLDER"),
      contract("p-a", "contract-b", "ALM-C100", "COMPANION"),
    ]);
    c.tx.passengerGroupMember.findMany.mockResolvedValue([group("p-a", "group-a", "Habitación 2"), group("p-b", "group-a", "Habitación 2")]);

    const result = await c.service.list(tenantId, travelPackageId, { page: 1, pageSize: 20 });

    expect(result.items[0]!.contractSources).toEqual([
      { contractId: "contract-a", contractNumber: "ALM-B899", status: "APPROVED", sourceRole: "HOLDER" },
      { contractId: "contract-b", contractNumber: "ALM-C100", status: "APPROVED", sourceRole: "COMPANION" },
    ]);
    expect(result.items[0]!.passengerGroups).toEqual([expect.objectContaining({ id: "group-a", name: "Habitación 2" })]);
    expect(result.facets.contracts).toHaveLength(2);
    expect(result.facets.passengerGroups).toEqual([expect.objectContaining({ id: "group-a" })]);
    expect(c.tx.travelPackageParticipantContractSource.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.passengerGroupMember.findMany).toHaveBeenCalledTimes(1);
  });

  it("returns active Contract note counts with one aggregate query for the current page", async () => {
    const c = context();
    c.tx.$queryRaw.mockResolvedValue(pageRows());
    c.tx.contractNote.groupBy.mockResolvedValue([
      { clientId: "c-a", _count: { _all: 2 } },
      { clientId: "c-b", _count: { _all: 1 } },
    ]);

    const result = await c.service.list(tenantId, travelPackageId, { page: 1, pageSize: 20 });

    expect(result.items.map((item) => item.operationalNoteCount)).toEqual([2, 1]);
    expect(c.tx.contractNote.groupBy).toHaveBeenCalledTimes(1);
    expect(c.tx.contractNote.groupBy).toHaveBeenCalledWith({
      by: ["clientId"],
      where: {
        tenantId,
        travelPackageId,
        clientId: { in: ["c-a", "c-b"] },
        status: "ACTIVE",
      },
      _count: { _all: true },
    });
  });

  it("applies source and execution-status filters to requirement rows", async () => {
    const c = context();
    c.tx.$queryRaw.mockResolvedValue(pageRows());
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([
      assignment("p-a", "r-base", "TRAVEL_PACKAGE_COST_COMPONENT", "PENDING", 1),
      assignment("p-a", "r-add", "ADDITIONAL_SERVICE_ORDER_LINE", "PENDING", 1),
    ]);
    c.tx.operationalFulfillmentPassenger.findMany.mockResolvedValue([fulfillment("p-a", "r-add", "PURCHASED", 1)]);

    const result = await c.service.list(tenantId, travelPackageId, { page: 2, pageSize: 25, source: "ADDITIONAL_SERVICES", status: "PURCHASED", search: "alvaro", contractId: "contract-a", passengerGroupId: "group-a" });

    expect(result.items[0]!.requirements).toEqual([expect.objectContaining({ requirementId: "r-add", status: "PURCHASED" })]);
    expect(result.pagination).toEqual({ page: 2, pageSize: 25, total: 2, totalPages: 1 });
    const [sql, ...values] = c.tx.$queryRaw.mock.calls[0]!;
    expect(sql.join(" ")).toContain('translate(lower(c."fullName")');
    expect(sql.join(" ")).toContain('c."idNumber"');
    expect(sql.join(" ")).toContain('ORDER BY translate(lower("fullName")');
    expect(values).toEqual(expect.arrayContaining([tenantId, travelPackageId, "contract-a", "group-a", "ADDITIONAL_SERVICES", "PURCHASED", "%alvaro%"]));
  });

  it("uses explicit tenant/trip predicates and returns a not-found error before dependent reads", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue(null);

    await expect(c.service.list(tenantId, travelPackageId, { page: 1, pageSize: 20 })).rejects.toThrow("OPERATIONAL_PASSENGER_DASHBOARD_TRAVEL_PACKAGE_NOT_FOUND");
    expect(c.tx.travelPackage.findFirst).toHaveBeenCalledWith({ where: { id: travelPackageId, tenantId }, select: { id: true, departureDate: true } });
    expect(c.tx.$queryRaw).not.toHaveBeenCalled();
    expect(c.tx.operationalRequirementPassenger.findMany).not.toHaveBeenCalled();
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn(),
    travelPackage: { findFirst: jest.fn().mockResolvedValue({ id: travelPackageId, departureDate: new Date("2026-10-15T00:00:00.000Z") }) },
    travelPackageParticipantContractSource: { findMany: jest.fn().mockResolvedValue([]) },
    passengerGroupMember: { findMany: jest.fn().mockResolvedValue([]) },
    operationalRequirementPassenger: { findMany: jest.fn().mockResolvedValue([]) },
    operationalFulfillmentPassenger: { findMany: jest.fn().mockResolvedValue([]) },
    contractNote: { groupBy: jest.fn().mockResolvedValue([]) },
  };
  const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
  return { tx, service: new OperationalPassengerDashboardService(prisma as never) };
}

function pageRows() {
  return [
    { travelPackageParticipantId: "p-a", clientId: "c-a", fullName: "Álvaro", identification: "1-100", role: "HOLDER", dateOfBirth: new Date("1996-10-15T00:00:00.000Z"), total: 2, sourceFacets: ["BASE_TRIP", "ADDITIONAL_SERVICES"], statusFacets: ["PENDING", "PURCHASED", "CONFIRMED"], passengerCount: 2, requirementCount: 3, pendingCount: 2, confirmedCount: 1 },
    { travelPackageParticipantId: "p-b", clientId: "c-b", fullName: "Bea", identification: "2-200", role: "COMPANION", dateOfBirth: new Date("2000-02-02T00:00:00.000Z"), total: 2, sourceFacets: ["BASE_TRIP", "ADDITIONAL_SERVICES"], statusFacets: ["PENDING", "PURCHASED", "CONFIRMED"], passengerCount: 2, requirementCount: 3, pendingCount: 2, confirmedCount: 1 },
  ];
}

function assignment(participantId: string, requirementId: string, sourceType: string, status: string, passengerCount: number) {
  return { travelPackageParticipantId: participantId, operationalRequirementId: requirementId, operationalRequirement: { servicePurposeName: requirementId, sourceType, status, _count: { passengers: passengerCount } } };
}
function fulfillment(participantId: string, requirementId: string, status: string, purchases: number) {
  return { travelPackageParticipantId: participantId, operationalFulfillment: { operationalRequirementId: requirementId, status, reservationCode: null, purchases: Array.from({ length: purchases }, (_value, index) => ({ id: `${requirementId}-${index}` })) } };
}
function contract(participantId: string, contractId: string, contractNumber: string, sourceRole: string) {
  return { travelPackageParticipantId: participantId, contractId, sourceRole, contract: { contractNumber, status: "APPROVED" } };
}
function group(participantId: string, id: string, name: string) {
  return { travelPackageParticipantId: participantId, passengerGroup: { id, name, color: "#123456", serviceCode: "LODGING", serviceName: "Hospedaje" } };
}

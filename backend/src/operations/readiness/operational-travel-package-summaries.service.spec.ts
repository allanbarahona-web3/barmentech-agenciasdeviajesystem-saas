import { OperationalTravelPackageSummariesService } from "./operational-travel-package-summaries.service";

const tenantId = "tenant-a";

describe("OperationalTravelPackageSummariesService", () => {
  it("returns one tenant-scoped, travel-type-filtered summary page with aggregate operational coverage", async () => {
    const c = context();
    c.tx.$queryRaw
      .mockResolvedValueOnce([{ total: 21 }])
      .mockResolvedValueOnce([row({ totalAssignments: 3, fulfilledAssignments: 2, completePassengerCount: 1, participantCountWithRequirements: 2, criticalAssignmentCount: 1, criticalPending: 1, criticalDueSoon: 1 })]);
    await expect(c.service.list(tenantId, { travelType: "INTERNATIONAL", page: 2, pageSize: 20, search: " Costa " }, new Date("2026-10-01T12:00:00.000Z")))
      .resolves.toMatchObject({ total: 21, page: 2, totalPages: 2, items: [{ travelPackageId: "package-a", operational: { progressPercent: 66.67, readinessState: "AT_RISK", criticalPending: 1 } }] });
    expect(c.tx.$queryRaw).toHaveBeenCalledTimes(2);
    const query = String(c.tx.$queryRaw.mock.calls[1][0]);
    expect(query).toContain("selected_packages");
    expect(query).toContain("CONFIRMED");
    expect(query).toContain("LIMIT");
    expect(c.tx.$queryRaw.mock.calls[1]).toContain("INTERNATIONAL");
  });

  it("returns neutral progress and readiness for packages without applicable requirements", async () => {
    const c = context();
    c.tx.$queryRaw.mockResolvedValueOnce([{ total: 1 }]).mockResolvedValueOnce([row()]);
    await expect(c.service.list(tenantId, { travelType: "MIGRATION", page: 1, pageSize: 20 })).resolves.toMatchObject({
      items: [{ operational: { progressPercent: null, readinessState: "NO_CRITICAL_REQUIREMENTS", completePassengerCount: 0 } }],
    });
  });

  it("establishes the RLS tenant context once for the bounded summary request", async () => {
    const c = context();
    c.tx.$queryRaw.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await c.service.list(tenantId, { travelType: "INTERNATIONAL", page: 1, pageSize: 20 });
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(c.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

function context() {
  const tx = { $executeRaw: jest.fn().mockResolvedValue(undefined), $queryRaw: jest.fn() };
  const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
  return { tx, prisma, service: new OperationalTravelPackageSummariesService(prisma as never) };
}
function row(overrides: Record<string, unknown> = {}) {
  return {
    travelPackageId: "package-a", packageCode: "PKG-1", name: "Costa Rica", destination: "San José", departureDate: new Date("2026-10-10T00:00:00.000Z"), returnDate: new Date("2026-10-15T00:00:00.000Z"), status: "OPEN", passengerCount: 3,
    totalAssignments: 0, fulfilledAssignments: 0, completePassengerCount: 0, participantCountWithRequirements: 0, criticalAssignmentCount: 0, criticalPending: 0, criticalDueSoon: 0,
    ...overrides,
  };
}

import { PrismaContractedTravelPackageRosterReader } from "./prisma-contracted-travel-package-roster-reader";

describe("PrismaContractedTravelPackageRosterReader", () => {
  it("returns only stable participant identities with Contract provenance in a bounded page", async () => {
    const c = context();
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([
      { id: "participant-a", clientId: "client-a" },
      { id: "participant-b", clientId: "client-b" },
      { id: "participant-c", clientId: "client-c" },
    ]);

    await expect(c.reader.readContractedRoster({ tenantId: "tenant-a", travelPackageId: "travel-a", limit: 2 }))
      .resolves.toEqual({ participants: [{ id: "participant-a", clientId: "client-a" }, { id: "participant-b", clientId: "client-b" }], nextCursor: "participant-b" });
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: "tenant-a",
        travelPackageId: "travel-a",
        contractSources: { some: { tenantId: "tenant-a", travelPackageId: "travel-a" } },
      }),
      orderBy: { id: "asc" },
      take: 3,
    }));
    expect((c.tx as Record<string, unknown>).contract).toBeUndefined();
  });

  it("does not use participant names and rejects unbounded requests", async () => {
    const c = context();
    await expect(c.reader.readContractedRoster({ tenantId: "tenant-a", travelPackageId: "travel-a", limit: 26 }))
      .rejects.toMatchObject({ message: "OPERATIONAL_CONTRACTED_ROSTER_LIMIT_INVALID" });
    expect(c.tx.travelPackageParticipant.findMany).not.toHaveBeenCalled();
  });

  it("reads multiple package rosters in one tenant-scoped bounded query", async () => {
    const c = context();
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([
      { id: "participant-a", clientId: "client-a", travelPackageId: "travel-a" },
      { id: "participant-b", clientId: "client-b", travelPackageId: "travel-b" },
    ]);
    await expect(c.reader.readContractedRosters({ tenantId: "tenant-a", travelPackageIds: ["travel-a", "travel-b"] }))
      .resolves.toEqual(new Map([
        ["travel-a", [{ id: "participant-a", clientId: "client-a" }]],
        ["travel-b", [{ id: "participant-b", clientId: "client-b" }]],
      ]));
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: "tenant-a", travelPackageId: { in: ["travel-a", "travel-b"] } }),
      orderBy: [{ travelPackageId: "asc" }, { id: "asc" }],
    }));
  });
});

function context() {
  const tx = { $executeRaw: jest.fn(), travelPackageParticipant: { findMany: jest.fn() } };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  return { tx, reader: new PrismaContractedTravelPackageRosterReader(prisma as never) };
}

import { PrismaTerritorialCatalogRepository } from "./prisma-territorial-catalog.repository";

describe("PrismaTerritorialCatalogRepository", () => {
  it("scopes every subdivision read to the ACTIVE release and uses deterministic ordering", async () => {
    const territorialCatalogRelease = { findFirst: jest.fn().mockResolvedValue({ id: "release-cr", countryCode: "CR", version: "dta-2026" }) };
    const territorialSubdivision = {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    };
    const repository = new PrismaTerritorialCatalogRepository({ territorialCatalogRelease, territorialSubdivision } as never);

    await repository.findActiveRelease("CR");
    await repository.findActiveRootSubdivisions("release-cr");
    await repository.findActiveSubdivision("release-cr", "101");
    await repository.findActiveChildren("release-cr", "parent-id");

    expect(territorialCatalogRelease.findFirst).toHaveBeenCalledWith({ where: { countryCode: "CR", status: "ACTIVE" }, select: { id: true, countryCode: true, version: true } });
    expect(territorialSubdivision.findMany.mock.calls[0][0].where).toEqual({ releaseId: "release-cr", parentId: null, isActive: true });
    expect(territorialSubdivision.findFirst.mock.calls[0][0].where).toEqual({ releaseId: "release-cr", fullCode: "101", isActive: true });
    expect(territorialSubdivision.findMany.mock.calls[1][0].where).toEqual({ releaseId: "release-cr", parentId: "parent-id", isActive: true });
    expect(territorialSubdivision.findMany.mock.calls[0][0].orderBy).toEqual([{ administrativeLevel: "asc" }, { fullCode: "asc" }, { id: "asc" }]);
    expect(territorialSubdivision.findMany.mock.calls[1][0].orderBy).toEqual([{ administrativeLevel: "asc" }, { fullCode: "asc" }, { id: "asc" }]);
  });

  it("projects only safe response fields and exposes no write delegate", async () => {
    const territorialSubdivision = { findFirst: jest.fn(), findMany: jest.fn() };
    const repository = new PrismaTerritorialCatalogRepository({ territorialCatalogRelease: { findFirst: jest.fn() }, territorialSubdivision } as never);
    await repository.findActiveRootSubdivisions("release-cr");
    const select = territorialSubdivision.findMany.mock.calls[0][0].select;
    expect(select).toEqual({ id: true, administrativeLevel: true, subdivisionTypeCode: true, code: true, fullCode: true, name: true });
    expect(territorialSubdivision).not.toHaveProperty("create");
    expect(territorialSubdivision).not.toHaveProperty("update");
    expect(territorialSubdivision).not.toHaveProperty("delete");
  });
});

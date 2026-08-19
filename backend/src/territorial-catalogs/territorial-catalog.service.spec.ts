import { TerritorialCatalogRepository } from "./territorial-catalog.repository";
import { TerritorialCatalogService } from "./territorial-catalog.service";

const release = { id: "release-cr", countryCode: "CR", version: "dta-2026" };
const province = { id: "province-1", administrativeLevel: 1, subdivisionTypeCode: "PROVINCE", code: "1", fullCode: "1", name: "San José" };
const canton = { id: "canton-101", administrativeLevel: 2, subdivisionTypeCode: "CANTON", code: "01", fullCode: "101", name: "San José" };
const district = { id: "district-10101", administrativeLevel: 3, subdivisionTypeCode: "DISTRICT", code: "01", fullCode: "10101", name: "Carmen" };

function context() {
  const repository: jest.Mocked<TerritorialCatalogRepository> = {
    findActiveRelease: jest.fn().mockResolvedValue(release),
    findActiveRootSubdivisions: jest.fn().mockResolvedValue([province]),
    findActiveSubdivision: jest.fn().mockResolvedValue(canton),
    findActiveChildren: jest.fn().mockResolvedValue([district]),
  };
  return { repository, service: new TerritorialCatalogService(repository) };
}

describe("TerritorialCatalogService", () => {
  it("returns only active roots using two bounded reads", async () => {
    const { service, repository } = context();
    await expect(service.subdivisions("cr")).resolves.toEqual({ countryCode: "CR", release: { version: "dta-2026" }, parent: null, subdivisions: [province] });
    expect(repository.findActiveRelease).toHaveBeenCalledWith("CR");
    expect(repository.findActiveRootSubdivisions).toHaveBeenCalledWith("release-cr");
    expect(repository.findActiveSubdivision).not.toHaveBeenCalled();
    expect(repository.findActiveChildren).not.toHaveBeenCalled();
  });

  it("resolves a trimmed active parent and returns only direct children in three bounded reads", async () => {
    const { service, repository } = context();
    await expect(service.subdivisions("CR", " 101 ")).resolves.toEqual({ countryCode: "CR", release: { version: "dta-2026" }, parent: canton, subdivisions: [district] });
    expect(repository.findActiveSubdivision).toHaveBeenCalledWith("release-cr", "101");
    expect(repository.findActiveChildren).toHaveBeenCalledWith("release-cr", "canton-101");
    expect(repository.findActiveRootSubdivisions).not.toHaveBeenCalled();
  });

  it("returns stable catalog-not-ready and parent-not-found errors", async () => {
    const missingRelease = context();
    missingRelease.repository.findActiveRelease.mockResolvedValueOnce(null);
    await expect(missingRelease.service.subdivisions("CR")).rejects.toMatchObject({ status: 503, response: expect.objectContaining({ code: "TERRITORIAL_CATALOG_NOT_READY" }) });
    expect(missingRelease.repository.findActiveRootSubdivisions).not.toHaveBeenCalled();

    const missingParent = context();
    missingParent.repository.findActiveSubdivision.mockResolvedValueOnce(null);
    await expect(missingParent.service.subdivisions("CR", "999")).rejects.toMatchObject({ status: 404, response: expect.objectContaining({ code: "TERRITORIAL_SUBDIVISION_NOT_FOUND" }) });
    expect(missingParent.repository.findActiveChildren).not.toHaveBeenCalled();
  });

  it("preserves leading zeroes and strips all internal fields defensively", async () => {
    const { service, repository } = context();
    repository.findActiveSubdivision.mockResolvedValueOnce({ ...canton, releaseId: "hidden", parentId: "hidden", searchText: "hidden" } as never);
    repository.findActiveChildren.mockResolvedValueOnce([{ ...district, releaseId: "hidden", parentId: "hidden", searchText: "hidden", createdAt: new Date() } as never]);
    const response = await service.subdivisions("CR", "101");
    expect(response.parent).toEqual(canton);
    expect(response.subdivisions).toEqual([district]);
    expect(response.subdivisions[0].code).toBe("01");
    expect(JSON.stringify(response)).not.toMatch(/releaseId|parentId|searchText|createdAt/);
  });
});

import { Inject, Injectable } from "@nestjs/common";
import { territorialCatalogError } from "./territorial-catalog.errors";
import { TERRITORIAL_CATALOG_REPOSITORY, TerritorialCatalogRepository } from "./territorial-catalog.repository";
import { TerritorialSubdivisionRecord, TerritorialSubdivisionResponse } from "./territorial-catalog.types";

function safeSubdivision(subdivision: TerritorialSubdivisionRecord): TerritorialSubdivisionRecord {
  const { id, administrativeLevel, subdivisionTypeCode, code, fullCode, name } = subdivision;
  return { id, administrativeLevel, subdivisionTypeCode, code, fullCode, name };
}

@Injectable()
export class TerritorialCatalogService {
  constructor(@Inject(TERRITORIAL_CATALOG_REPOSITORY) private readonly repository: TerritorialCatalogRepository) {}

  async subdivisions(countryCode: string, parentFullCode?: string): Promise<TerritorialSubdivisionResponse> {
    const normalizedCountryCode = countryCode.toUpperCase();
    const release = await this.repository.findActiveRelease(normalizedCountryCode);
    if (!release) throw territorialCatalogError("TERRITORIAL_CATALOG_NOT_READY");

    if (parentFullCode === undefined) {
      const subdivisions = await this.repository.findActiveRootSubdivisions(release.id);
      return { countryCode: normalizedCountryCode, release: { version: release.version }, parent: null, subdivisions: subdivisions.map(safeSubdivision) };
    }

    const normalizedParentFullCode = parentFullCode.trim();
    const parent = await this.repository.findActiveSubdivision(release.id, normalizedParentFullCode);
    if (!parent) throw territorialCatalogError("TERRITORIAL_SUBDIVISION_NOT_FOUND");
    const subdivisions = await this.repository.findActiveChildren(release.id, parent.id);
    return { countryCode: normalizedCountryCode, release: { version: release.version }, parent: safeSubdivision(parent), subdivisions: subdivisions.map(safeSubdivision) };
  }
}

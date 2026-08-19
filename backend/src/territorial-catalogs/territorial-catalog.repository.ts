import { ActiveTerritorialRelease, TerritorialSubdivisionRecord } from "./territorial-catalog.types";

export const TERRITORIAL_CATALOG_REPOSITORY = Symbol("TERRITORIAL_CATALOG_REPOSITORY");

export interface TerritorialCatalogRepository {
  findActiveRelease(countryCode: string): Promise<ActiveTerritorialRelease | null>;
  findActiveRootSubdivisions(releaseId: string): Promise<TerritorialSubdivisionRecord[]>;
  findActiveSubdivision(releaseId: string, fullCode: string): Promise<TerritorialSubdivisionRecord | null>;
  findActiveChildren(releaseId: string, parentId: string): Promise<TerritorialSubdivisionRecord[]>;
}

import { CrDta2026Catalog, LoadedCrDta2026Catalog } from "./cr-dta-2026";

export type TerritorialImportResult = "imported" | "already imported" | "version conflict" | "checksum conflict" | "import conflict";

export interface TerritorialReleaseLookup {
  id: string;
  countryCode: string;
  version: string;
  checksumSha256: string;
}

interface CreateManyResult { count: number }
interface CountGroup { administrativeLevel: number; _count: { _all: number } }
interface SubdivisionIdentity { id: string; fullCode: string }

interface TerritorialReleaseDelegate {
  findMany(args: unknown): Promise<TerritorialReleaseLookup[]>;
  create(args: unknown): Promise<{ id: string }>;
}

interface TerritorialSubdivisionDelegate {
  createMany(args: unknown): Promise<CreateManyResult>;
  findMany(args: unknown): Promise<SubdivisionIdentity[]>;
  groupBy(args: unknown): Promise<CountGroup[]>;
}

export interface TerritorialImportTransaction {
  territorialCatalogRelease: TerritorialReleaseDelegate;
  territorialSubdivision: TerritorialSubdivisionDelegate;
}

export interface TerritorialImportDatabase {
  territorialCatalogRelease: Pick<TerritorialReleaseDelegate, "findMany">;
  $transaction<T>(callback: (transaction: TerritorialImportTransaction) => Promise<T>): Promise<T>;
}

export interface AuditedTerritorialIdentity {
  countryCode: string;
  version: string;
  checksumSha256: string;
  sourceAuthority: string;
  sourceUrl: string;
  originalFilename: string;
  provinceCount: number;
  cantonCount: number;
  districtCount: number;
  totalCount: number;
}

export function auditedTerritorialIdentity(loaded: LoadedCrDta2026Catalog): AuditedTerritorialIdentity {
  const { metadata, entries } = loaded.catalog;
  const provinceCount = entries.filter((entry) => entry.administrativeLevel === 1).length;
  const cantonCount = entries.filter((entry) => entry.administrativeLevel === 2).length;
  const districtCount = entries.filter((entry) => entry.administrativeLevel === 3).length;
  return {
    countryCode: metadata.countryCode,
    version: metadata.version,
    checksumSha256: metadata.datasetChecksumSha256,
    sourceAuthority: metadata.sourceAuthority,
    sourceUrl: metadata.sourceUrl,
    originalFilename: metadata.originalFilename,
    provinceCount,
    cantonCount,
    districtCount,
    totalCount: entries.length,
  };
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

function classifyExisting(releases: TerritorialReleaseLookup[], identity: AuditedTerritorialIdentity): TerritorialImportResult | null {
  const exact = releases.find((release) => release.version === identity.version && release.checksumSha256 === identity.checksumSha256);
  if (exact) return "already imported";
  const versionConflict = releases.some((release) => release.version === identity.version);
  const checksumConflict = releases.some((release) => release.checksumSha256 === identity.checksumSha256);
  if (versionConflict && checksumConflict) return "import conflict";
  if (versionConflict) return "version conflict";
  if (checksumConflict) return "checksum conflict";
  return null;
}

async function readCompetingReleases(database: Pick<TerritorialImportDatabase, "territorialCatalogRelease">, identity: AuditedTerritorialIdentity): Promise<TerritorialReleaseLookup[]> {
  return database.territorialCatalogRelease.findMany({
    where: {
      countryCode: identity.countryCode,
      OR: [{ version: identity.version }, { checksumSha256: identity.checksumSha256 }],
    },
    select: { id: true, countryCode: true, version: true, checksumSha256: true },
  });
}

function mapIdentities(rows: SubdivisionIdentity[], expectedFullCodes: string[], level: number): Map<string, string> {
  if (rows.length !== expectedFullCodes.length) throw new Error(`Persisted level ${level} identity count mismatch`);
  const ids = new Map(rows.map((row) => [row.fullCode, row.id]));
  if (ids.size !== rows.length || expectedFullCodes.some((fullCode) => !ids.has(fullCode))) throw new Error(`Persisted level ${level} hierarchy resolution failed`);
  return ids;
}

function assertBatchCount(result: CreateManyResult, expected: number, level: number): void {
  if (result.count !== expected) throw new Error(`Persisted level ${level} batch count mismatch`);
}

function assertFinalCounts(groups: CountGroup[], identity: AuditedTerritorialIdentity): void {
  const counts = new Map(groups.map((group) => [group.administrativeLevel, group._count._all]));
  if (counts.size !== 3 || counts.get(1) !== identity.provinceCount || counts.get(2) !== identity.cantonCount || counts.get(3) !== identity.districtCount) {
    throw new Error("Persisted territorial subdivision counts do not match the audited dataset");
  }
}

function persistenceData(catalog: CrDta2026Catalog, releaseId: string, level: 1 | 2 | 3, parentIds?: Map<string, string>) {
  return catalog.entries.filter((entry) => entry.administrativeLevel === level).map((entry) => {
    const parentId = entry.parentFullCode === null ? null : parentIds?.get(entry.parentFullCode);
    if (entry.parentFullCode !== null && !parentId) throw new Error(`Missing persisted parent ${entry.parentFullCode} for ${entry.fullCode}`);
    return {
      releaseId,
      parentId,
      administrativeLevel: entry.administrativeLevel,
      subdivisionTypeCode: entry.subdivisionTypeCode,
      code: entry.code,
      fullCode: entry.fullCode,
      name: entry.name,
      searchText: entry.searchText,
      isActive: true,
      sourceEffectiveFrom: null,
      sourceEffectiveTo: null,
    };
  });
}

export async function importCrDta2026Catalog(database: TerritorialImportDatabase, loaded: LoadedCrDta2026Catalog): Promise<TerritorialImportResult> {
  const identity = auditedTerritorialIdentity(loaded);
  const preexisting = classifyExisting(await readCompetingReleases(database, identity), identity);
  if (preexisting) return preexisting;

  try {
    await database.$transaction(async (transaction) => {
      const release = await transaction.territorialCatalogRelease.create({
        data: {
          countryCode: identity.countryCode,
          version: identity.version,
          status: "VALIDATED",
          sourceAuthority: identity.sourceAuthority,
          sourceUrl: identity.sourceUrl,
          sourcePublishedAt: null,
          effectiveFrom: null,
          effectiveTo: null,
          checksumSha256: identity.checksumSha256,
          originalFilename: identity.originalFilename,
          activatedAt: null,
        },
        select: { id: true },
      });

      const provinceData = persistenceData(loaded.catalog, release.id, 1);
      assertBatchCount(await transaction.territorialSubdivision.createMany({ data: provinceData }), identity.provinceCount, 1);
      const provinces = await transaction.territorialSubdivision.findMany({
        where: { releaseId: release.id, administrativeLevel: 1 },
        select: { id: true, fullCode: true },
      });
      const provinceIds = mapIdentities(provinces, provinceData.map((entry) => entry.fullCode), 1);

      const cantonData = persistenceData(loaded.catalog, release.id, 2, provinceIds);
      assertBatchCount(await transaction.territorialSubdivision.createMany({ data: cantonData }), identity.cantonCount, 2);
      const cantons = await transaction.territorialSubdivision.findMany({
        where: { releaseId: release.id, administrativeLevel: 2 },
        select: { id: true, fullCode: true },
      });
      const cantonIds = mapIdentities(cantons, cantonData.map((entry) => entry.fullCode), 2);

      const districtData = persistenceData(loaded.catalog, release.id, 3, cantonIds);
      assertBatchCount(await transaction.territorialSubdivision.createMany({ data: districtData }), identity.districtCount, 3);
      const groups = await transaction.territorialSubdivision.groupBy({
        by: ["administrativeLevel"],
        where: { releaseId: release.id },
        _count: { _all: true },
      });
      assertFinalCounts(groups, identity);
    });
    return "imported";
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const winner = classifyExisting(await readCompetingReleases(database, identity), identity);
    return winner ?? "import conflict";
  }
}

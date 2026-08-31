import { LoadedCrDta2026Catalog } from "./cr-dta-2026";
import { AuditedTerritorialIdentity, auditedTerritorialIdentity } from "./cr-dta-2026-import";

export type TerritorialReleaseStatus = "DRAFT" | "VALIDATED" | "ACTIVE" | "RETIRED";

export interface TerritorialReleaseIdentity {
  id: string;
  countryCode: string;
  version: string;
  checksumSha256: string;
}

export interface TerritorialReleaseRecord extends TerritorialReleaseIdentity {
  status: TerritorialReleaseStatus;
  activatedAt: Date | null;
}

export type TerritorialActivationOutcome =
  | { result: "activated"; release: TerritorialReleaseIdentity; retiredRelease: TerritorialReleaseIdentity | null; activatedAt: Date }
  | { result: "already active"; release: TerritorialReleaseIdentity; retiredRelease: null; activatedAt: Date | null }
  | { result: "not found" | "checksum conflict" | "count conflict" | "invalid lifecycle" | "activation conflict"; release?: TerritorialReleaseIdentity };

interface UpdateManyResult { count: number }
interface CountGroup { administrativeLevel: number; _count: { _all: number } }
interface TerritorialActivationReleaseDelegate {
  findFirst(args: unknown): Promise<TerritorialReleaseRecord | null>;
  updateMany(args: unknown): Promise<UpdateManyResult>;
}
interface TerritorialActivationSubdivisionDelegate {
  groupBy(args: unknown): Promise<CountGroup[]>;
}
export interface TerritorialActivationScope {
  territorialCatalogRelease: TerritorialActivationReleaseDelegate;
  territorialSubdivision: TerritorialActivationSubdivisionDelegate;
}
export interface TerritorialActivationDatabase extends TerritorialActivationScope {
  $transaction(callback: (transaction: TerritorialActivationScope) => Promise<TerritorialActivationOutcome>): Promise<TerritorialActivationOutcome>;
}

class ConcurrentTerritorialActivationError extends Error {}

const identityOf = ({ id, countryCode, version, checksumSha256 }: TerritorialReleaseRecord): TerritorialReleaseIdentity => ({ id, countryCode, version, checksumSha256 });

function targetWhere(identity: AuditedTerritorialIdentity) {
  return { countryCode: identity.countryCode, version: identity.version };
}

async function readTarget(scope: TerritorialActivationScope, identity: AuditedTerritorialIdentity): Promise<TerritorialReleaseRecord | null> {
  return scope.territorialCatalogRelease.findFirst({
    where: targetWhere(identity),
    select: { id: true, countryCode: true, version: true, checksumSha256: true, status: true, activatedAt: true },
  });
}

async function hasExactCounts(scope: TerritorialActivationScope, releaseId: string, identity: AuditedTerritorialIdentity): Promise<boolean> {
  const groups = await scope.territorialSubdivision.groupBy({
    by: ["administrativeLevel"],
    where: { releaseId },
    _count: { _all: true },
  });
  const counts = new Map(groups.map((group) => [group.administrativeLevel, group._count._all]));
  return counts.size === 3 && counts.get(1) === identity.provinceCount && counts.get(2) === identity.cantonCount && counts.get(3) === identity.districtCount;
}

async function classifyTarget(scope: TerritorialActivationScope, identity: AuditedTerritorialIdentity): Promise<{ target: TerritorialReleaseRecord | null; outcome: TerritorialActivationOutcome | null }> {
  const target = await readTarget(scope, identity);
  if (!target) return { target, outcome: { result: "not found" } };
  if (target.checksumSha256 !== identity.checksumSha256) return { target, outcome: { result: "checksum conflict", release: identityOf(target) } };
  if (target.status === "DRAFT" || target.status === "RETIRED") return { target, outcome: { result: "invalid lifecycle", release: identityOf(target) } };
  if (!(await hasExactCounts(scope, target.id, identity))) return { target, outcome: { result: "count conflict", release: identityOf(target) } };
  if (target.status === "ACTIVE") return { target, outcome: { result: "already active", release: identityOf(target), retiredRelease: null, activatedAt: target.activatedAt } };
  if (target.status !== "VALIDATED") return { target, outcome: { result: "invalid lifecycle", release: identityOf(target) } };
  return { target, outcome: null };
}

function isConcurrentWriteError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
  return error instanceof ConcurrentTerritorialActivationError || code === "P2002" || code === "P2025" || code === "P2034";
}

async function finalConcurrencyResult(database: TerritorialActivationDatabase, identity: AuditedTerritorialIdentity): Promise<TerritorialActivationOutcome> {
  const classified = await classifyTarget(database, identity);
  if (classified.outcome?.result === "already active") return classified.outcome;
  const active = await database.territorialCatalogRelease.findFirst({
    where: { countryCode: identity.countryCode, status: "ACTIVE" },
    select: { id: true, countryCode: true, version: true, checksumSha256: true, status: true, activatedAt: true },
  });
  return { result: "activation conflict", ...(active ? { release: identityOf(active) } : classified.target ? { release: identityOf(classified.target) } : {}) };
}

export async function activateCrDta2026Catalog(
  database: TerritorialActivationDatabase,
  loaded: LoadedCrDta2026Catalog,
  now: () => Date = () => new Date(),
): Promise<TerritorialActivationOutcome> {
  const identity = auditedTerritorialIdentity(loaded);
  const preflight = await classifyTarget(database, identity);
  if (preflight.outcome) return preflight.outcome;

  try {
    return await database.$transaction(async (transaction) => {
      const classified = await classifyTarget(transaction, identity);
      if (classified.outcome) return classified.outcome;
      if (!classified.target) throw new ConcurrentTerritorialActivationError();
      const target = classified.target;

      const previous = await transaction.territorialCatalogRelease.findFirst({
        where: { countryCode: identity.countryCode, status: "ACTIVE", id: { not: target.id } },
        select: { id: true, countryCode: true, version: true, checksumSha256: true, status: true, activatedAt: true },
      });
      if (previous) {
        const retired = await transaction.territorialCatalogRelease.updateMany({
          where: { id: previous.id, countryCode: identity.countryCode, status: "ACTIVE" },
          data: { status: "RETIRED" },
        });
        if (retired.count !== 1) throw new ConcurrentTerritorialActivationError();
      }

      const activatedAt = now();
      const activated = await transaction.territorialCatalogRelease.updateMany({
        where: { id: target.id, countryCode: identity.countryCode, version: identity.version, checksumSha256: identity.checksumSha256, status: "VALIDATED" },
        data: { status: "ACTIVE", activatedAt },
      });
      if (activated.count !== 1) throw new ConcurrentTerritorialActivationError();
      return { result: "activated", release: identityOf(target), retiredRelease: previous ? identityOf(previous) : null, activatedAt };
    });
  } catch (error) {
    if (!isConcurrentWriteError(error)) throw error;
    return finalConcurrencyResult(database, identity);
  }
}

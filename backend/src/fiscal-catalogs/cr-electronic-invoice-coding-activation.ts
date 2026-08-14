import { LoadedFiscalCodingCatalog } from "./cr-electronic-invoice-coding";

export type FiscalReleaseStatus = "DRAFT" | "VALIDATED" | "ACTIVE" | "RETIRED";

export interface FiscalReleaseIdentity {
  id: string;
  countryCode: string;
  catalogType: string;
  version: string;
  checksumSha256: string;
}

export interface FiscalReleaseRecord extends FiscalReleaseIdentity {
  status: FiscalReleaseStatus;
  activatedAt: Date | null;
}

export type ActivationOutcome =
  | { result: "activated"; release: FiscalReleaseIdentity; retiredRelease: FiscalReleaseIdentity | null; activatedAt: Date }
  | { result: "already active"; release: FiscalReleaseIdentity; retiredRelease: null; activatedAt: Date | null }
  | { result: "not found" | "invalid lifecycle" | "checksum conflict" | "activation conflict"; release?: FiscalReleaseIdentity };

interface UpdateManyResult { count: number }
interface FiscalReleaseDelegate {
  findFirst(args: unknown): Promise<FiscalReleaseRecord | null>;
  updateMany(args: unknown): Promise<UpdateManyResult>;
}
export interface FiscalCatalogActivationTransaction { fiscalCatalogRelease: FiscalReleaseDelegate }
export interface FiscalCatalogActivationDatabase {
  fiscalCatalogRelease: FiscalReleaseDelegate;
  $transaction(callback: (transaction: FiscalCatalogActivationTransaction) => Promise<ActivationOutcome>): Promise<ActivationOutcome>;
}

class ConcurrentActivationError extends Error {}

const identityOf = ({ id, countryCode, catalogType, version, checksumSha256 }: FiscalReleaseRecord): FiscalReleaseIdentity => ({ id, countryCode, catalogType, version, checksumSha256 });

function targetWhere(loaded: LoadedFiscalCodingCatalog) {
  return { countryCode: loaded.catalog.countryCode, catalogType: loaded.catalog.catalogType, version: loaded.catalog.version };
}

function classifyTarget(target: FiscalReleaseRecord | null, checksum: string): ActivationOutcome | null {
  if (!target) return { result: "not found" };
  if (target.checksumSha256 !== checksum) return { result: "checksum conflict", release: identityOf(target) };
  if (target.status === "ACTIVE") return { result: "already active", release: identityOf(target), retiredRelease: null, activatedAt: target.activatedAt };
  if (target.status !== "VALIDATED") return { result: "invalid lifecycle", release: identityOf(target) };
  return null;
}

async function readTarget(database: Pick<FiscalCatalogActivationDatabase, "fiscalCatalogRelease">, loaded: LoadedFiscalCodingCatalog): Promise<FiscalReleaseRecord | null> {
  return database.fiscalCatalogRelease.findFirst({ where: targetWhere(loaded), select: { id: true, countryCode: true, catalogType: true, version: true, checksumSha256: true, status: true, activatedAt: true } });
}

async function finalConcurrencyResult(database: FiscalCatalogActivationDatabase, loaded: LoadedFiscalCodingCatalog): Promise<ActivationOutcome> {
  const target = await readTarget(database, loaded);
  if (target?.checksumSha256 === loaded.checksumSha256 && target.status === "ACTIVE") {
    return { result: "already active", release: identityOf(target), retiredRelease: null, activatedAt: target.activatedAt };
  }
  const active = await database.fiscalCatalogRelease.findFirst({
    where: { countryCode: loaded.catalog.countryCode, catalogType: loaded.catalog.catalogType, status: "ACTIVE" },
    select: { id: true, countryCode: true, catalogType: true, version: true, checksumSha256: true, status: true, activatedAt: true },
  });
  return { result: "activation conflict", ...(active ? { release: identityOf(active) } : target ? { release: identityOf(target) } : {}) };
}

function isConcurrentWriteError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
  return error instanceof ConcurrentActivationError || code === "P2002" || code === "P2025" || code === "P2034";
}

export async function activateCrFiscalCodingCatalog(
  database: FiscalCatalogActivationDatabase,
  loaded: LoadedFiscalCodingCatalog,
  now: () => Date = () => new Date(),
): Promise<ActivationOutcome> {
  const activatedAt = now();
  const preflight = classifyTarget(await readTarget(database, loaded), loaded.checksumSha256);
  if (preflight) return preflight;

  try {
    return await database.$transaction(async (transaction) => {
      const target = await readTarget(transaction, loaded);
      const lifecycleResult = classifyTarget(target, loaded.checksumSha256);
      if (lifecycleResult) return lifecycleResult;
      if (!target) throw new ConcurrentActivationError();

      const previous = await transaction.fiscalCatalogRelease.findFirst({
        where: { countryCode: target.countryCode, catalogType: target.catalogType, status: "ACTIVE", id: { not: target.id } },
        select: { id: true, countryCode: true, catalogType: true, version: true, checksumSha256: true, status: true, activatedAt: true },
      });
      if (previous) {
        const retired = await transaction.fiscalCatalogRelease.updateMany({ where: { id: previous.id, status: "ACTIVE" }, data: { status: "RETIRED" } });
        if (retired.count !== 1) throw new ConcurrentActivationError();
      }

      const activated = await transaction.fiscalCatalogRelease.updateMany({ where: { id: target.id, status: "VALIDATED", checksumSha256: loaded.checksumSha256 }, data: { status: "ACTIVE", activatedAt } });
      if (activated.count !== 1) throw new ConcurrentActivationError();
      return { result: "activated", release: identityOf(target), retiredRelease: previous ? identityOf(previous) : null, activatedAt };
    });
  } catch (error) {
    if (!isConcurrentWriteError(error)) throw error;
    return finalConcurrencyResult(database, loaded);
  }
}

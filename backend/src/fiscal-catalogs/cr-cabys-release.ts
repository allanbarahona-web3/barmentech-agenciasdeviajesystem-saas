import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const VERSION = "barmentech-provider-confirmed-v1";
const KEYS = ["countryCode", "catalogType", "version", "sourceAuthority", "sourceUrl", "sourceDocument", "collectionMode", "provider", "description", "effectiveFrom"];

export interface CrCabysManifest {
  countryCode: "CR";
  catalogType: "CABYS";
  version: "barmentech-provider-confirmed-v1";
  sourceAuthority: string;
  sourceUrl: string;
  sourceDocument: string;
  collectionMode: "PROVIDER_CONFIRMED_PARTIAL";
  provider: "FACTURA_EN_CR";
  description: string;
  effectiveFrom: null;
}

export interface LoadedCrCabysManifest { manifest: CrCabysManifest; checksumSha256: string }
export class CrCabysManifestValidationError extends Error {}
export class CrCabysVersionConflictError extends Error {}

function fail(message: string): never { throw new CrCabysManifestValidationError(message); }
function nonempty(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) fail(`${path} must be a trimmed, nonempty string`);
  return value;
}

export function validateCrCabysManifest(value: unknown): CrCabysManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("manifest must be an object");
  const manifest = value as Record<string, unknown>;
  const unknown = Object.keys(manifest).filter((key) => !KEYS.includes(key));
  if (unknown.length) fail(`manifest contains unknown properties: ${unknown.sort().join(", ")}`);
  const missing = KEYS.filter((key) => !(key in manifest)); if (missing.length) fail(`manifest is missing properties: ${missing.join(", ")}`);
  if (manifest.countryCode !== "CR") fail("countryCode must be CR");
  if (manifest.catalogType !== "CABYS") fail("catalogType must be CABYS");
  if (manifest.version !== VERSION) fail(`version must be ${VERSION}`);
  if (manifest.collectionMode !== "PROVIDER_CONFIRMED_PARTIAL") fail("unsupported collectionMode");
  if (manifest.provider !== "FACTURA_EN_CR") fail("unsupported provider");
  if (manifest.effectiveFrom !== null) fail("effectiveFrom must be null");
  return { countryCode: "CR", catalogType: "CABYS", version: VERSION, sourceAuthority: nonempty(manifest.sourceAuthority, "sourceAuthority"), sourceUrl: nonempty(manifest.sourceUrl, "sourceUrl"), sourceDocument: nonempty(manifest.sourceDocument, "sourceDocument"), collectionMode: "PROVIDER_CONFIRMED_PARTIAL", provider: "FACTURA_EN_CR", description: nonempty(manifest.description, "description"), effectiveFrom: null };
}

export function parseCrCabysManifest(bytes: Buffer): LoadedCrCabysManifest {
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail("manifest is not valid JSON"); }
  return { manifest: validateCrCabysManifest(value), checksumSha256: createHash("sha256").update(bytes).digest("hex") };
}
export async function loadCrCabysManifest(path: string): Promise<LoadedCrCabysManifest> { return parseCrCabysManifest(await readFile(path)); }

interface ExistingRelease { id: string; checksumSha256: string }
export interface CabysReleaseInitializationDatabase {
  fiscalCatalogRelease: {
    findFirst(args: unknown): Promise<ExistingRelease | null>;
    create(args: unknown): Promise<{ id: string }>;
  };
}
export type CabysInitializationResult = "initialized" | "already initialized";

async function classifyExisting(database: CabysReleaseInitializationDatabase, loaded: LoadedCrCabysManifest): Promise<CabysInitializationResult | null> {
  const existing = await database.fiscalCatalogRelease.findFirst({ where: { countryCode: loaded.manifest.countryCode, catalogType: loaded.manifest.catalogType, version: loaded.manifest.version }, select: { id: true, checksumSha256: true } });
  if (!existing) return null;
  if (existing.checksumSha256 === loaded.checksumSha256) return "already initialized";
  throw new CrCabysVersionConflictError(`version ${loaded.manifest.version} already exists with a different checksum`);
}

export async function initializeCrCabysRelease(database: CabysReleaseInitializationDatabase, loaded: LoadedCrCabysManifest): Promise<CabysInitializationResult> {
  const existing = await classifyExisting(database, loaded); if (existing) return existing;
  try {
    await database.fiscalCatalogRelease.create({ data: { countryCode: loaded.manifest.countryCode, catalogType: loaded.manifest.catalogType, version: loaded.manifest.version, status: "VALIDATED", sourceAuthority: loaded.manifest.sourceAuthority, sourceUrl: loaded.manifest.sourceUrl, sourcePublishedAt: null, effectiveFrom: null, effectiveTo: null, checksumSha256: loaded.checksumSha256, originalFilename: "manifest.json", createdByUserId: null, activatedAt: null } });
    return "initialized";
  } catch (error) {
    if ((error as { code?: unknown }).code !== "P2002") throw error;
    const concurrent = await classifyExisting(database, loaded); if (concurrent) return concurrent;
    throw error;
  }
}

export function cabysActivationIdentity(loaded: LoadedCrCabysManifest) {
  return { countryCode: loaded.manifest.countryCode, catalogType: loaded.manifest.catalogType, version: loaded.manifest.version, checksumSha256: loaded.checksumSha256 };
}

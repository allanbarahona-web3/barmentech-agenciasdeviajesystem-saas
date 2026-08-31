import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Decimal } from "@prisma/client/runtime/library";

const RELEASE_VERSION = "4.4";
const ROOT_KEYS = ["countryCode", "catalogType", "version", "sourceAuthority", "sourceUrl", "sourceDocument", "effectiveFrom", "units", "taxes", "taxRates"];
const ENTRY_KEYS = ["code", "name", "isActive"];
const RATE_KEYS = ["taxCode", "code", "name", "percentage", "isActive"];

export interface FiscalCodingEntry { code: string; name: string; isActive: boolean }
export interface FiscalCodingRate extends FiscalCodingEntry { taxCode: string; percentage: string }
export interface CrFiscalCodingCatalog {
  countryCode: "CR";
  catalogType: "ELECTRONIC_INVOICE_CODING";
  version: "4.4";
  sourceAuthority: string;
  sourceUrl: string;
  sourceDocument: string;
  effectiveFrom: string;
  units: FiscalCodingEntry[];
  taxes: FiscalCodingEntry[];
  taxRates: FiscalCodingRate[];
}

export interface LoadedFiscalCodingCatalog {
  catalog: CrFiscalCodingCatalog;
  checksumSha256: string;
}

export class FiscalCatalogValidationError extends Error {}
export class FiscalCatalogConflictError extends Error {}

function fail(message: string): never { throw new FiscalCatalogValidationError(message); }
function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, allowed: string[], path: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) fail(`${path} contains unknown properties: ${unknown.sort().join(", ")}`);
  const missing = allowed.filter((key) => !(key in value));
  if (missing.length) fail(`${path} is missing properties: ${missing.join(", ")}`);
}
function stringField(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) fail(`${path} must be a trimmed, nonempty string`);
  return value;
}
function booleanField(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(`${path} must be a boolean`);
  return value;
}
function parseEntry(value: unknown, path: string, codePattern?: RegExp): FiscalCodingEntry {
  const item = record(value, path); exactKeys(item, ENTRY_KEYS, path);
  const code = stringField(item.code, `${path}.code`);
  if (code.length > 15) fail(`${path}.code must be at most 15 characters`);
  if (codePattern && !codePattern.test(code)) fail(`${path}.code must contain exactly two numeric characters`);
  return { code, name: stringField(item.name, `${path}.name`), isActive: booleanField(item.isActive, `${path}.isActive`) };
}
function unique(values: string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) { if (seen.has(value)) fail(`${path} contains duplicate code ${value}`); seen.add(value); }
}

export function validateCrFiscalCodingCatalog(value: unknown): CrFiscalCodingCatalog {
  const root = record(value, "catalog"); exactKeys(root, ROOT_KEYS, "catalog");
  if (root.countryCode !== "CR") fail("catalog.countryCode must be CR");
  if (root.catalogType !== "ELECTRONIC_INVOICE_CODING") fail("catalog.catalogType must be ELECTRONIC_INVOICE_CODING");
  if (root.version !== RELEASE_VERSION) fail(`catalog.version must be ${RELEASE_VERSION}`);
  const sourceAuthority = stringField(root.sourceAuthority, "catalog.sourceAuthority");
  const sourceUrl = stringField(root.sourceUrl, "catalog.sourceUrl");
  const sourceDocument = stringField(root.sourceDocument, "catalog.sourceDocument");
  const effectiveFrom = stringField(root.effectiveFrom, "catalog.effectiveFrom");
  const effectiveDate = new Date(`${effectiveFrom}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || Number.isNaN(effectiveDate.getTime()) || effectiveDate.toISOString().slice(0, 10) !== effectiveFrom) fail("catalog.effectiveFrom must be a valid ISO date");
  if (!Array.isArray(root.units) || root.units.length === 0) fail("catalog.units must be a nonempty array");
  if (!Array.isArray(root.taxes) || root.taxes.length === 0) fail("catalog.taxes must be a nonempty array");
  if (!Array.isArray(root.taxRates) || root.taxRates.length === 0) fail("catalog.taxRates must be a nonempty array");
  const units = root.units.map((item, index) => parseEntry(item, `catalog.units[${index}]`));
  const taxes = root.taxes.map((item, index) => parseEntry(item, `catalog.taxes[${index}]`, /^[0-9]{2}$/));
  unique(units.map(({ code }) => code), "catalog.units"); unique(taxes.map(({ code }) => code), "catalog.taxes");
  const taxCodes = new Set(taxes.map(({ code }) => code));
  const taxRates = root.taxRates.map((value, index): FiscalCodingRate => {
    const path = `catalog.taxRates[${index}]`; const item = record(value, path); exactKeys(item, RATE_KEYS, path);
    const taxCode = stringField(item.taxCode, `${path}.taxCode`); const entry = parseEntry({ code: item.code, name: item.name, isActive: item.isActive }, path, /^[0-9]{2}$/);
    if (!taxCodes.has(taxCode)) fail(`${path}.taxCode references unknown tax ${taxCode}`);
    if (taxCode !== "01") fail(`${path}.taxCode must be 01 for this dataset`);
    if (typeof item.percentage !== "string" || !/^(0|[1-9]\d*)\.\d{4}$/.test(item.percentage)) fail(`${path}.percentage must be a canonical nonnegative decimal string with four fractional digits`);
    return { taxCode, ...entry, percentage: item.percentage };
  });
  unique(taxRates.map(({ taxCode, code }) => `${taxCode}:${code}`), "catalog.taxRates");
  return { countryCode: "CR", catalogType: "ELECTRONIC_INVOICE_CODING", version: "4.4", sourceAuthority, sourceUrl, sourceDocument, effectiveFrom, units, taxes, taxRates };
}

export function parseCrFiscalCodingCatalog(bytes: Buffer): LoadedFiscalCodingCatalog {
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); } catch (error) { fail(`catalog is not valid JSON: ${(error as Error).message}`); }
  return { catalog: validateCrFiscalCodingCatalog(value), checksumSha256: createHash("sha256").update(bytes).digest("hex") };
}
export async function loadCrFiscalCodingCatalog(path: string): Promise<LoadedFiscalCodingCatalog> { return parseCrFiscalCodingCatalog(await readFile(path)); }

export interface FiscalCatalogDatabase {
  fiscalCatalogRelease: { findFirst(args: unknown): Promise<{ id: string; checksumSha256: string } | null> };
  $transaction<T>(callback: (tx: FiscalCatalogTransaction) => Promise<T>): Promise<T>;
}
interface FiscalCatalogTransaction {
  fiscalCatalogRelease: { create(args: unknown): Promise<{ id: string }> };
  fiscalUnitOfMeasureEntry: { createMany(args: unknown): Promise<unknown> };
  fiscalTaxEntry: { create(args: unknown): Promise<{ id: string; code: string }> };
  fiscalTaxRateEntry: { createMany(args: unknown): Promise<unknown> };
}
export type ImportResult = "imported" | "already imported";

async function existingResult(db: FiscalCatalogDatabase, catalog: CrFiscalCodingCatalog, checksum: string): Promise<ImportResult | null> {
  const existing = await db.fiscalCatalogRelease.findFirst({ where: { countryCode: catalog.countryCode, catalogType: catalog.catalogType, version: catalog.version }, select: { id: true, checksumSha256: true } });
  if (!existing) return null;
  if (existing.checksumSha256 === checksum) return "already imported";
  throw new FiscalCatalogConflictError(`version ${catalog.version} already exists with a different checksum`);
}

export async function importCrFiscalCodingCatalog(db: FiscalCatalogDatabase, loaded: LoadedFiscalCodingCatalog): Promise<ImportResult> {
  const { catalog, checksumSha256 } = loaded;
  const preexisting = await existingResult(db, catalog, checksumSha256); if (preexisting) return preexisting;
  try {
    await db.$transaction(async (tx) => {
      const release = await tx.fiscalCatalogRelease.create({ data: { countryCode: catalog.countryCode, catalogType: catalog.catalogType, version: catalog.version, status: "VALIDATED", sourceAuthority: catalog.sourceAuthority, sourceUrl: catalog.sourceUrl, sourcePublishedAt: null, effectiveFrom: new Date(`${catalog.effectiveFrom}T00:00:00.000Z`), effectiveTo: null, checksumSha256, originalFilename: "catalog.json", createdByUserId: null, activatedAt: null } });
      await tx.fiscalUnitOfMeasureEntry.createMany({ data: catalog.units.map((entry) => ({ releaseId: release.id, ...entry })) });
      const taxIds = new Map<string, string>();
      for (const entry of catalog.taxes) { const tax = await tx.fiscalTaxEntry.create({ data: { releaseId: release.id, ...entry }, select: { id: true, code: true } }); taxIds.set(tax.code, tax.id); }
      await tx.fiscalTaxRateEntry.createMany({ data: catalog.taxRates.map((rate) => ({ releaseId: release.id, taxEntryId: taxIds.get(rate.taxCode)!, code: rate.code, name: rate.name, percentage: new Decimal(rate.percentage), isActive: rate.isActive })) });
    });
    return "imported";
  } catch (error) {
    if ((error as { code?: unknown }).code !== "P2002") throw error;
    const concurrent = await existingResult(db, catalog, checksumSha256); if (concurrent) return concurrent;
    throw error;
  }
}

export function summarize(loaded: LoadedFiscalCodingCatalog) {
  const { catalog } = loaded;
  return { countryCode: catalog.countryCode, catalogType: catalog.catalogType, version: catalog.version, sourceAuthority: catalog.sourceAuthority, sourceUrl: catalog.sourceUrl, sourceDocument: catalog.sourceDocument, effectiveFrom: catalog.effectiveFrom, checksumSha256: loaded.checksumSha256, unitCount: catalog.units.length, taxCount: catalog.taxes.length, rateCount: catalog.taxRates.length, inactiveUnitCount: catalog.units.filter((x) => !x.isActive).length, inactiveTaxCount: catalog.taxes.filter((x) => !x.isActive).length, inactiveRateCount: catalog.taxRates.filter((x) => !x.isActive).length };
}

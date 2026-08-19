import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const COUNTRY_CODE = "CR";
const VERSION = "dta-2026";
const DECLARED_VERSION = "DIVISIÓN TERRITORIAL ADMINISTRATIVA, 2026";
const SOURCE_AUTHORITY = "Instituto Geográfico Nacional / Registro Nacional";
const SOURCE_URL = "https://www.snitcr.go.cr/pdfs/ign_repositorio/DTA-TABLA%20POR%20PROVINCIA-CANT%C3%93N-DISTRITO%202026.xlsx";
const ORIGINAL_FILENAME = "DTA-TABLA POR PROVINCIA-CANTÓN-DISTRITO 2026.xlsx";
const SOURCE_BYTE_SIZE = 224880;
const SOURCE_SHA256 = "79491cc10a42a1c6ed5287c85beeaef80a506663abcc9b64cd84ad1dace3fef9";
const WORKBOOK_MODIFIED_AT = "2026-02-06T17:52:11Z";
const SOURCE_LAST_MODIFIED_AT = "2026-02-09T14:21:08Z";
const SOURCE_CODE_NORMALIZATION = "Safe integer-valued numeric cells are read lexically, left-padded to level width, and emitted only as strings.";
const EXPECTED_COUNTS = { provinces: 7, cantons: 84, districts: 494 } as const;
const CANONICAL_SHEETS = { provinces: "CUADRO_PROVINCIA", cantons: "CUADRO_CANTON", districts: "CUADRO_DISTRITO" } as const;
const EXCLUDED_SHEETS = ["DTA OFICIALIZACION"] as const;
const SOURCE_INCONSISTENCIES = [
  "CUADRO_DISTRITO row 471 repeats canton 613 as Puerto Jiménez; canonical canton name from CUADRO_CANTON is Puerto Jimenez.",
  "DTA OFICIALIZACION row 28 spells district 10307 as Patarra; canonical CUADRO_DISTRITO name is Patarrá.",
  "DTA OFICIALIZACION row 65 spells district 10805 as Ipis; canonical CUADRO_DISTRITO name is Ipís.",
  "DTA OFICIALIZACION rows 79-83 spell canton 111 as Vazquez de Coronado; canonical CUADRO_CANTON name is Vázquez de Coronado.",
  "DTA OFICIALIZACION row 123 spells district 11911 as Paramo; canonical CUADRO_DISTRITO name is Páramo.",
  "DTA OFICIALIZACION row 141 spells district 20111 as Turrucares; canonical CUADRO_DISTRITO name is Turrúcares.",
  "DTA OFICIALIZACION row 373 pairs district 50405 Pijije with canton code 505 and name Bagaces; canonical parent is code prefix 504.",
  "DTA OFICIALIZACION row 440 pairs district 60310 Cabagra with canton code 604 and name Buenos Aires; canonical parent is code prefix 603.",
  "DTA OFICIALIZACION row 471 spells canton 613 as Puerto Jiménez; canonical CUADRO_CANTON name is Puerto Jimenez.",
] as const;

const ROOT_KEYS = ["metadata", "entries"];
const METADATA_KEYS = [
  "countryCode",
  "version",
  "declaredVersion",
  "sourceAuthority",
  "sourceUrl",
  "originalFilename",
  "sourceByteSize",
  "sourceSha256",
  "workbookModifiedAt",
  "sourceLastModifiedAt",
  "datasetChecksumSha256",
  "expectedCounts",
  "canonicalSheets",
  "excludedSheets",
  "sourceCodeNormalization",
  "sourceInconsistencies",
];
const COUNT_KEYS = ["provinces", "cantons", "districts"];
const ENTRY_KEYS = ["administrativeLevel", "subdivisionTypeCode", "code", "fullCode", "name", "parentFullCode"];

export type AdministrativeLevel = 1 | 2 | 3;
export type SubdivisionTypeCode = "PROVINCE" | "CANTON" | "DISTRICT";

export interface CrDta2026Entry {
  administrativeLevel: AdministrativeLevel;
  subdivisionTypeCode: SubdivisionTypeCode;
  code: string;
  fullCode: string;
  name: string;
  parentFullCode: string | null;
}

export interface ParsedCrDta2026Entry extends CrDta2026Entry {
  searchText: string;
}

export interface CrDta2026Metadata {
  countryCode: "CR";
  version: "dta-2026";
  declaredVersion: string;
  sourceAuthority: string;
  sourceUrl: string;
  originalFilename: string;
  sourceByteSize: number;
  sourceSha256: string;
  workbookModifiedAt: string;
  sourceLastModifiedAt: string;
  datasetChecksumSha256: string;
  expectedCounts: typeof EXPECTED_COUNTS;
  canonicalSheets: typeof CANONICAL_SHEETS;
  excludedSheets: ["DTA OFICIALIZACION"];
  sourceCodeNormalization: string;
  sourceInconsistencies: string[];
}

export interface CrDta2026Catalog {
  metadata: CrDta2026Metadata;
  entries: ParsedCrDta2026Entry[];
}

export interface LoadedCrDta2026Catalog {
  catalog: CrDta2026Catalog;
  fileChecksumSha256: string;
}

export class TerritorialCatalogValidationError extends Error {}

function fail(message: string): never {
  throw new TerritorialCatalogValidationError(message);
}

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

function exactValue(value: unknown, expected: unknown, path: string): void {
  if (JSON.stringify(value) !== JSON.stringify(expected)) fail(`${path} does not match the audited source metadata`);
}

function trimmedString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) fail(`${path} must be a trimmed, nonempty string`);
  return value;
}

function exactIsoInstant(value: unknown, expected: string, path: string): void {
  if (value !== expected || typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value.replace(/Z$/, ".000Z")) {
    fail(`${path} must be the exact audited ISO instant ${expected}`);
  }
}

function orderedEntry(entry: CrDta2026Entry): CrDta2026Entry {
  return {
    administrativeLevel: entry.administrativeLevel,
    subdivisionTypeCode: entry.subdivisionTypeCode,
    code: entry.code,
    fullCode: entry.fullCode,
    name: entry.name,
    parentFullCode: entry.parentFullCode,
  };
}

export function calculateCrDta2026DatasetChecksum(entries: CrDta2026Entry[]): string {
  return createHash("sha256").update(JSON.stringify(entries.map(orderedEntry)), "utf8").digest("hex");
}

export function normalizeCrDta2026SearchText(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export interface XlsxNumericCodeCell {
  type: "n";
  value: unknown;
}

export function normalizeCrDta2026XlsxCode(cell: XlsxNumericCodeCell, level: AdministrativeLevel): string {
  if (!cell || cell.type !== "n" || typeof cell.value !== "string" || !/^(0|[1-9]\d*)$/.test(cell.value)) {
    fail("XLSX code cell must contain a canonical nonnegative integer lexical value");
  }
  if (BigInt(cell.value) > BigInt(Number.MAX_SAFE_INTEGER)) fail("XLSX code cell exceeds the safe integer range");
  const width = level === 1 ? 1 : level === 2 ? 3 : 5;
  if (cell.value.length > width) fail(`XLSX code cell exceeds level ${level} width`);
  const normalized = cell.value.padStart(width, "0");
  const pattern = level === 1 ? /^[1-7]$/ : level === 2 ? /^[1-7]\d{2}$/ : /^[1-7]\d{4}$/;
  if (!pattern.test(normalized)) fail(`XLSX code cell is not a valid CR level ${level} full code`);
  return normalized;
}

function parseEntry(value: unknown, index: number): CrDta2026Entry {
  const path = `catalog.entries[${index}]`;
  const item = record(value, path);
  exactKeys(item, ENTRY_KEYS, path);
  if (item.administrativeLevel !== 1 && item.administrativeLevel !== 2 && item.administrativeLevel !== 3) fail(`${path}.administrativeLevel must be 1, 2, or 3`);
  const level = item.administrativeLevel;
  const expectedType: Record<AdministrativeLevel, SubdivisionTypeCode> = { 1: "PROVINCE", 2: "CANTON", 3: "DISTRICT" };
  if (item.subdivisionTypeCode !== expectedType[level]) fail(`${path}.subdivisionTypeCode does not match level ${level}`);
  const code = trimmedString(item.code, `${path}.code`);
  const fullCode = trimmedString(item.fullCode, `${path}.fullCode`);
  const name = trimmedString(item.name, `${path}.name`);
  if (level === 1 && (!/^[1-7]$/.test(code) || fullCode !== code || item.parentFullCode !== null)) fail(`${path} is not a valid CR province`);
  if (level === 2 && (!/^\d{2}$/.test(code) || !/^[1-7]\d{2}$/.test(fullCode) || item.parentFullCode !== fullCode.slice(0, 1) || fullCode !== `${item.parentFullCode}${code}`)) fail(`${path} is not a valid CR canton`);
  if (level === 3 && (!/^\d{2}$/.test(code) || !/^[1-7]\d{4}$/.test(fullCode) || item.parentFullCode !== fullCode.slice(0, 3) || fullCode !== `${item.parentFullCode}${code}`)) fail(`${path} is not a valid CR district`);
  return { administrativeLevel: level, subdivisionTypeCode: expectedType[level], code, fullCode, name, parentFullCode: item.parentFullCode as string | null };
}

function validateMetadata(value: unknown): CrDta2026Metadata {
  const metadata = record(value, "catalog.metadata");
  exactKeys(metadata, METADATA_KEYS, "catalog.metadata");
  exactValue(metadata.countryCode, COUNTRY_CODE, "catalog.metadata.countryCode");
  exactValue(metadata.version, VERSION, "catalog.metadata.version");
  exactValue(metadata.declaredVersion, DECLARED_VERSION, "catalog.metadata.declaredVersion");
  exactValue(metadata.sourceAuthority, SOURCE_AUTHORITY, "catalog.metadata.sourceAuthority");
  exactValue(metadata.sourceUrl, SOURCE_URL, "catalog.metadata.sourceUrl");
  exactValue(metadata.originalFilename, ORIGINAL_FILENAME, "catalog.metadata.originalFilename");
  exactValue(metadata.sourceByteSize, SOURCE_BYTE_SIZE, "catalog.metadata.sourceByteSize");
  exactValue(metadata.sourceSha256, SOURCE_SHA256, "catalog.metadata.sourceSha256");
  exactIsoInstant(metadata.workbookModifiedAt, WORKBOOK_MODIFIED_AT, "catalog.metadata.workbookModifiedAt");
  exactIsoInstant(metadata.sourceLastModifiedAt, SOURCE_LAST_MODIFIED_AT, "catalog.metadata.sourceLastModifiedAt");
  if (typeof metadata.datasetChecksumSha256 !== "string" || !/^[0-9a-f]{64}$/.test(metadata.datasetChecksumSha256)) fail("catalog.metadata.datasetChecksumSha256 must be lowercase SHA-256");
  const counts = record(metadata.expectedCounts, "catalog.metadata.expectedCounts");
  exactKeys(counts, COUNT_KEYS, "catalog.metadata.expectedCounts");
  exactValue(counts, EXPECTED_COUNTS, "catalog.metadata.expectedCounts");
  const sheets = record(metadata.canonicalSheets, "catalog.metadata.canonicalSheets");
  exactKeys(sheets, COUNT_KEYS, "catalog.metadata.canonicalSheets");
  exactValue(sheets, CANONICAL_SHEETS, "catalog.metadata.canonicalSheets");
  exactValue(metadata.excludedSheets, EXCLUDED_SHEETS, "catalog.metadata.excludedSheets");
  exactValue(metadata.sourceCodeNormalization, SOURCE_CODE_NORMALIZATION, "catalog.metadata.sourceCodeNormalization");
  exactValue(metadata.sourceInconsistencies, SOURCE_INCONSISTENCIES, "catalog.metadata.sourceInconsistencies");
  return metadata as unknown as CrDta2026Metadata;
}

function validateHierarchy(entries: CrDta2026Entry[]): void {
  const byCode = new Map<string, CrDta2026Entry>();
  const localIdentities = new Set<string>();
  for (const entry of entries) {
    if (byCode.has(entry.fullCode)) fail(`catalog.entries contains duplicate fullCode ${entry.fullCode}`);
    byCode.set(entry.fullCode, entry);
    const localIdentity = `${entry.parentFullCode ?? "ROOT"}:${entry.code}`;
    if (localIdentities.has(localIdentity)) fail(`catalog.entries contains duplicate local code ${entry.code} under ${entry.parentFullCode ?? "ROOT"}`);
    localIdentities.add(localIdentity);
  }
  for (const entry of entries) {
    if (entry.parentFullCode === null) continue;
    if (entry.parentFullCode === entry.fullCode) fail(`${entry.fullCode} cannot parent itself`);
    const parent = byCode.get(entry.parentFullCode);
    if (!parent) fail(`${entry.fullCode} references missing parent ${entry.parentFullCode}`);
    if (parent.administrativeLevel !== entry.administrativeLevel - 1) fail(`${entry.fullCode} parent has the wrong administrative level`);
    const visited = new Set<string>([entry.fullCode]);
    let cursor: CrDta2026Entry | undefined = parent;
    while (cursor) {
      if (visited.has(cursor.fullCode)) fail(`${entry.fullCode} belongs to a parent cycle`);
      visited.add(cursor.fullCode);
      cursor = cursor.parentFullCode ? byCode.get(cursor.parentFullCode) : undefined;
    }
  }
}

export function validateCrDta2026Catalog(value: unknown): CrDta2026Catalog {
  const root = record(value, "catalog");
  exactKeys(root, ROOT_KEYS, "catalog");
  const metadata = validateMetadata(root.metadata);
  if (!Array.isArray(root.entries)) fail("catalog.entries must be an array");
  const rawEntries = root.entries.map(parseEntry);
  const counts = {
    provinces: rawEntries.filter((entry) => entry.administrativeLevel === 1).length,
    cantons: rawEntries.filter((entry) => entry.administrativeLevel === 2).length,
    districts: rawEntries.filter((entry) => entry.administrativeLevel === 3).length,
  };
  exactValue(counts, EXPECTED_COUNTS, "catalog entry counts");
  validateHierarchy(rawEntries);
  const expectedOrder = [...rawEntries].sort((left, right) => left.administrativeLevel - right.administrativeLevel || left.fullCode.localeCompare(right.fullCode, "en"));
  if (rawEntries.some((entry, index) => entry.fullCode !== expectedOrder[index].fullCode)) fail("catalog.entries must use deterministic level/fullCode order");
  const calculatedChecksum = calculateCrDta2026DatasetChecksum(rawEntries);
  if (metadata.datasetChecksumSha256 !== calculatedChecksum) fail(`catalog dataset checksum mismatch: expected ${metadata.datasetChecksumSha256}, calculated ${calculatedChecksum}`);
  return { metadata, entries: rawEntries.map((entry) => ({ ...entry, searchText: normalizeCrDta2026SearchText(entry.name) })) };
}

export function parseCrDta2026Catalog(bytes: Buffer): LoadedCrDta2026Catalog {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`catalog is not valid JSON: ${(error as Error).message}`);
  }
  return { catalog: validateCrDta2026Catalog(value), fileChecksumSha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function loadCrDta2026Catalog(path: string): Promise<LoadedCrDta2026Catalog> {
  return parseCrDta2026Catalog(await readFile(path));
}

export function summarizeCrDta2026Catalog(loaded: LoadedCrDta2026Catalog) {
  const { metadata, entries } = loaded.catalog;
  return {
    countryCode: metadata.countryCode,
    version: metadata.version,
    sourceAuthority: metadata.sourceAuthority,
    sourceUrl: metadata.sourceUrl,
    originalFilename: metadata.originalFilename,
    sourceSha256: metadata.sourceSha256,
    datasetChecksumSha256: metadata.datasetChecksumSha256,
    provinceCount: entries.filter((entry) => entry.administrativeLevel === 1).length,
    cantonCount: entries.filter((entry) => entry.administrativeLevel === 2).length,
    districtCount: entries.filter((entry) => entry.administrativeLevel === 3).length,
  };
}

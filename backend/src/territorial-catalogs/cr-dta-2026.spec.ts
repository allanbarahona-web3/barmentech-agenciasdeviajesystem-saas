import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CrDta2026Entry,
  CrDta2026Metadata,
  calculateCrDta2026DatasetChecksum,
  normalizeCrDta2026XlsxCode,
  parseCrDta2026Catalog,
  validateCrDta2026Catalog,
} from "./cr-dta-2026";

const catalogPath = resolve(__dirname, "../../data/territorial-catalogs/cr/dta-2026/catalog.json");
const bytes = readFileSync(catalogPath);
const loaded = parseCrDta2026Catalog(bytes);

interface MutableCatalog {
  metadata: CrDta2026Metadata;
  entries: CrDta2026Entry[];
}

const clone = (): MutableCatalog => JSON.parse(bytes.toString("utf8")) as MutableCatalog;
const refreshChecksum = (catalog: MutableCatalog): MutableCatalog => {
  catalog.metadata.datasetChecksumSha256 = calculateCrDta2026DatasetChecksum(catalog.entries);
  return catalog;
};

describe("CR DTA 2026 audited territorial data", () => {
  it("validates exact audited metadata, counts, hierarchy, and checksums", () => {
    expect(loaded.catalog.metadata).toMatchObject({
      countryCode: "CR",
      version: "dta-2026",
      sourceAuthority: "Instituto Geográfico Nacional / Registro Nacional",
      sourceSha256: "79491cc10a42a1c6ed5287c85beeaef80a506663abcc9b64cd84ad1dace3fef9",
      expectedCounts: { provinces: 7, cantons: 84, districts: 494 },
    });
    expect(loaded.catalog.entries.filter((entry) => entry.administrativeLevel === 1)).toHaveLength(7);
    expect(loaded.catalog.entries.filter((entry) => entry.administrativeLevel === 2)).toHaveLength(84);
    expect(loaded.catalog.entries.filter((entry) => entry.administrativeLevel === 3)).toHaveLength(494);
    expect(new Set(loaded.catalog.entries.map((entry) => entry.fullCode)).size).toBe(585);
  });

  it("preserves canonical-sheet names and prefix-derived parents", () => {
    const entries = new Map(loaded.catalog.entries.map((entry) => [entry.fullCode, entry]));
    expect(entries.get("613")?.name).toBe("Puerto Jimenez");
    expect(entries.get("61301")?.name).toBe("Puerto Jiménez");
    expect(entries.get("10307")?.name).toBe("Patarrá");
    expect(entries.get("10805")?.name).toBe("Ipís");
    expect(entries.get("11911")?.name).toBe("Páramo");
    expect(entries.get("20111")?.name).toBe("Turrúcares");
    expect(entries.get("50405")?.parentFullCode).toBe("504");
    expect(entries.get("60310")?.parentFullCode).toBe("603");
    expect(entries.get("61301")?.parentFullCode).toBe("613");
    expect(entries.get("101")?.code).toBe("01");
    expect(entries.get("10101")?.code).toBe("01");
  });

  it("excludes the officialization sheet from canonical rows and names", () => {
    expect(loaded.catalog.metadata.canonicalSheets).toEqual({ provinces: "CUADRO_PROVINCIA", cantons: "CUADRO_CANTON", districts: "CUADRO_DISTRITO" });
    expect(loaded.catalog.metadata.excludedSheets).toEqual(["DTA OFICIALIZACION"]);
    expect(loaded.catalog.entries.find((entry) => entry.fullCode === "10307")?.name).not.toBe("Patarra");
    expect(loaded.catalog.entries.find((entry) => entry.fullCode === "11911")?.name).not.toBe("Paramo");
  });

  it("generates normalized search text without changing canonical Unicode names", () => {
    const district = loaded.catalog.entries.find((entry) => entry.fullCode === "20111");
    expect(district).toMatchObject({ name: "Turrúcares", searchText: "turrucares" });
  });

  it("normalizes safe numeric XLSX code cells and restores leading zeroes", () => {
    expect(normalizeCrDta2026XlsxCode({ type: "n", value: "1" }, 1)).toBe("1");
    expect(normalizeCrDta2026XlsxCode({ type: "n", value: "101" }, 2)).toBe("101");
    expect(normalizeCrDta2026XlsxCode({ type: "n", value: "10101" }, 3)).toBe("10101");
    expect(normalizeCrDta2026XlsxCode({ type: "n", value: "102" }, 2).slice(-2)).toBe("02");
    expect(normalizeCrDta2026XlsxCode({ type: "n", value: "10102" }, 3).slice(-2)).toBe("02");
  });

  it.each(["", "-1", "1.5", "1e3", "01", "9007199254740992", "123456"])("rejects malformed numeric XLSX value %p", (value) => {
    expect(() => normalizeCrDta2026XlsxCode({ type: "n", value }, 3)).toThrow();
  });

  it("rejects a non-string dataset code", () => {
    const data = clone();
    (data.entries[0] as unknown as { code: number }).code = 1;
    expect(() => validateCrDta2026Catalog(data)).toThrow();
  });

  it("rejects unknown top-level, metadata, and entry properties", () => {
    const top = clone() as unknown as Record<string, unknown>;
    top.extra = true;
    expect(() => validateCrDta2026Catalog(top)).toThrow(/unknown properties/);
    const metadata = clone();
    (metadata.metadata as unknown as Record<string, unknown>).effectiveFrom = "2026-01-01";
    expect(() => validateCrDta2026Catalog(metadata)).toThrow(/unknown properties/);
    const entry = clone();
    (entry.entries[0] as unknown as Record<string, unknown>).area = 1;
    expect(() => validateCrDta2026Catalog(entry)).toThrow(/unknown properties/);
  });

  it("rejects duplicate codes and local identities", () => {
    const data = clone();
    data.entries[1] = { ...data.entries[0] };
    expect(() => validateCrDta2026Catalog(refreshChecksum(data))).toThrow(/duplicate/);
  });

  it("rejects missing and wrong-level parents", () => {
    const missing = clone();
    const district = missing.entries.find((entry) => entry.administrativeLevel === 3)!;
    Object.assign(district, { code: "01", fullCode: "79901", parentFullCode: "799" });
    expect(() => validateCrDta2026Catalog(refreshChecksum(missing))).toThrow(/missing parent/);

    const wrongLevel = clone();
    wrongLevel.entries.find((entry) => entry.administrativeLevel === 3)!.parentFullCode = "1";
    expect(() => validateCrDta2026Catalog(refreshChecksum(wrongLevel))).toThrow();
  });

  it("rejects self-parenting, invalid levels, types, lengths, and fourth-level entries", () => {
    const selfParent = clone();
    selfParent.entries.find((entry) => entry.administrativeLevel === 2)!.parentFullCode = "101";
    expect(() => validateCrDta2026Catalog(refreshChecksum(selfParent))).toThrow();

    const fourthLevel = clone();
    (fourthLevel.entries[0] as unknown as { administrativeLevel: number }).administrativeLevel = 4;
    expect(() => validateCrDta2026Catalog(refreshChecksum(fourthLevel))).toThrow(/administrativeLevel/);

    const wrongType = clone();
    wrongType.entries[0].subdivisionTypeCode = "CANTON";
    expect(() => validateCrDta2026Catalog(refreshChecksum(wrongType))).toThrow(/subdivisionTypeCode/);

    const wrongLength = clone();
    wrongLength.entries.find((entry) => entry.administrativeLevel === 2)!.code = "1";
    expect(() => validateCrDta2026Catalog(refreshChecksum(wrongLength))).toThrow();
  });

  it("rejects untrimmed names and checksum changes", () => {
    const untrimmed = clone();
    untrimmed.entries[0].name = ` ${untrimmed.entries[0].name}`;
    expect(() => validateCrDta2026Catalog(refreshChecksum(untrimmed))).toThrow(/trimmed/);

    const changed = clone();
    changed.entries[0].name = "Changed";
    expect(() => validateCrDta2026Catalog(changed)).toThrow(/checksum mismatch/);
  });

  it("rejects incorrect metadata, malformed dates, incorrect counts, and nondeterministic order", () => {
    const country = clone();
    (country.metadata as unknown as { countryCode: string }).countryCode = "US";
    expect(() => validateCrDta2026Catalog(country)).toThrow(/countryCode/);

    const date = clone();
    date.metadata.workbookModifiedAt = "2026-02-30T00:00:00Z";
    expect(() => validateCrDta2026Catalog(date)).toThrow(/workbookModifiedAt/);

    const count = clone();
    count.entries.pop();
    expect(() => validateCrDta2026Catalog(refreshChecksum(count))).toThrow(/counts/);

    const order = clone();
    [order.entries[0], order.entries[1]] = [order.entries[1], order.entries[0]];
    expect(() => validateCrDta2026Catalog(refreshChecksum(order))).toThrow(/deterministic/);
  });

  it("has no Prisma or database dependency during parsing and dry-run validation", () => {
    const source = readFileSync(resolve(__dirname, "cr-dta-2026.ts"), "utf8");
    expect(source).not.toMatch(/@prisma|PrismaClient|DATABASE_URL|\$transaction/);
    expect(() => parseCrDta2026Catalog(bytes)).not.toThrow();
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Decimal } from "@prisma/client/runtime/library";
import { FiscalCatalogConflictError, FiscalCatalogDatabase, importCrFiscalCodingCatalog, parseCrFiscalCodingCatalog, validateCrFiscalCodingCatalog } from "./cr-electronic-invoice-coding";

const catalogPath = resolve(__dirname, "../../data/fiscal-catalogs/cr/electronic-invoice-coding/v4.4/catalog.json");
const bytes = readFileSync(catalogPath);
const loaded = parseCrFiscalCodingCatalog(bytes);

interface MutableEntryFixture {
  code: string;
  name: string;
  isActive: boolean;
  symbol?: string;
}

interface MutableRateFixture extends MutableEntryFixture {
  taxCode: string;
  percentage: unknown;
}

interface MutableCatalogFixture {
  countryCode: string;
  catalogType: string;
  version: string;
  sourceAuthority: string;
  sourceUrl: string;
  sourceDocument: string;
  effectiveFrom: string;
  units: MutableEntryFixture[];
  taxes: MutableEntryFixture[];
  taxRates: MutableRateFixture[];
}

interface TaxCreateArguments { data: { code: string } }
interface PersistedRate { taxEntryId: string; code: string; percentage: Decimal }
interface CreateManyArguments<T> { data: T[] }

const clone = (): MutableCatalogFixture => JSON.parse(bytes.toString("utf8"));

describe("CR electronic invoice coding audited data", () => {
  it("parses the complete audited file with expected metadata and unique codes", () => {
    expect(loaded.catalog).toMatchObject({ countryCode: "CR", catalogType: "ELECTRONIC_INVOICE_CODING", version: "4.4", effectiveFrom: "2025-06-01" });
    expect(loaded.catalog.units).toHaveLength(101);
    expect(loaded.catalog.taxes).toHaveLength(10);
    expect(loaded.catalog.taxRates).toHaveLength(11);
    expect(new Set(loaded.catalog.units.map((x) => x.code)).size).toBe(101);
    expect(new Set(loaded.catalog.taxes.map((x) => x.code)).size).toBe(10);
  });

  it("preserves audited IVA mappings, distinct zero rates, and disabled transition", () => {
    const rates = new Map(loaded.catalog.taxRates.map((rate) => [rate.code, rate]));
    expect(rates.get("08")?.percentage).toBe("13.0000");
    expect(rates.get("02")?.percentage).toBe("1.0000");
    expect(rates.get("10")?.percentage).toBe("0.0000");
    expect(rates.get("07")?.isActive).toBe(false);
    expect(["01", "05", "10", "11"].map((code) => rates.get(code)?.percentage)).toEqual(["0.0000", "0.0000", "0.0000", "0.0000"]);
    expect(new Set(["01", "05", "10", "11"].map((code) => rates.get(code)?.name)).size).toBe(4);
    expect(loaded.catalog.taxRates.every((rate) => typeof rate.percentage === "string")).toBe(true);
  });

  it.each([
    ["empty unit code", (data: MutableCatalogFixture) => { data.units[0].code = ""; }],
    ["long unit code", (data: MutableCatalogFixture) => { data.units[0].code = "1234567890123456"; }],
    ["invalid tax code", (data: MutableCatalogFixture) => { data.taxes[0].code = "1"; }],
    ["invalid rate code", (data: MutableCatalogFixture) => { data.taxRates[0].code = "A1"; }],
    ["unknown tax reference", (data: MutableCatalogFixture) => { data.taxRates[0].taxCode = "98"; }],
    ["numeric percentage", (data: MutableCatalogFixture) => { data.taxRates[0].percentage = 0; }],
    ["unknown property", (data: MutableCatalogFixture) => { data.units[0].symbol = "x"; }],
  ])("rejects %s", (_name, mutate) => { const data = clone(); mutate(data); expect(() => validateCrFiscalCodingCatalog(data)).toThrow(); });

  it("accepts canonical zero percentage", () => { const data = clone(); data.taxRates = [data.taxRates[0]]; expect(validateCrFiscalCodingCatalog(data).taxRates[0].percentage).toBe("0.0000"); });
});

function database(existing: { id: string; checksumSha256: string } | null = null) {
  const releaseCreate = jest.fn().mockResolvedValue({ id: "release-1" });
  const unitCreateMany = jest.fn().mockResolvedValue({ count: 101 });
  const taxCreate = jest.fn<Promise<{ id: string; code: string }>, [TaxCreateArguments]>().mockImplementation(({ data }) => Promise.resolve({ id: `tax-${data.code}`, code: data.code }));
  const rateCreateMany = jest.fn<Promise<{ count: number }>, [CreateManyArguments<PersistedRate>]>().mockResolvedValue({ count: 11 });
  const tx = { fiscalCatalogRelease: { create: releaseCreate }, fiscalUnitOfMeasureEntry: { createMany: unitCreateMany }, fiscalTaxEntry: { create: taxCreate }, fiscalTaxRateEntry: { createMany: rateCreateMany } };
  const findFirst = jest.fn().mockResolvedValue(existing);
  const transaction = jest.fn().mockImplementation((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
  return { db: { fiscalCatalogRelease: { findFirst }, $transaction: transaction } as FiscalCatalogDatabase, findFirst, transaction, releaseCreate, unitCreateMany, taxCreate, rateCreateMany };
}

describe("CR electronic invoice coding import service", () => {
  it("returns already imported without opening a transaction", async () => {
    const mock = database({ id: "existing", checksumSha256: loaded.checksumSha256 });
    await expect(importCrFiscalCodingCatalog(mock.db, loaded)).resolves.toBe("already imported");
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  it("rejects same version with a different checksum without writes", async () => {
    const mock = database({ id: "existing", checksumSha256: "f".repeat(64) });
    await expect(importCrFiscalCodingCatalog(mock.db, loaded)).rejects.toBeInstanceOf(FiscalCatalogConflictError);
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  it("creates a validated, unactivated release and all entries in one transaction", async () => {
    const mock = database();
    await expect(importCrFiscalCodingCatalog(mock.db, loaded)).resolves.toBe("imported");
    expect(mock.transaction).toHaveBeenCalledTimes(1);
    const release = mock.releaseCreate.mock.calls[0][0].data;
    expect(release).toMatchObject({ status: "VALIDATED", activatedAt: null, createdByUserId: null, originalFilename: "catalog.json" });
    expect(mock.unitCreateMany.mock.calls[0][0].data).toHaveLength(101);
    expect(mock.taxCreate).toHaveBeenCalledTimes(10);
    const rates = mock.rateCreateMany.mock.calls[0][0].data;
    expect(rates).toHaveLength(11);
    expect(rates.every((rate) => rate.taxEntryId === "tax-01")).toBe(true);
    expect(rates.every((rate) => rate.percentage instanceof Decimal)).toBe(true);
    expect(rates.find((rate) => rate.code === "08")?.percentage.toString()).toBe("13");
    expect(mock.releaseCreate.mock.calls[0][0].data).not.toHaveProperty("effectiveTo", expect.any(Date));
  });

  it("does not interact with Prisma during parsing/dry-run validation", () => {
    const mock = database();
    expect(parseCrFiscalCodingCatalog(bytes).catalog.units).toHaveLength(101);
    expect(mock.findFirst).not.toHaveBeenCalled();
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  it("maps a concurrent unique error to already imported after re-reading", async () => {
    const mock = database();
    mock.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "concurrent", checksumSha256: loaded.checksumSha256 });
    mock.transaction.mockRejectedValueOnce({ code: "P2002" });
    await expect(importCrFiscalCodingCatalog(mock.db, loaded)).resolves.toBe("already imported");
  });
});

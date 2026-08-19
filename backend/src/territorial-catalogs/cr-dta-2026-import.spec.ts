import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LoadedCrDta2026Catalog, parseCrDta2026Catalog } from "./cr-dta-2026";
import {
  TerritorialImportDatabase,
  TerritorialImportTransaction,
  auditedTerritorialIdentity,
  importCrDta2026Catalog,
} from "./cr-dta-2026-import";
import { runTerritorialImportCli } from "../../scripts/import-cr-dta-2026";

const bytes = readFileSync(resolve(__dirname, "../../data/territorial-catalogs/cr/dta-2026/catalog.json"));
const loaded = parseCrDta2026Catalog(bytes);
const identity = auditedTerritorialIdentity(loaded);

interface CreateManyArguments { data: Array<{ fullCode: string; parentId: string | null; administrativeLevel: number }> }
interface FindManyArguments { where: { administrativeLevel: number } }

function successfulImportDatabase() {
  const releaseCreate = jest.fn().mockResolvedValue({ id: "release-1" });
  const createMany = jest.fn<Promise<{ count: number }>, [CreateManyArguments]>().mockImplementation(({ data }) => Promise.resolve({ count: data.length }));
  const findMany = jest.fn<Promise<Array<{ id: string; fullCode: string }>>, [FindManyArguments]>().mockImplementation(({ where }) => {
    const rows = loaded.catalog.entries
      .filter((entry) => entry.administrativeLevel === where.administrativeLevel)
      .map((entry) => ({ id: `id-${entry.fullCode}`, fullCode: entry.fullCode }));
    return Promise.resolve(rows);
  });
  const groupBy = jest.fn().mockResolvedValue([
    { administrativeLevel: 1, _count: { _all: 7 } },
    { administrativeLevel: 2, _count: { _all: 84 } },
    { administrativeLevel: 3, _count: { _all: 494 } },
  ]);
  const transactionScope = {
    territorialCatalogRelease: { create: releaseCreate, findMany: jest.fn() },
    territorialSubdivision: { createMany, findMany, groupBy },
  } as unknown as TerritorialImportTransaction;
  const competing = jest.fn().mockResolvedValue([]);
  const transaction = jest.fn().mockImplementation((callback: (scope: TerritorialImportTransaction) => Promise<unknown>) => callback(transactionScope));
  const database = { territorialCatalogRelease: { findMany: competing }, $transaction: transaction } as TerritorialImportDatabase;
  return { database, competing, transaction, transactionScope, releaseCreate, createMany, findMany, groupBy };
}

describe("CR DTA 2026 deterministic import", () => {
  it("derives the exact release identity from the validated dataset", () => {
    expect(identity).toEqual({
      countryCode: "CR",
      version: "dta-2026",
      checksumSha256: "e26dbae32e3a94e5e02df6ba38bea9dee0f11c786fda142e9307ffb224437187",
      sourceAuthority: "Instituto Geográfico Nacional / Registro Nacional",
      sourceUrl: loaded.catalog.metadata.sourceUrl,
      originalFilename: "DTA-TABLA POR PROVINCIA-CANTÓN-DISTRITO 2026.xlsx",
      provinceCount: 7,
      cantonCount: 84,
      districtCount: 494,
      totalCount: 585,
    });
  });

  it("creates one VALIDATED unactivated release and three bounded batches atomically", async () => {
    const mock = successfulImportDatabase();
    await expect(importCrDta2026Catalog(mock.database, loaded)).resolves.toBe("imported");
    expect(mock.transaction).toHaveBeenCalledTimes(1);
    expect(mock.releaseCreate).toHaveBeenCalledTimes(1);
    expect(mock.releaseCreate.mock.calls[0][0].data).toMatchObject({
      countryCode: "CR",
      version: "dta-2026",
      status: "VALIDATED",
      checksumSha256: identity.checksumSha256,
      sourcePublishedAt: null,
      effectiveFrom: null,
      effectiveTo: null,
      activatedAt: null,
    });
    expect(mock.createMany).toHaveBeenCalledTimes(3);
    expect(mock.createMany.mock.calls.map(([argument]) => argument.data.length)).toEqual([7, 84, 494]);
    expect(mock.findMany).toHaveBeenCalledTimes(2);
    expect(mock.groupBy).toHaveBeenCalledTimes(1);
    expect((mock.transactionScope.territorialSubdivision as unknown as Record<string, unknown>).create).toBeUndefined();
  });

  it("resolves province and canton parents from bounded fullCode-to-ID reads", async () => {
    const mock = successfulImportDatabase();
    await importCrDta2026Catalog(mock.database, loaded);
    const cantons = mock.createMany.mock.calls[1][0].data;
    const districts = mock.createMany.mock.calls[2][0].data;
    expect(cantons.find((entry) => entry.fullCode === "101")?.parentId).toBe("id-1");
    expect(cantons.find((entry) => entry.fullCode === "613")?.parentId).toBe("id-6");
    expect(districts.find((entry) => entry.fullCode === "10101")?.parentId).toBe("id-101");
    expect(districts.find((entry) => entry.fullCode === "70605")?.parentId).toBe("id-706");
  });

  it("keeps release and subdivision failures inside the single transaction", async () => {
    const mock = successfulImportDatabase();
    mock.createMany.mockRejectedValueOnce(new Error("batch failed"));
    await expect(importCrDta2026Catalog(mock.database, loaded)).rejects.toThrow("batch failed");
    expect(mock.transaction).toHaveBeenCalledTimes(1);
    expect(mock.releaseCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects a persisted final-count mismatch transactionally", async () => {
    const mock = successfulImportDatabase();
    mock.groupBy.mockResolvedValueOnce([
      { administrativeLevel: 1, _count: { _all: 7 } },
      { administrativeLevel: 2, _count: { _all: 84 } },
      { administrativeLevel: 3, _count: { _all: 493 } },
    ]);
    await expect(importCrDta2026Catalog(mock.database, loaded)).rejects.toThrow(/counts/);
  });

  it("returns already imported without writes for the exact release", async () => {
    const mock = successfulImportDatabase();
    mock.competing.mockResolvedValueOnce([{ id: "existing", countryCode: "CR", version: identity.version, checksumSha256: identity.checksumSha256 }]);
    await expect(importCrDta2026Catalog(mock.database, loaded)).resolves.toBe("already imported");
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  it("classifies version and checksum conflicts without writes", async () => {
    const version = successfulImportDatabase();
    version.competing.mockResolvedValueOnce([{ id: "existing", countryCode: "CR", version: identity.version, checksumSha256: "a".repeat(64) }]);
    await expect(importCrDta2026Catalog(version.database, loaded)).resolves.toBe("version conflict");
    expect(version.transaction).not.toHaveBeenCalled();

    const checksum = successfulImportDatabase();
    checksum.competing.mockResolvedValueOnce([{ id: "existing", countryCode: "CR", version: "different", checksumSha256: identity.checksumSha256 }]);
    await expect(importCrDta2026Catalog(checksum.database, loaded)).resolves.toBe("checksum conflict");
    expect(checksum.transaction).not.toHaveBeenCalled();
  });

  it("rereads a concurrent P2002 winner and returns already imported only when exact", async () => {
    const exact = successfulImportDatabase();
    exact.competing.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "winner", countryCode: "CR", version: identity.version, checksumSha256: identity.checksumSha256 }]);
    exact.transaction.mockRejectedValueOnce({ code: "P2002" });
    await expect(importCrDta2026Catalog(exact.database, loaded)).resolves.toBe("already imported");

    const conflict = successfulImportDatabase();
    conflict.competing.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "winner", countryCode: "CR", version: identity.version, checksumSha256: "b".repeat(64) }]);
    conflict.transaction.mockRejectedValueOnce({ code: "P2002" });
    await expect(importCrDta2026Catalog(conflict.database, loaded)).resolves.toBe("version conflict");
  });

  it("validates the dataset before opening Prisma in the import CLI", async () => {
    const openDatabase = jest.fn();
    const stderr = jest.fn();
    const exitCode = await runTerritorialImportCli({
      loadCatalog: jest.fn().mockRejectedValue(new Error("invalid catalog")),
      openDatabase,
      importCatalog: jest.fn(),
      stdout: jest.fn(),
      stderr,
    });
    expect(exitCode).toBe(1);
    expect(openDatabase).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith("Result: import conflict");
  });

  it("does not expose delete, fiscal, tenant, client, issuer, or API operations", () => {
    const source = readFileSync(resolve(__dirname, "cr-dta-2026-import.ts"), "utf8");
    expect(source).not.toMatch(/\.delete|fiscalCatalog|tenantId|\bClient\b|FiscalIssuer|controller|router/i);
  });
});

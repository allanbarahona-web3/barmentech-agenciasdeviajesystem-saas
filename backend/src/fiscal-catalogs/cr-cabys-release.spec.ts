import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runCabysActivationCli } from "../../scripts/activate-cr-cabys-release";
import { runCabysInitializerCli } from "../../scripts/initialize-cr-cabys-release";
import { activateFiscalCatalogRelease, ActivationOutcome, FiscalCatalogActivationDatabase, FiscalCatalogActivationTransaction, FiscalReleaseRecord } from "./cr-electronic-invoice-coding-activation";
import { cabysActivationIdentity, CabysReleaseInitializationDatabase, CrCabysVersionConflictError, initializeCrCabysRelease, parseCrCabysManifest, validateCrCabysManifest } from "./cr-cabys-release";

const manifestPath = resolve(__dirname, "../../data/fiscal-catalogs/cr/cabys/provider-confirmed-v1/manifest.json");
const bytes = readFileSync(manifestPath);
const loaded = parseCrCabysManifest(bytes);
const clone = (): Record<string, unknown> => JSON.parse(bytes.toString("utf8"));
const activationTime = new Date("2026-08-13T12:00:00.000Z");

describe("partial CABYS manifest", () => {
  it("parses exact metadata and a deterministic runtime checksum", () => {
    expect(loaded.manifest).toEqual({ countryCode: "CR", catalogType: "CABYS", version: "barmentech-provider-confirmed-v1", sourceAuthority: "Banco Central de Costa Rica / Ministerio de Hacienda de Costa Rica", sourceUrl: "https://api.facturaencr.com/v2/efactura/catalogs/cabys", sourceDocument: "barmentech-provider-confirmed-cabys-manifest.json", collectionMode: "PROVIDER_CONFIRMED_PARTIAL", provider: "FACTURA_EN_CR", description: "Partial global collection containing only CABYS codes explicitly confirmed through the configured provider.", effectiveFrom: null });
    expect(parseCrCabysManifest(bytes).checksumSha256).toBe(loaded.checksumSha256);
  });

  it.each(["extra", "apiKey", "apiSecret", "credentials", "entries", "cabysEntries"])("rejects unknown, credential, or entry property %s", (property) => {
    const manifest = clone(); manifest[property] = property.includes("Entries") || property === "entries" ? [] : "secret";
    expect(() => validateCrCabysManifest(manifest)).toThrow();
  });

  it("requires null effectiveFrom and supported partial/provider identifiers", () => {
    const effective = clone(); effective.effectiveFrom = "2026-01-01"; expect(() => validateCrCabysManifest(effective)).toThrow();
    const mode = clone(); mode.collectionMode = "COMPLETE"; expect(() => validateCrCabysManifest(mode)).toThrow();
    const provider = clone(); provider.provider = "OTHER"; expect(() => validateCrCabysManifest(provider)).toThrow();
  });
});

function initializationDatabase(existing: { id: string; checksumSha256: string } | null = null) {
  const findFirst = jest.fn<Promise<{ id: string; checksumSha256: string } | null>, [unknown]>().mockResolvedValue(existing);
  const create = jest.fn<Promise<{ id: string }>, [unknown]>().mockResolvedValue({ id: "cabys-release" });
  const db: CabysReleaseInitializationDatabase = { fiscalCatalogRelease: { findFirst, create } };
  return { db, findFirst, create };
}

describe("partial CABYS initialization", () => {
  it("creates one unactivated VALIDATED CABYS release and no entries", async () => {
    const mock = initializationDatabase(); await expect(initializeCrCabysRelease(mock.db, loaded)).resolves.toBe("initialized");
    const argument = mock.create.mock.calls[0][0];
    expect(argument).toEqual({ data: expect.objectContaining({ countryCode: "CR", catalogType: "CABYS", version: loaded.manifest.version, checksumSha256: loaded.checksumSha256, status: "VALIDATED", activatedAt: null, effectiveFrom: null }) });
    expect(JSON.stringify(argument)).not.toContain("ELECTRONIC_INVOICE_CODING");
    expect(Object.keys(mock.db)).toEqual(["fiscalCatalogRelease"]);
  });

  it("is idempotent and rejects a version checksum conflict without writes", async () => {
    const duplicate = initializationDatabase({ id: "existing", checksumSha256: loaded.checksumSha256 });
    await expect(initializeCrCabysRelease(duplicate.db, loaded)).resolves.toBe("already initialized"); expect(duplicate.create).not.toHaveBeenCalled();
    const conflict = initializationDatabase({ id: "existing", checksumSha256: "f".repeat(64) });
    await expect(initializeCrCabysRelease(conflict.db, loaded)).rejects.toBeInstanceOf(CrCabysVersionConflictError); expect(conflict.create).not.toHaveBeenCalled();
  });

  it("classifies concurrent P2002 by re-reading", async () => {
    const mock = initializationDatabase(); mock.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "winner", checksumSha256: loaded.checksumSha256 }); mock.create.mockRejectedValueOnce({ code: "P2002" });
    await expect(initializeCrCabysRelease(mock.db, loaded)).resolves.toBe("already initialized");
  });
});

function release(overrides: Partial<FiscalReleaseRecord> = {}): FiscalReleaseRecord {
  return { id: "target", countryCode: "CR", catalogType: "CABYS", version: loaded.manifest.version, checksumSha256: loaded.checksumSha256, status: "VALIDATED", activatedAt: null, ...overrides };
}
function activationDatabase(results: Array<FiscalReleaseRecord | null>) {
  const findFirst = jest.fn<Promise<FiscalReleaseRecord | null>, [unknown]>().mockImplementation(async () => results.shift() ?? null);
  const updateMany = jest.fn<Promise<{ count: number }>, [unknown]>().mockResolvedValue({ count: 1 });
  const tx = { fiscalCatalogRelease: { findFirst, updateMany } };
  const transaction = jest.fn<Promise<ActivationOutcome>, [(transaction: FiscalCatalogActivationTransaction) => Promise<ActivationOutcome>]>().mockImplementation((callback) => callback(tx));
  const db: FiscalCatalogActivationDatabase = { fiscalCatalogRelease: { findFirst, updateMany }, $transaction: transaction };
  return { db, findFirst, updateMany, transaction };
}

describe("partial CABYS activation", () => {
  it("activates exact CABYS identity and retires only another active CABYS release", async () => {
    const previous = release({ id: "previous", version: "older", checksumSha256: "a".repeat(64), status: "ACTIVE", activatedAt: new Date("2025-01-01") });
    const mock = activationDatabase([release(), release(), previous]);
    await expect(activateFiscalCatalogRelease(mock.db, cabysActivationIdentity(loaded), () => activationTime)).resolves.toMatchObject({ result: "activated", retiredRelease: { id: "previous" }, activatedAt: activationTime });
    expect(mock.findFirst.mock.calls[2][0]).toEqual(expect.objectContaining({ where: expect.objectContaining({ countryCode: "CR", catalogType: "CABYS", status: "ACTIVE" }) }));
    expect(JSON.stringify(mock.findFirst.mock.calls)).not.toContain("ELECTRONIC_INVOICE_CODING");
    expect(mock.updateMany.mock.calls[0][0]).not.toHaveProperty("data.activatedAt");
  });

  it("is idempotent and preserves the original activatedAt", async () => {
    const original = new Date("2026-01-01"); const mock = activationDatabase([release({ status: "ACTIVE", activatedAt: original })]);
    await expect(activateFiscalCatalogRelease(mock.db, cabysActivationIdentity(loaded), () => activationTime)).resolves.toMatchObject({ result: "already active", activatedAt: original });
    expect(mock.transaction).not.toHaveBeenCalled(); expect(mock.updateMany).not.toHaveBeenCalled();
  });

  it.each([["DRAFT", "invalid lifecycle"], ["RETIRED", "invalid lifecycle"]] as const)("maps %s lifecycle", async (status, result) => {
    const mock = activationDatabase([release({ status })]); await expect(activateFiscalCatalogRelease(mock.db, cabysActivationIdentity(loaded))).resolves.toMatchObject({ result });
  });

  it("handles missing and checksum conflict", async () => {
    await expect(activateFiscalCatalogRelease(activationDatabase([null]).db, cabysActivationIdentity(loaded))).resolves.toEqual({ result: "not found" });
    await expect(activateFiscalCatalogRelease(activationDatabase([release({ checksumSha256: "b".repeat(64) })]).db, cabysActivationIdentity(loaded))).resolves.toMatchObject({ result: "checksum conflict" });
  });

  it("keeps retirement within the transaction on activation failure", async () => {
    const mock = activationDatabase([release(), release(), release({ id: "previous", status: "ACTIVE" })]); mock.updateMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error("activation failed"));
    await expect(activateFiscalCatalogRelease(mock.db, cabysActivationIdentity(loaded))).rejects.toThrow("activation failed"); expect(mock.transaction).toHaveBeenCalledTimes(1);
    expect(Object.keys(mock.db)).toEqual(["fiscalCatalogRelease", "$transaction"]);
  });

  it("classifies concurrent uniqueness outcomes", async () => {
    const won = activationDatabase([release(), release({ status: "ACTIVE", activatedAt: activationTime })]); won.transaction.mockRejectedValueOnce({ code: "P2002" });
    await expect(activateFiscalCatalogRelease(won.db, cabysActivationIdentity(loaded))).resolves.toMatchObject({ result: "already active" });
    const lost = activationDatabase([release(), release(), release({ id: "other", version: "other", status: "ACTIVE" })]); lost.transaction.mockRejectedValueOnce({ code: "P2002" });
    await expect(activateFiscalCatalogRelease(lost.db, cabysActivationIdentity(loaded))).resolves.toMatchObject({ result: "activation conflict", release: { id: "other" } });
  });
});

describe("partial CABYS CLIs", () => {
  it("initializer uses safe output, exit codes, and disconnect", async () => {
    const output: string[] = []; const stdout = jest.fn((message: string) => { output.push(message); }); const stderr = jest.fn((message: string) => { output.push(message); }); const disconnect = jest.fn().mockResolvedValue(undefined); const success = initializationDatabase();
    await expect(runCabysInitializerCli({ loadManifest: async () => loaded, openDatabase: async () => ({ database: success.db, disconnect }), stdout, stderr })).resolves.toBe(0);
    expect(output).toContain("Mode: INITIALIZE"); expect(output.join("\n")).not.toContain("DATABASE_URL"); expect(disconnect).toHaveBeenCalled();
    expect(stdout.mock.calls.every((call) => call.length === 1 && typeof call[0] === "string")).toBe(true);
    const conflict = initializationDatabase({ id: "x", checksumSha256: "0".repeat(64) });
    await expect(runCabysInitializerCli({ loadManifest: async () => loaded, openDatabase: async () => ({ database: conflict.db, disconnect }), stdout, stderr })).resolves.toBe(1);
    expect(stderr.mock.calls.every((call) => call.length === 1 && typeof call[0] === "string")).toBe(true);
  });

  it("activation CLI maps success and failure without leaking errors", async () => {
    const output: string[] = []; const stdout = jest.fn((message: string) => { output.push(message); }); const stderr = jest.fn((message: string) => { output.push(message); }); const disconnect = jest.fn().mockResolvedValue(undefined); const database = activationDatabase([]).db;
    await expect(runCabysActivationCli({ loadManifest: async () => loaded, openDatabase: async () => ({ database, disconnect }), activate: async () => ({ result: "already active", release: release(), retiredRelease: null, activatedAt: activationTime }), stdout, stderr })).resolves.toBe(0);
    await expect(runCabysActivationCli({ loadManifest: async () => loaded, openDatabase: async () => ({ database, disconnect }), activate: async () => { throw new Error("DATABASE_URL=postgresql://secret"); }, stdout, stderr })).resolves.toBe(1);
    expect(output).toContain("Mode: ACTIVATE"); expect(output.join("\n")).not.toContain("postgresql://secret");
    expect([...stdout.mock.calls, ...stderr.mock.calls].every((call) => call.length === 1 && typeof call[0] === "string")).toBe(true);
  });
});

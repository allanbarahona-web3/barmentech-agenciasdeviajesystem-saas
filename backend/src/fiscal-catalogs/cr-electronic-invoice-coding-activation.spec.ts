import { runActivationCli } from "../../scripts/activate-cr-electronic-invoice-coding";
import { activateCrFiscalCodingCatalog, ActivationOutcome, FiscalCatalogActivationDatabase, FiscalCatalogActivationTransaction, FiscalReleaseRecord } from "./cr-electronic-invoice-coding-activation";
import { parseCrFiscalCodingCatalog } from "./cr-electronic-invoice-coding";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const catalogPath = resolve(__dirname, "../../data/fiscal-catalogs/cr/electronic-invoice-coding/v4.4/catalog.json");
const loaded = parseCrFiscalCodingCatalog(readFileSync(catalogPath));
const activationTime = new Date("2026-08-13T12:00:00.000Z");
const originalActivationTime = new Date("2026-01-02T03:04:05.000Z");

function release(overrides: Partial<FiscalReleaseRecord> = {}): FiscalReleaseRecord {
  return { id: "target", countryCode: "CR", catalogType: "ELECTRONIC_INVOICE_CODING", version: "4.4", checksumSha256: loaded.checksumSha256, status: "VALIDATED", activatedAt: null, ...overrides };
}

function database(findResults: Array<FiscalReleaseRecord | null>) {
  const findFirst = jest.fn<Promise<FiscalReleaseRecord | null>, [unknown]>().mockImplementation(async () => findResults.shift() ?? null);
  const updateMany = jest.fn<Promise<{ count: number }>, [unknown]>().mockResolvedValue({ count: 1 });
  const transactionDelegate = { fiscalCatalogRelease: { findFirst, updateMany } };
  const transaction = jest.fn<Promise<ActivationOutcome>, [(transaction: FiscalCatalogActivationTransaction) => Promise<ActivationOutcome>]>()
    .mockImplementation((callback) => callback(transactionDelegate));
  const topLevelUpdateMany = jest.fn<Promise<{ count: number }>, [unknown]>().mockResolvedValue({ count: 1 });
  const db: FiscalCatalogActivationDatabase = { fiscalCatalogRelease: { findFirst, updateMany: topLevelUpdateMany }, $transaction: transaction };
  return { db, findFirst, updateMany, topLevelUpdateMany, transaction };
}

describe("controlled fiscal catalog activation", () => {
  it("activates a VALIDATED target with activatedAt inside one transaction", async () => {
    const mock = database([release(), release(), null]);
    const outcome = await activateCrFiscalCodingCatalog(mock.db, loaded, () => activationTime);
    expect(outcome).toMatchObject({ result: "activated", activatedAt: activationTime, retiredRelease: null });
    expect(mock.transaction).toHaveBeenCalledTimes(1);
    expect(mock.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "target", status: "VALIDATED", checksumSha256: loaded.checksumSha256 }), data: { status: "ACTIVE", activatedAt: activationTime } }));
    expect(mock.topLevelUpdateMany).not.toHaveBeenCalled();
  });

  it("retires the previous ACTIVE release without changing its activatedAt", async () => {
    const previous = release({ id: "previous", version: "4.3", checksumSha256: "a".repeat(64), status: "ACTIVE", activatedAt: originalActivationTime });
    const mock = database([release(), release(), previous]);
    const outcome = await activateCrFiscalCodingCatalog(mock.db, loaded, () => activationTime);
    expect(outcome).toMatchObject({ result: "activated", retiredRelease: { id: "previous", version: "4.3" } });
    expect(previous.activatedAt).toBe(originalActivationTime);
    expect(mock.updateMany.mock.calls[0][0]).toEqual({ where: { id: "previous", status: "ACTIVE" }, data: { status: "RETIRED" } });
    expect(mock.updateMany.mock.calls[0][0]).not.toHaveProperty("data.activatedAt");
    expect(mock.updateMany).toHaveBeenCalledTimes(2);
  });

  it("delegates both writes to one transaction so activation failure rolls back retirement", async () => {
    const previous = release({ id: "previous", version: "4.3", status: "ACTIVE" });
    const mock = database([release(), release(), previous]);
    mock.updateMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error("activation failed"));
    await expect(activateCrFiscalCodingCatalog(mock.db, loaded, () => activationTime)).rejects.toThrow("activation failed");
    expect(mock.transaction).toHaveBeenCalledTimes(1);
    expect(mock.updateMany).toHaveBeenCalledTimes(2);
    expect(mock.topLevelUpdateMany).not.toHaveBeenCalled();
  });

  it("returns already active without writes and preserves activatedAt", async () => {
    const mock = database([release({ status: "ACTIVE", activatedAt: originalActivationTime })]);
    const outcome = await activateCrFiscalCodingCatalog(mock.db, loaded, () => activationTime);
    expect(outcome).toMatchObject({ result: "already active", activatedAt: originalActivationTime });
    expect(mock.transaction).not.toHaveBeenCalled();
    expect(mock.updateMany).not.toHaveBeenCalled();
  });

  it.each(["DRAFT", "RETIRED"] as const)("rejects a %s target", async (status) => {
    const mock = database([release({ status })]);
    await expect(activateCrFiscalCodingCatalog(mock.db, loaded)).resolves.toMatchObject({ result: "invalid lifecycle" });
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  it("returns not found without writes", async () => {
    const mock = database([null]);
    await expect(activateCrFiscalCodingCatalog(mock.db, loaded)).resolves.toEqual({ result: "not found" });
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  it("returns checksum conflict for the same version without writes", async () => {
    const mock = database([release({ checksumSha256: "b".repeat(64) })]);
    await expect(activateCrFiscalCodingCatalog(mock.db, loaded)).resolves.toMatchObject({ result: "checksum conflict" });
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  it("maps a concurrent unique conflict to already active when the exact target won", async () => {
    const mock = database([release(), release({ status: "ACTIVE", activatedAt: originalActivationTime })]);
    mock.transaction.mockRejectedValueOnce({ code: "P2002" });
    await expect(activateCrFiscalCodingCatalog(mock.db, loaded)).resolves.toMatchObject({ result: "already active", activatedAt: originalActivationTime });
  });

  it("maps a concurrent unique conflict to activation conflict when another release is active", async () => {
    const other = release({ id: "other", version: "5.0", checksumSha256: "c".repeat(64), status: "ACTIVE" });
    const mock = database([release(), release(), other]);
    mock.transaction.mockRejectedValueOnce({ code: "P2002" });
    await expect(activateCrFiscalCodingCatalog(mock.db, loaded)).resolves.toMatchObject({ result: "activation conflict", release: { id: "other" } });
  });

  it("has no catalog-entry mutation delegates", () => {
    const mock = database([]);
    expect(Object.keys(mock.db)).toEqual(["fiscalCatalogRelease", "$transaction"]);
    expect(Object.keys(mock.db.fiscalCatalogRelease)).toEqual(["findFirst", "updateMany"]);
  });
});

describe("activation CLI", () => {
  function cli(result: ActivationOutcome["result"], thrownError?: Error) {
    const stdout: string[] = []; const stderr: string[] = []; const disconnect = jest.fn().mockResolvedValue(undefined);
    const db = database([]).db;
    const activate = thrownError
      ? jest.fn().mockRejectedValue(thrownError)
      : jest.fn().mockResolvedValue(result === "activated" ? { result, release: release(), retiredRelease: null, activatedAt: activationTime } : result === "already active" ? { result, release: release(), retiredRelease: null, activatedAt: originalActivationTime } : { result });
    return { dependencies: { loadCatalog: async () => loaded, openDatabase: async () => ({ database: db, disconnect }), activate, stdout: (message: string) => stdout.push(message), stderr: (message: string) => stderr.push(message) }, stdout, stderr, disconnect };
  }

  it.each(["activated", "already active"] as const)("exits zero for %s", async (result) => {
    const context = cli(result);
    await expect(runActivationCli(context.dependencies)).resolves.toBe(0);
    expect(context.stdout).toContain(`Result: ${result}`);
    expect(context.disconnect).toHaveBeenCalledTimes(1);
  });

  it.each(["not found", "invalid lifecycle", "checksum conflict", "activation conflict"] as const)("exits nonzero for %s", async (result) => {
    const context = cli(result);
    await expect(runActivationCli(context.dependencies)).resolves.toBe(1);
    expect(context.stderr).toContain(`Result: ${result}`);
    expect(context.disconnect).toHaveBeenCalledTimes(1);
  });

  it("exits nonzero for failure and never prints secrets", async () => {
    const secret = "postgresql://secret-user:secret-password@database/private";
    const context = cli("not found", new Error(secret));
    await expect(runActivationCli(context.dependencies)).resolves.toBe(1);
    expect([...context.stdout, ...context.stderr].join("\n")).not.toContain(secret);
    expect(context.stderr).toEqual(["Result: activation conflict"]);
    expect(context.disconnect).toHaveBeenCalledTimes(1);
  });
});

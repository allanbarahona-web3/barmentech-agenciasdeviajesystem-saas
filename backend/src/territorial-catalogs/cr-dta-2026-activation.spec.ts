import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCrDta2026Catalog } from "./cr-dta-2026";
import {
  TerritorialActivationDatabase,
  TerritorialActivationScope,
  TerritorialReleaseRecord,
  activateCrDta2026Catalog,
} from "./cr-dta-2026-activation";
import { auditedTerritorialIdentity } from "./cr-dta-2026-import";
import { runTerritorialActivationCli } from "../../scripts/activate-cr-dta-2026";

const bytes = readFileSync(resolve(__dirname, "../../data/territorial-catalogs/cr/dta-2026/catalog.json"));
const loaded = parseCrDta2026Catalog(bytes);
const identity = auditedTerritorialIdentity(loaded);
const activationTime = new Date("2026-08-18T12:00:00.000Z");

function release(overrides: Partial<TerritorialReleaseRecord> = {}): TerritorialReleaseRecord {
  return {
    id: "target",
    countryCode: "CR",
    version: identity.version,
    checksumSha256: identity.checksumSha256,
    status: "VALIDATED",
    activatedAt: null,
    ...overrides,
  };
}

const exactGroups = () => [
  { administrativeLevel: 1, _count: { _all: 7 } },
  { administrativeLevel: 2, _count: { _all: 84 } },
  { administrativeLevel: 3, _count: { _all: 494 } },
];

function activationDatabase(target: TerritorialReleaseRecord | null, previous: TerritorialReleaseRecord | null = null) {
  const outsideFind = jest.fn().mockResolvedValue(target);
  const outsideGroup = jest.fn().mockResolvedValue(exactGroups());
  const transactionFind = jest.fn().mockImplementation((argument: { where: { status?: string } }) => Promise.resolve(argument.where.status === "ACTIVE" ? previous : target));
  const transactionGroup = jest.fn().mockResolvedValue(exactGroups());
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const scope = {
    territorialCatalogRelease: { findFirst: transactionFind, updateMany },
    territorialSubdivision: { groupBy: transactionGroup },
  } as unknown as TerritorialActivationScope;
  const transaction = jest.fn().mockImplementation((callback: (value: TerritorialActivationScope) => Promise<unknown>) => callback(scope));
  const database = {
    territorialCatalogRelease: { findFirst: outsideFind, updateMany: jest.fn() },
    territorialSubdivision: { groupBy: outsideGroup },
    $transaction: transaction,
  } as unknown as TerritorialActivationDatabase;
  return { database, outsideFind, outsideGroup, transaction, transactionFind, transactionGroup, updateMany };
}

describe("CR DTA 2026 controlled activation", () => {
  it("activates an exact VALIDATED release after checking counts twice", async () => {
    const mock = activationDatabase(release());
    await expect(activateCrDta2026Catalog(mock.database, loaded, () => activationTime)).resolves.toMatchObject({ result: "activated", activatedAt: activationTime });
    expect(mock.outsideGroup).toHaveBeenCalledTimes(1);
    expect(mock.transactionGroup).toHaveBeenCalledTimes(1);
    expect(mock.transaction).toHaveBeenCalledTimes(1);
    expect(mock.updateMany).toHaveBeenCalledTimes(1);
    expect(mock.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "target", countryCode: "CR", version: "dta-2026", checksumSha256: identity.checksumSha256, status: "VALIDATED" },
      data: { status: "ACTIVE", activatedAt: activationTime },
    });
  });

  it("returns already active without changing its original activatedAt", async () => {
    const original = new Date("2026-07-01T00:00:00.000Z");
    const mock = activationDatabase(release({ status: "ACTIVE", activatedAt: original }));
    const outcome = await activateCrDta2026Catalog(mock.database, loaded, () => activationTime);
    expect(outcome).toMatchObject({ result: "already active", activatedAt: original });
    expect(mock.transaction).not.toHaveBeenCalled();
    expect(mock.updateMany).not.toHaveBeenCalled();
  });

  it("retires the previous active CR release and activates the target in one transaction", async () => {
    const previous = release({ id: "previous", version: "dta-2025", checksumSha256: "a".repeat(64), status: "ACTIVE", activatedAt: new Date("2025-01-01T00:00:00.000Z") });
    const mock = activationDatabase(release(), previous);
    const outcome = await activateCrDta2026Catalog(mock.database, loaded, () => activationTime);
    expect(outcome).toMatchObject({ result: "activated", retiredRelease: { id: "previous" } });
    expect(mock.updateMany).toHaveBeenCalledTimes(2);
    expect(mock.updateMany.mock.calls[0][0]).toEqual({ where: { id: "previous", countryCode: "CR", status: "ACTIVE" }, data: { status: "RETIRED" } });
    expect(mock.transactionFind.mock.calls[1][0].where).toMatchObject({ countryCode: "CR", status: "ACTIVE", id: { not: "target" } });
  });

  it("does not target active releases from another country", async () => {
    const mock = activationDatabase(release(), null);
    await activateCrDta2026Catalog(mock.database, loaded, () => activationTime);
    const previousQuery = mock.transactionFind.mock.calls[1][0];
    expect(previousQuery.where.countryCode).toBe("CR");
  });

  it.each(["DRAFT", "RETIRED"] as const)("rejects %s without a transaction", async (status) => {
    const mock = activationDatabase(release({ status }));
    await expect(activateCrDta2026Catalog(mock.database, loaded)).resolves.toMatchObject({ result: "invalid lifecycle" });
    expect(mock.transaction).not.toHaveBeenCalled();
    expect(mock.outsideGroup).not.toHaveBeenCalled();
  });

  it("rejects missing, checksum-conflicting, and count-conflicting targets", async () => {
    const missing = activationDatabase(null);
    await expect(activateCrDta2026Catalog(missing.database, loaded)).resolves.toMatchObject({ result: "not found" });

    const checksum = activationDatabase(release({ checksumSha256: "b".repeat(64) }));
    await expect(activateCrDta2026Catalog(checksum.database, loaded)).resolves.toMatchObject({ result: "checksum conflict" });
    expect(checksum.outsideGroup).not.toHaveBeenCalled();

    const counts = activationDatabase(release());
    counts.outsideGroup.mockResolvedValueOnce([{ administrativeLevel: 1, _count: { _all: 7 } }]);
    await expect(activateCrDta2026Catalog(counts.database, loaded)).resolves.toMatchObject({ result: "count conflict" });
    expect(counts.transaction).not.toHaveBeenCalled();
  });

  it("keeps retirement and target activation atomic when activation fails", async () => {
    const previous = release({ id: "previous", version: "old", status: "ACTIVE" });
    const mock = activationDatabase(release(), previous);
    mock.updateMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error("activation failed"));
    await expect(activateCrDta2026Catalog(mock.database, loaded, () => activationTime)).rejects.toThrow("activation failed");
    expect(mock.transaction).toHaveBeenCalledTimes(1);
    expect(mock.updateMany).toHaveBeenCalledTimes(2);
  });

  it("reclassifies a concurrent exact activation as already active", async () => {
    const target = release();
    const mock = activationDatabase(target);
    mock.transaction.mockRejectedValueOnce({ code: "P2034" });
    const activated = release({ status: "ACTIVE", activatedAt: activationTime });
    mock.outsideFind.mockResolvedValueOnce(target).mockResolvedValueOnce(activated);
    await expect(activateCrDta2026Catalog(mock.database, loaded)).resolves.toMatchObject({ result: "already active", activatedAt: activationTime });
  });

  it("validates the dataset before opening Prisma in the activation CLI", async () => {
    const openDatabase = jest.fn();
    const stderr = jest.fn();
    const exitCode = await runTerritorialActivationCli({
      loadCatalog: jest.fn().mockRejectedValue(new Error("invalid catalog")),
      openDatabase,
      activate: jest.fn(),
      stdout: jest.fn(),
      stderr,
    });
    expect(exitCode).toBe(1);
    expect(openDatabase).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith("Result: activation conflict");
  });

  it("contains no delete, fiscal, tenant, client, issuer, or API operation", () => {
    const source = readFileSync(resolve(__dirname, "cr-dta-2026-activation.ts"), "utf8");
    expect(source).not.toMatch(/\.delete|fiscalCatalog|tenantId|\bClient\b|FiscalIssuer|controller|router/i);
  });
});

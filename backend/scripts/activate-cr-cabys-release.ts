import { resolve } from "node:path";
import { activateFiscalCatalogRelease, ActivationOutcome, FiscalCatalogActivationDatabase } from "../src/fiscal-catalogs/cr-electronic-invoice-coding-activation";
import { cabysActivationIdentity, LoadedCrCabysManifest, loadCrCabysManifest } from "../src/fiscal-catalogs/cr-cabys-release";

const manifestPath = resolve(__dirname, "../data/fiscal-catalogs/cr/cabys/provider-confirmed-v1/manifest.json");

export interface CabysActivationCliDependencies {
  loadManifest(): Promise<LoadedCrCabysManifest>;
  openDatabase(): Promise<{ database: FiscalCatalogActivationDatabase; disconnect(): Promise<void> }>;
  activate(database: FiscalCatalogActivationDatabase, loaded: LoadedCrCabysManifest): Promise<ActivationOutcome>;
  stdout(message: string): void;
  stderr(message: string): void;
}

export async function runCabysActivationCli(dependencies: CabysActivationCliDependencies): Promise<number> {
  let connection: Awaited<ReturnType<CabysActivationCliDependencies["openDatabase"]>> | null = null;
  try {
    const loaded = await dependencies.loadManifest();
    ["Mode: ACTIVATE", `Country: ${loaded.manifest.countryCode}`, `Catalog type: ${loaded.manifest.catalogType}`, `Version: ${loaded.manifest.version}`, `SHA-256: ${loaded.checksumSha256}`].forEach((line) => dependencies.stdout(line));
    connection = await dependencies.openDatabase();
    const outcome = await dependencies.activate(connection.database, loaded);
    const success = outcome.result === "activated" || outcome.result === "already active";
    (success ? dependencies.stdout : dependencies.stderr)(`Result: ${outcome.result}`);
    if (outcome.result === "activated" && outcome.retiredRelease) dependencies.stdout(`Retired release: ${outcome.retiredRelease.countryCode}/${outcome.retiredRelease.catalogType}/${outcome.retiredRelease.version}/${outcome.retiredRelease.checksumSha256}`);
    return success ? 0 : 1;
  } catch { dependencies.stderr("Result: activation conflict"); return 1; }
  finally { await connection?.disconnect(); }
}

async function main(): Promise<void> {
  const exitCode = await runCabysActivationCli({
    loadManifest: () => loadCrCabysManifest(manifestPath),
    openDatabase: async () => { const { PrismaClient } = await import("@prisma/client"); const prisma = new PrismaClient(); return { database: prisma, disconnect: () => prisma.$disconnect() }; },
    activate: (database, loaded) => activateFiscalCatalogRelease(database, cabysActivationIdentity(loaded)),
    stdout: console.log, stderr: console.error,
  });
  process.exitCode = exitCode;
}
if (require.main === module) void main();

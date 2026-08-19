import { resolve } from "node:path";
import { LoadedCrDta2026Catalog, loadCrDta2026Catalog } from "../src/territorial-catalogs/cr-dta-2026";
import {
  TerritorialActivationDatabase,
  TerritorialActivationOutcome,
  activateCrDta2026Catalog,
} from "../src/territorial-catalogs/cr-dta-2026-activation";
import { auditedTerritorialIdentity } from "../src/territorial-catalogs/cr-dta-2026-import";

const catalogPath = resolve(__dirname, "../data/territorial-catalogs/cr/dta-2026/catalog.json");

export interface TerritorialActivationCliDependencies {
  loadCatalog(): Promise<LoadedCrDta2026Catalog>;
  openDatabase(): Promise<{ database: TerritorialActivationDatabase; disconnect(): Promise<void> }>;
  activate(database: TerritorialActivationDatabase, loaded: LoadedCrDta2026Catalog): Promise<TerritorialActivationOutcome>;
  stdout(message: string): void;
  stderr(message: string): void;
}

function printIdentity(write: (message: string) => void, loaded: LoadedCrDta2026Catalog): void {
  const identity = auditedTerritorialIdentity(loaded);
  write("Mode: ACTIVATE");
  write(`Country: ${identity.countryCode}`);
  write(`Version: ${identity.version}`);
  write(`Dataset checksum: ${identity.checksumSha256}`);
}

function printOutcome(write: (message: string) => void, outcome: TerritorialActivationOutcome): void {
  write(`Result: ${outcome.result}`);
  if ((outcome.result === "activated" || outcome.result === "already active") && outcome.activatedAt) {
    write(`Activated at: ${outcome.activatedAt.toISOString()}`);
  }
}

export async function runTerritorialActivationCli(dependencies: TerritorialActivationCliDependencies): Promise<number> {
  let connection: Awaited<ReturnType<TerritorialActivationCliDependencies["openDatabase"]>> | null = null;
  try {
    const loaded = await dependencies.loadCatalog();
    printIdentity(dependencies.stdout, loaded);
    connection = await dependencies.openDatabase();
    const outcome = await dependencies.activate(connection.database, loaded);
    const success = outcome.result === "activated" || outcome.result === "already active";
    printOutcome(success ? dependencies.stdout : dependencies.stderr, outcome);
    return success ? 0 : 1;
  } catch {
    dependencies.stderr("Result: activation conflict");
    return 1;
  } finally {
    await connection?.disconnect();
  }
}

async function main(): Promise<void> {
  const exitCode = await runTerritorialActivationCli({
    loadCatalog: () => loadCrDta2026Catalog(catalogPath),
    openDatabase: async () => {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      return { database: prisma, disconnect: () => prisma.$disconnect() };
    },
    activate: activateCrDta2026Catalog,
    stdout: console.log,
    stderr: console.error,
  });
  process.exitCode = exitCode;
}

if (require.main === module) void main();

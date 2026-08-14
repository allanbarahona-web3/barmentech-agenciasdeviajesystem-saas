import { resolve } from "node:path";
import { activateCrFiscalCodingCatalog, ActivationOutcome, FiscalCatalogActivationDatabase } from "../src/fiscal-catalogs/cr-electronic-invoice-coding-activation";
import { LoadedFiscalCodingCatalog, loadCrFiscalCodingCatalog } from "../src/fiscal-catalogs/cr-electronic-invoice-coding";

const catalogPath = resolve(__dirname, "../data/fiscal-catalogs/cr/electronic-invoice-coding/v4.4/catalog.json");

export interface ActivationCliDependencies {
  loadCatalog(): Promise<LoadedFiscalCodingCatalog>;
  openDatabase(): Promise<{ database: FiscalCatalogActivationDatabase; disconnect(): Promise<void> }>;
  activate(database: FiscalCatalogActivationDatabase, loaded: LoadedFiscalCodingCatalog): Promise<ActivationOutcome>;
  stdout(message: string): void;
  stderr(message: string): void;
}

function printIdentity(write: (message: string) => void, loaded: LoadedFiscalCodingCatalog): void {
  write("Mode: ACTIVATE");
  write(`Country: ${loaded.catalog.countryCode}`);
  write(`Catalog type: ${loaded.catalog.catalogType}`);
  write(`Version: ${loaded.catalog.version}`);
  write(`SHA-256: ${loaded.checksumSha256}`);
}

function printOutcome(write: (message: string) => void, outcome: ActivationOutcome): void {
  write(`Result: ${outcome.result}`);
  if (outcome.result === "activated") {
    write(`Activated at: ${outcome.activatedAt.toISOString()}`);
    if (outcome.retiredRelease) {
      write(`Retired release: ${outcome.retiredRelease.countryCode}/${outcome.retiredRelease.catalogType}/${outcome.retiredRelease.version}/${outcome.retiredRelease.checksumSha256}`);
    }
  }
}

export async function runActivationCli(dependencies: ActivationCliDependencies): Promise<number> {
  let connection: Awaited<ReturnType<ActivationCliDependencies["openDatabase"]>> | null = null;
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
  const exitCode = await runActivationCli({
    loadCatalog: () => loadCrFiscalCodingCatalog(catalogPath),
    openDatabase: async () => {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      return { database: prisma, disconnect: () => prisma.$disconnect() };
    },
    activate: activateCrFiscalCodingCatalog,
    stdout: console.log,
    stderr: console.error,
  });
  process.exitCode = exitCode;
}

if (require.main === module) void main();

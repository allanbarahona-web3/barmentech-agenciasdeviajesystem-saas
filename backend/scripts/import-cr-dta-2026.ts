import { resolve } from "node:path";
import { LoadedCrDta2026Catalog, loadCrDta2026Catalog } from "../src/territorial-catalogs/cr-dta-2026";
import {
  TerritorialImportDatabase,
  TerritorialImportResult,
  auditedTerritorialIdentity,
  importCrDta2026Catalog,
} from "../src/territorial-catalogs/cr-dta-2026-import";

const catalogPath = resolve(__dirname, "../data/territorial-catalogs/cr/dta-2026/catalog.json");

export interface TerritorialImportCliDependencies {
  loadCatalog(): Promise<LoadedCrDta2026Catalog>;
  openDatabase(): Promise<{ database: TerritorialImportDatabase; disconnect(): Promise<void> }>;
  importCatalog(database: TerritorialImportDatabase, loaded: LoadedCrDta2026Catalog): Promise<TerritorialImportResult>;
  stdout(message: string): void;
  stderr(message: string): void;
}

function printIdentity(write: (message: string) => void, loaded: LoadedCrDta2026Catalog): void {
  const identity = auditedTerritorialIdentity(loaded);
  write("Mode: IMPORT");
  write(`Country: ${identity.countryCode}`);
  write(`Version: ${identity.version}`);
  write(`Source authority: ${identity.sourceAuthority}`);
  write(`Source URL: ${identity.sourceUrl}`);
  write(`Source filename: ${identity.originalFilename}`);
  write(`Dataset checksum: ${identity.checksumSha256}`);
  write(`Provinces: ${identity.provinceCount}`);
  write(`Cantons: ${identity.cantonCount}`);
  write(`Districts: ${identity.districtCount}`);
  write(`Total subdivisions: ${identity.totalCount}`);
}

export async function runTerritorialImportCli(dependencies: TerritorialImportCliDependencies): Promise<number> {
  let connection: Awaited<ReturnType<TerritorialImportCliDependencies["openDatabase"]>> | null = null;
  try {
    const loaded = await dependencies.loadCatalog();
    printIdentity(dependencies.stdout, loaded);
    connection = await dependencies.openDatabase();
    const result = await dependencies.importCatalog(connection.database, loaded);
    const success = result === "imported" || result === "already imported";
    (success ? dependencies.stdout : dependencies.stderr)(`Result: ${result}`);
    return success ? 0 : 1;
  } catch {
    dependencies.stderr("Result: import conflict");
    return 1;
  } finally {
    await connection?.disconnect();
  }
}

async function main(): Promise<void> {
  const exitCode = await runTerritorialImportCli({
    loadCatalog: () => loadCrDta2026Catalog(catalogPath),
    openDatabase: async () => {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      return { database: prisma, disconnect: () => prisma.$disconnect() };
    },
    importCatalog: importCrDta2026Catalog,
    stdout: console.log,
    stderr: console.error,
  });
  process.exitCode = exitCode;
}

if (require.main === module) void main();

import { resolve } from "node:path";
import { CabysReleaseInitializationDatabase, initializeCrCabysRelease, LoadedCrCabysManifest, loadCrCabysManifest } from "../src/fiscal-catalogs/cr-cabys-release";

const manifestPath = resolve(__dirname, "../data/fiscal-catalogs/cr/cabys/provider-confirmed-v1/manifest.json");

export interface CabysInitializerCliDependencies {
  loadManifest(): Promise<LoadedCrCabysManifest>;
  openDatabase(): Promise<{ database: CabysReleaseInitializationDatabase; disconnect(): Promise<void> }>;
  stdout(message: string): void;
  stderr(message: string): void;
}

function identityLines(loaded: LoadedCrCabysManifest): string[] {
  return ["Mode: INITIALIZE", `Country: ${loaded.manifest.countryCode}`, `Catalog type: ${loaded.manifest.catalogType}`, `Version: ${loaded.manifest.version}`, `SHA-256: ${loaded.checksumSha256}`];
}

export async function runCabysInitializerCli(dependencies: CabysInitializerCliDependencies): Promise<number> {
  let connection: Awaited<ReturnType<CabysInitializerCliDependencies["openDatabase"]>> | null = null;
  try {
    const loaded = await dependencies.loadManifest(); identityLines(loaded).forEach((line) => dependencies.stdout(line));
    connection = await dependencies.openDatabase();
    const result = await initializeCrCabysRelease(connection.database, loaded);
    dependencies.stdout(`Result: ${result}`); return 0;
  } catch {
    dependencies.stderr("Result: version conflict"); return 1;
  } finally { await connection?.disconnect(); }
}

async function main(): Promise<void> {
  const exitCode = await runCabysInitializerCli({
    loadManifest: () => loadCrCabysManifest(manifestPath),
    openDatabase: async () => { const { PrismaClient } = await import("@prisma/client"); const prisma = new PrismaClient(); return { database: prisma, disconnect: () => prisma.$disconnect() }; },
    stdout: console.log, stderr: console.error,
  });
  process.exitCode = exitCode;
}
if (require.main === module) void main();

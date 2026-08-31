import { resolve } from "node:path";
import { FiscalCatalogConflictError, importCrFiscalCodingCatalog, loadCrFiscalCodingCatalog, summarize } from "../src/fiscal-catalogs/cr-electronic-invoice-coding";

const catalogPath = resolve(__dirname, "../data/fiscal-catalogs/cr/electronic-invoice-coding/v4.4/catalog.json");
const importMode = process.argv.includes("--import");
const unknownArguments = process.argv.slice(2).filter((argument: string) => argument !== "--import");

function printSummary(mode: "DRY RUN" | "IMPORT", summary: ReturnType<typeof summarize>, result: string): void {
  console.log(`Mode: ${mode}`);
  console.log(`Country: ${summary.countryCode}`);
  console.log(`Catalog type: ${summary.catalogType}`);
  console.log(`Version: ${summary.version}`);
  console.log(`Source authority: ${summary.sourceAuthority}`);
  console.log(`Source URL: ${summary.sourceUrl}`);
  console.log(`Source document: ${summary.sourceDocument}`);
  console.log(`Effective from: ${summary.effectiveFrom}`);
  console.log(`SHA-256: ${summary.checksumSha256}`);
  console.log(`Units: ${summary.unitCount} (inactive: ${summary.inactiveUnitCount})`);
  console.log(`Taxes: ${summary.taxCount} (inactive: ${summary.inactiveTaxCount})`);
  console.log(`IVA rates: ${summary.rateCount} (inactive: ${summary.inactiveRateCount})`);
  console.log(`Result: ${result}`);
}

async function main(): Promise<void> {
  if (unknownArguments.length) throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}`);
  const loaded = await loadCrFiscalCodingCatalog(catalogPath);
  if (!importMode) { printSummary("DRY RUN", summarize(loaded), "validated"); return; }

  // Kept out of the dry-run module path so validation never instantiates Prisma or opens a DB connection.
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const result = await importCrFiscalCodingCatalog(prisma, loaded);
    printSummary("IMPORT", summarize(loaded), result);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const result = error instanceof FiscalCatalogConflictError ? "conflict" : "failed";
  console.error(`Result: ${result}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

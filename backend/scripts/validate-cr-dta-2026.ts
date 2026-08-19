import { resolve } from "node:path";
import { loadCrDta2026Catalog, summarizeCrDta2026Catalog } from "../src/territorial-catalogs/cr-dta-2026";

async function main(): Promise<void> {
  const path = resolve(__dirname, "../data/territorial-catalogs/cr/dta-2026/catalog.json");
  const summary = summarizeCrDta2026Catalog(await loadCrDta2026Catalog(path));
  [
    `Country: ${summary.countryCode}`,
    `DTA version: ${summary.version}`,
    `Source authority: ${summary.sourceAuthority}`,
    `Source URL: ${summary.sourceUrl}`,
    `Source filename: ${summary.originalFilename}`,
    `Source SHA-256: ${summary.sourceSha256}`,
    `Dataset SHA-256: ${summary.datasetChecksumSha256}`,
    `Provinces: ${summary.provinceCount}`,
    `Cantons: ${summary.cantonCount}`,
    `Districts: ${summary.districtCount}`,
    "Result: validated",
  ].forEach((line) => process.stdout.write(`${line}\n`));
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Territorial catalog validation failed"}\n`);
  process.exitCode = 1;
});

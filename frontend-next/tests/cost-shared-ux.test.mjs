import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const airportData = JSON.parse(readSource("../src/shared/airports/data/airports.min.json"));
const airportSearch = readSource("../src/shared/airports/airport-search.ts");
const airportSelector = readSource("../src/components/airport-location-field.tsx");
const additionalServicesAirport = readSource("../src/components/airport-search-field.tsx");
const workspace = readSource("../src/features/cost-engine/cost-workspace.tsx");
const evolution = readSource("../src/features/cost-engine/airfare-evolution-dialog.tsx");
const viewer = readSource("../src/components/attachment-viewer.tsx");

test("the shared airport selector uses the existing standardized dataset and supports manual input", () => {
  assert.ok(airportData.some((airport) => airport.iata === "SJO" && airport.name && airport.city && airport.country));
  assert.match(airportSearch, /searchAirports/);
  assert.match(airportSelector, /AirportSearchField/);
  assert.match(airportSelector, /kind: "STANDARD"/);
  assert.match(airportSelector, /kind: "MANUAL"/);
  assert.match(airportSelector, /Ingresar manualmente/);
  assert.match(airportSelector, /Buscar aeropuerto/);
  assert.match(airportSelector, /item\.iata === value\.trim\(\)\.toUpperCase\(\)/);
});

test("Cost Engine maps airport selector state to its existing string payload and preserves edit values", () => {
  assert.match(workspace, /<AirportLocationField label="Origen" value=\{values\.origin \?\? ""\}/);
  assert.match(workspace, /<AirportLocationField label="Destino" value=\{values\.destination \?\? ""\}/);
  assert.match(workspace, /selection\.kind === "STANDARD" \? selection\.airport\.iata : selection\.value/);
  assert.match(workspace, /function formFromComponent\(component: CostComponent\)/);
  assert.match(workspace, /origin: string\("origin"\), destination: string\("destination"\)/);
  assert.match(workspace, /function airfareComponentTitle\(values: DetailValues\).*join\(" → "\)/);
});

test("Additional Services retains its existing airport field without Cost Engine coupling", () => {
  assert.match(additionalServicesAirport, /searchAirports\(query, \{ limit: 10 \}\)/);
  assert.doesNotMatch(airportSelector, /additional-services/i);
});

test("Cost Engine opens evidence inline and resolves signed URLs only for the selected attachment", () => {
  for (const source of [workspace, evolution]) {
    assert.match(source, /AttachmentViewer/);
    assert.doesNotMatch(source, /window\.open/);
  }
  assert.match(workspace, /listCostEvidence\(initialSnapshot\.id\)/);
  assert.match(workspace, /getCostEvidenceAccess\(evidenceViewer\.snapshotId, attachment\.id\)/);
  assert.match(workspace, /originalFileName: item\.originalFileName, mimeType: item\.mimeType/);
  assert.match(evolution, /originalFileName: evidence\.originalFileName, mimeType: evidence\.mimeType/);
  assert.match(viewer, /current\?\.mimeType\?\.startsWith\("image\/"\)/);
  assert.match(viewer, /current\?\.mimeType === "application\/pdf"/);
});

test("Cost Workspace keeps source links external and removes the inert travel-detail button", () => {
  assert.match(evolution, /href=\{row\.sourceUrl\} target="_blank" rel="noreferrer"/);
  assert.doesNotMatch(workspace, /Ver detalles del viaje/);
  assert.match(workspace, /← Volver a viajes/);
  assert.match(workspace, /Evolución de costos/);
});

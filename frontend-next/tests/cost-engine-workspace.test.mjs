import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const api = readSource("../src/lib/cost-engine-api.ts");
const workspace = readSource("../src/features/cost-engine/cost-workspace.tsx");
const travelPackages = readSource("../src/components/travel-packages-manager.tsx");
const internalTrips = readSource("../src/app/admin/internal-trips/components/internal-trips-list.tsx");

test("uses source-specific resolver routes and does not send tenant or project authority", () => {
  assert.match(api, /\/cost-engine\/travel-packages\/\$\{encodeURIComponent\(travelPackageId\)\}\/costing-project/);
  assert.match(api, /\/cost-engine\/internal-trips\/\$\{encodeURIComponent\(internalTripId\)\}\/costing-project/);
  assert.doesNotMatch(api, /tenantId\s*:/);
});

test("uses the bounded composition response for edit hydration and the live summary", () => {
  assert.match(workspace, /composition\?\.components\.find\(\(item\) => item\.id === componentId\)/);
  assert.doesNotMatch(workspace, /getCostComponent\(/);
  assert.match(workspace, /categorySubtotals\.map/);
  assert.match(workspace, /authoritativeTotalCost/);
  assert.match(workspace, /specializedDescription\(component\)/);
  assert.match(api, /pageSize: 20/);
});

test("maps all supported v1 specialized categories and leaves OTHER/custom generic", () => {
  for (const code of ["AIRFARE", "BAGGAGE", "LODGING", "TRANSPORTATION", "TOUR", "INSURANCE", "EVENT_TICKET", "VISA_ASSISTANCE", "MEALS"]) {
    assert.match(workspace, new RegExp(`case "${code}"`));
  }
  assert.match(api, /category\.origin === "CUSTOM" \|\| !SPECIALIZED_STANDARD_CATEGORY_CODES\.has\(category\.code\)/);
  assert.match(workspace, /detailPayload: details, detailSchemaVersion: 1/);
  assert.match(workspace, /hasUnsupportedDetailSchema/);
  assert.match(workspace, /se conservan sin reinterpretarlos/);
});

test("keeps monetary values as exact strings and uses backend totals without recalculation", () => {
  assert.match(workspace, /const MONEY_PATTERN = \/\^\\d\+\(\?:\\\.\\d\{1,5\}\)\?\$\//);
  assert.match(workspace, /amount: form\.amount\.trim\(\)/);
  assert.match(workspace, /quantity: genericCategory \? form\.quantity\.trim\(\) \|\| null/);
  assert.doesNotMatch(workspace, /parseFloat\(form\.amount/);
  assert.doesNotMatch(workspace, /Number\(form\.amount/);
  assert.doesNotMatch(workspace, /reduce\([^\n]*authoritativeTotalCost/);
});

test("localizes standard Cost Engine labels without changing their stored codes", () => {
  for (const label of ["Boleto aéreo", "Equipaje", "Hospedaje", "Transporte", "Tour", "Seguro", "Entradas", "Asistencia de visa", "Alimentación", "Otros"]) {
    assert.match(workspace, new RegExp(label));
  }
  for (const label of ["Doble", "Individual", "Triple", "Cuádruple"]) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /function categoryDisplayName/);
  assert.match(workspace, /category\.origin === "CUSTOM" \? category\.displayName/);
  assert.match(workspace, /categoryDisplayName\(category\)/);
  assert.match(workspace, /enumValue\(value, field\)/);
  assert.match(workspace, /normalizeCustomCostCategoryCode\(displayName\)/);
});

test("keeps ACCOMMODATION out of the standard selector and folds its fields into Hospedaje", () => {
  assert.match(workspace, /category\.origin === "STANDARD" && category\.code !== "ACCOMMODATION"/);
  assert.doesNotMatch(api.match(/SPECIALIZED_STANDARD_CATEGORY_CODES = new Set\(\[[\s\S]*?\]\);/)?.[0] ?? "", /"ACCOMMODATION"/);
  for (const label of ["Nombre del alojamiento", "Ciudad", "Tipo de hospedaje", "Tipo de habitación", "Check-in", "Check-out", "Noches", "Cantidad de habitaciones"]) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /lodgingType: enumValue\(string\("lodgingType"\), "lodgingType"\)/);
  assert.match(workspace, /roomType: enumValue\(string\("roomType"\), "roomType"\)/);
  for (const label of ["Hotel", "Hostel", "Airbnb", "Apartamento", "Matrimonial", "Cuádruple"]) {
    assert.match(workspace, new RegExp(label));
  }
});

test("generates the Hospedaje title from specialized data without rendering a manual title field", () => {
  assert.match(workspace, /const lodgingCategory = selectedCategory\?\.code === "LODGING"/);
  assert.match(workspace, /const componentTitle = lodgingCategory \? lodgingComponentTitle\(form\.details\) \|\| form\.title\.trim\(\) : airfareCategory \? airfareComponentTitle\(form\.details\) \|\| form\.title\.trim\(\) : form\.title\.trim\(\)/);
  assert.match(workspace, /title: componentTitle/);
  assert.match(workspace, /function lodgingComponentTitle\(values: DetailValues\) \{ return \[values\.propertyName\?\.trim\(\), values\.city\?\.trim\(\)\]\.filter\(Boolean\)\.join\(" - "\); \}/);
  assert.match(workspace, /!polishedSpecializedCategory \? <div className="grid gap-4 sm:grid-cols-2"><Field label="Título \*">/);
});

test("keeps the approved Hospedaje cost, supporting-information, and edit flow", () => {
  assert.match(workspace, /Costo y proveedor/);
  assert.match(workspace, /Información de respaldo/);
  assert.match(workspace, /<Field label="Referencia \(opcional\)">/);
  assert.match(workspace, /Cotización #1234, correo, WhatsApp o código de reserva/);
  assert.match(workspace, /<Field label="URL de fuente \(opcional\)">/);
  assert.match(workspace, /<EvidenceFields title="Comprobante \(opcional\)"/);
  assert.match(workspace, /!polishedSpecializedCategory \? <Field label="Observaciones">/);
  assert.match(workspace, /<EvidenceFields title="Comprobante \(opcional\)"[\s\S]*?<Field label="Observaciones">/);
  assert.doesNotMatch(workspace, /Motivo \/ observación del costo/);
  assert.match(workspace, /\{genericCategory \? <div className="grid gap-4 sm:grid-cols-2">/);
  assert.match(workspace, /formFromComponent\(component\)/);
  assert.match(workspace, /updateGenericCostComponent\(selectedComponentId, structural\)/);
});

test("finalizes Boleto aéreo with generated route title and stable specialized values", () => {
  assert.match(workspace, /const airfareCategory = selectedCategory\?\.code === "AIRFARE"/);
  assert.match(workspace, /function airfareComponentTitle\(values: DetailValues\) \{ return \[values\.origin\?\.trim\(\), values\.destination\?\.trim\(\)\]\.filter\(Boolean\)\.join\(" → "\); \}/);
  assert.match(workspace, /flightType: \["INTERNAL", "INTERNATIONAL"\]/);
  assert.match(workspace, /tripType: \["ONE_WAY", "ROUND_TRIP"\]/);
  for (const label of ["Tipo de vuelo", "Tipo de trayecto", "Origen", "Destino", "Fecha de salida", "Aerolínea", "Cabina", "Interno", "Internacional", "Solo ida", "Ida y vuelta", "Económica", "Económica premium", "Ejecutiva", "Primera", "Otra"]) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /flightType: enumValue\(string\("flightType"\), "flightType"\)/);
  assert.match(workspace, /const tripType = enumValue\(string\("tripType"\), "tripType"\)/);
  assert.match(workspace, /tripType === "ROUND_TRIP" \? date\("returnDate"\) : undefined/);
  assert.match(workspace, /values\.tripType === "ROUND_TRIP" \? text\("Fecha de regreso", "returnDate", "date"\) : null/);
  assert.match(workspace, /if \(field === "cabinClass" && value === "OTHER"\) return "Otra"/);
});

test("keeps Boleto aéreo supporting fields, evidence, and observations without generic quantity or unit", () => {
  assert.match(workspace, /Datos del vuelo/);
  assert.match(workspace, /Cotización, localizador, correo o referencia de tarifa/);
  assert.match(workspace, /Referencia \(opcional\)/);
  assert.match(workspace, /URL de fuente \(opcional\)/);
  assert.match(workspace, /polishedSpecializedCategory \? <>[\s\S]*?<EvidenceFields title="Comprobante \(opcional\)"[\s\S]*?<Field label="Observaciones">/);
  const airfareForm = workspace.slice(workspace.indexOf('case "AIRFARE": return <DetailGrid>'), workspace.indexOf('case "BAGGAGE"'));
  assert.doesNotMatch(airfareForm, /Cantidad|Unidad/);
  assert.doesNotMatch(workspace, /Motivo \/ observación del costo/);
});

test("removes generic applicability and duplicate cost-note controls from the workspace", () => {
  assert.doesNotMatch(workspace, /Aplicabilidad básica/);
  assert.doesNotMatch(workspace, /createCostApplicability/);
  assert.doesNotMatch(workspace, /Motivo \/ observación del costo/);
  assert.match(workspace, /<Field label="Observaciones">/);
  assert.match(workspace, /reason: initialSnapshot\?\.reason \?\? null/);
});

test("creates a Cost Engine supplier inline and retains the component form", () => {
  assert.match(workspace, /\+ Nuevo proveedor/);
  assert.match(workspace, /<Dialog open=\{showNewSupplier\}/);
  assert.match(workspace, /createCostSupplier\(\{ name, website: newSupplier\.website\.trim\(\) \|\| null, notes: newSupplier\.notes\.trim\(\) \|\| null \}\)/);
  assert.match(workspace, /const refreshed = await listCostSuppliers\(\)/);
  assert.match(workspace, /setForm\(\(current\) => \(\{ \.\.\.current, costSupplierId: created\.id \}\)\)/);
  const supplierHandler = workspace.slice(workspace.indexOf("async function submitNewSupplier"), workspace.indexOf("async function openEvidence"));
  assert.doesNotMatch(supplierHandler, /resetForm\(\)/);
  assert.match(api, /apiPost<CostSupplier>\("\/cost-engine\/suppliers", input\)/);
});

test("keeps generic quantity and unit only for OTHER and custom categories", () => {
  assert.match(workspace, /\{genericCategory \? <div className="grid gap-4 sm:grid-cols-2">/);
  assert.match(workspace, /<Field label="Unidad">/);
  assert.match(workspace, /selectedComponent\?\.quantity \?\? null/);
  assert.match(workspace, /<SpecializedDetailsFields code=\{selectedCategory\.code\}/);
});

test("supports save actions and explicit evidence upload/access through snapshot-scoped routes", () => {
  assert.match(workspace, /Guardar y agregar otro/);
  assert.match(workspace, /Cancelar/);
  assert.match(api, /snapshots\/\$\{encodeURIComponent\(costSnapshotId\)\}\/evidence/);
  assert.match(api, /formData\.append\("file", file\)/);
  assert.match(workspace, /uploadCostEvidence\(snapshotForEvidence\.id, evidenceFile\)/);
  assert.match(workspace, /getCostEvidenceAccess\(initialSnapshot\.id, item\.id\)/);
});

test("adds the ADMIN cost workspace entry point to each travel source", () => {
  assert.match(travelPackages, /\/admin\/cost-engine\/travel-package\/\$\{encodeURIComponent\(pkg\.id\)\}/);
  assert.match(internalTrips, /canComposeCosts \? \(/);
  assert.match(internalTrips, /\/admin\/cost-engine\/internal-trip\/\$\{encodeURIComponent\(trip\.id\)\}/);
});

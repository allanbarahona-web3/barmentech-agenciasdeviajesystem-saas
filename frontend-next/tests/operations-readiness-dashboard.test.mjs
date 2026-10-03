import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const dashboard = () => read('../src/components/operations/operational-readiness-dashboard.tsx');
const api = () => read('../src/lib/operations-api.ts');
const shell = () => read('../src/components/operations/operations-trip-shell.tsx');

test('Readiness dashboard is the Operations summary section and exposes all backend readiness labels', () => {
  const source = dashboard();
  assert.match(shell(), /OperationalReadinessDashboard/);
  assert.match(shell(), /type Section = 'summary' \| 'operation'/);
  for (const label of ['Listo', 'En riesgo', 'No listo', 'Sin críticos definidos']) assert.match(source, new RegExp(label));
  assert.match(source, /Todos los requerimientos críticos aplicables están cubiertos/);
});

test('Overall progress, roster distinction, service progress, and inconsistency warning use response values without recomputation', () => {
  const source = dashboard();
  assert.match(source, /overall\.progressPercent === null/);
  assert.match(source, /Sin necesidades operativas/);
  assert.match(source, /overall\.completePassengerCount\} de \$\{overall\.participantCountWithRequirements/);
  assert.match(source, /overall\.totalRosterPassengerCount/);
  assert.match(source, /readiness\.services\.map/);
  assert.match(source, /fulfilledRequirementWithoutCoverageCount > 0/);
  assert.doesNotMatch(source, /\.reduce\(/);
});

test('Heatmap cells render full readable backend-status labels from the package matrix response', () => {
  const source = dashboard();
  for (const label of ['Comprado', 'En gestión', 'Pendiente', 'No aplica', 'Sin requerimiento']) assert.match(source, new RegExp(label));
  for (const shortLabel of ["short: 'C'", "short: 'G'", "short: 'P'", "short: 'NA'", "short: '—'"]) assert.doesNotMatch(source, new RegExp(shortLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /aria-label=\{`\$\{participant\.fullName\}: \$\{column\.servicePurposeName\}, \$\{presentation\.label\}`\}/);
  assert.match(source, /matrix\.serviceColumns\.map/);
  assert.match(source, /cellsByService: new Map\(participant\.serviceCells\.map/);
  assert.match(source, /cellsByService\.get\(column\.servicePurposeCode\)/);
  assert.doesNotMatch(source, /serviceCells\.find/);
  assert.match(source, /sticky left-0/);
  assert.match(source, /aria-label=\{`\$\{participant\.fullName\}/);
});

test('Dashboard uses one readiness read and one paginated matrix read with empty, loading, error, and refresh states', () => {
  const source = dashboard(); const client = api();
  assert.match(source, /getOperationsReadiness\(travelPackageId\)/);
  assert.match(source, /getOperationsPassengerMatrix\(travelPackageId, matrixPage\)/);
  assert.match(source, /No hay pasajeros registrados en este viaje/);
  assert.match(source, /Aún no hay servicios operativos que requieran seguimiento/);
  assert.match(source, /Cargando preparación operativa/);
  assert.match(source, /Cargando matriz de pasajeros/);
  assert.match(source, /await Promise\.all\(\[loadReadiness\(\), loadMatrix\(\)\]\)/);
  assert.match(client, /pageSize: '20'/);
  assert.doesNotMatch(source, /getOperationalPassengerOverview|listOperationalRequirements|getOperationalFulfillment/);
});

test('Mounted summary reloads bounded readiness and matrix data after confirmed coverage changes', () => {
  const source = dashboard(); const tripShell = shell();
  assert.match(source, /refreshVersion\?: number/);
  assert.match(source, /\[travelPackageId, refreshVersion\]/);
  assert.match(source, /\[travelPackageId, matrixPage, refreshVersion\]/);
  assert.match(tripShell, /const \[coverageVersion, setCoverageVersion\] = useState\(0\)/);
  assert.match(tripShell, /refreshVersion=\{coverageVersion\}/);
  assert.doesNotMatch(source + tripShell, /window\.location|location\.reload/);
});

test('Readiness client contracts remain centralized and the dashboard contains no Finance, purchase, or per-cell requests', () => {
  const source = dashboard(); const client = api();
  assert.match(client, /export function getOperationsReadiness/);
  assert.match(client, /export function getOperationsPassengerMatrix/);
  assert.doesNotMatch(source, /FinanceEligibility|listOperationalPurchases|listOperationalEvidence|fetch\(/);
  assert.doesNotMatch(source, /serviceCells\.map\([^)]*getOperations/);
});

test('summary empty state does not invite manual Operations demand', () => {
  const source = dashboard();
  assert.match(source, /Los servicios aprobados desde Contratos, Servicios adicionales o Cotizaciones personalizadas aparecerán aquí/);
  assert.doesNotMatch(source, /Agregar necesidad|onAddExceptionalNeed/);
});

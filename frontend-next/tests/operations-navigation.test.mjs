import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('Operations navigation is limited to ADMIN and OPERACIONES with a distinct ClipboardCheck identity', () => {
  const nav = readSource('../src/components/vertical-nav.tsx');
  assert.match(nav, /import \{ ClipboardCheck, Layers3 \} from "lucide-react"/);
  assert.match(nav, /hasOperationsAccess = isAdmin \|\| role === "OPERACIONES"/);
  assert.match(nav, /label: "Operaciones"/);
  assert.match(nav, /icon: <ClipboardCheck aria-hidden="true" size=\{18\}/);
  assert.match(nav, /href: "\/operations\/international"/);
  assert.match(nav, /href: "\/operations\/migration"/);
  assert.match(nav, /href: "\/operations\/national"/);
});

test('Operations landing exposes supported trip types while keeping national operations unavailable', () => {
  const landing = readSource('../src/components/operations/operations-landing.tsx');
  assert.match(landing, /Internacionales/);
  assert.match(landing, /Migraciones/);
  assert.match(landing, /Nacionales/);
  assert.match(landing, /Próximamente/);
  assert.match(landing, /\/operations\/international/);
  assert.match(landing, /\/operations\/migration/);
});

test('Operations direct routes use one hydration-safe access gate before rendering protected content', () => {
  const gate = readSource('../src/components/operations/operations-access-gate.tsx');
  const routes = [
    readSource('../src/app/operations/page.tsx'),
    readSource('../src/app/operations/international/page.tsx'),
    readSource('../src/app/operations/migration/page.tsx'),
    readSource('../src/app/operations/national/page.tsx'),
    readSource('../src/app/operations/trips/[travelPackageId]/page.tsx'),
  ];
  assert.match(gate, /useState<'resolving' \| 'authorized' \| 'unauthorized'>\('resolving'\)/);
  assert.match(gate, /new Set\(\['ADMIN', 'OPERACIONES'\]\)/);
  assert.match(gate, /getStoredSession\(\)/);
  assert.match(gate, /AUTH_SESSION_CHANGED_EVENT/);
  assert.match(gate, /if \(access !== 'authorized'\) return <PageLoader/);
  assert.match(gate, /router\.replace\('\/'\)/);
  assert.match(gate, /router\.replace\(getHomeRouteForRole\(role\)\)/);
  for (const route of routes) assert.match(route, /OperationsAccessGate/);
  for (const source of [
    readSource('../src/components/operations/operations-landing.tsx'),
    readSource('../src/components/operations/operations-travel-package-list.tsx'),
    readSource('../src/components/operations/operations-trip-shell.tsx'),
  ]) assert.doesNotMatch(source, /getStoredSession\(\)|hasOperationsAccess/);
});

test('Operations trip cards use only the summary API and operational fields', () => {
  const list = readSource('../src/components/operations/operations-travel-package-list.tsx');
  const api = readSource('../src/lib/operations-api.ts');
  assert.match(list, /listOperationsTravelPackages\(travelType, page, search\)/);
  assert.match(api, /\/operations\/travel-packages\/summaries/);
  assert.match(list, /trip\.operational\.progressPercent/);
  assert.match(list, /trip\.operational\.completePassengerCount/);
  assert.match(list, /trip\.operational\.criticalPending/);
  assert.match(list, /trip\.operational\.criticalDueSoon/);
  assert.match(list, /trip\.operational\.progressPercent === null \? 'Sin requerimientos'/);
  assert.match(list, /\/operations\/trips\/\$\{trip\.travelPackageId\}/);
  assert.doesNotMatch(list, /packagePrice|minReservation|contract|soldAmount|currency/);
  assert.doesNotMatch(list, /getReadiness|passenger-matrix|Promise\.all/);
});

test('Operations readiness labels are explicit and the selected-trip workspace uses operator navigation', () => {
  const list = readSource('../src/components/operations/operations-travel-package-list.tsx');
  const shell = readSource('../src/components/operations/operations-trip-shell.tsx');
  assert.match(list, /READY: \{ label: 'Listo'/);
  assert.match(list, /AT_RISK: \{ label: 'En riesgo'/);
  assert.match(list, /NOT_READY: \{ label: 'No listo'/);
  assert.match(list, /NO_CRITICAL_REQUIREMENTS: \{ label: 'Sin críticos definidos'/);
  assert.match(shell, /Resumen/);
  assert.match(shell, /Operación/);
  assert.doesNotMatch(shell, /Trabajo operativo/);
  assert.doesNotMatch(shell, /Pasajeros/);
  assert.match(shell, /OperationalUnifiedWorkspace/);
  assert.match(shell, /TripContextHeader trip=\{tripContext\}/);
  assert.match(shell, /getTravelPackageById\(travelPackageId\)/);
  assert.doesNotMatch(shell, /getOperationalPassengerOverview/);
  for (const label of ['Espacio operativo', 'trip.name', 'trip.packageCode', 'trip.destination']) assert.match(shell, new RegExp(label));
  assert.match(shell, /formatBusinessDate\(trip\.departureDate\)/);
  assert.doesNotMatch(shell, />Requerimientos<|>Reservas \/ Gestión</);
  assert.doesNotMatch(shell, /crear requerimiento|subir evidencia|registrar compra/i);
});

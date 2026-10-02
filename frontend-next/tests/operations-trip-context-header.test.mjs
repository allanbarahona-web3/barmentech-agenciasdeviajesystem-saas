import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const shell = () => read('../src/components/operations/operations-trip-shell.tsx');
const workspace = () => read('../src/components/operations/operational-unified-workspace.tsx');

test('selected-trip context header is composed above both Resumen and Operación content', () => {
  const source = shell();
  assert.match(source, /<OperationsTimingProfiler id="operations-trip-header"><TripContextHeader trip=\{tripContext\} \/><\/OperationsTimingProfiler><WorkspaceNav/);
  assert.match(source, /hidden=\{section !== 'summary'\}/);
  assert.match(source, /<OperationalUnifiedWorkspace travelPackageId=\{travelPackageId\}/);
});

test('context header is persistent through passenger, group, global queue, and management composition', () => {
  const source = workspace();
  for (const label of ['Por pasajero', 'Por grupo', 'Todos los trabajos', 'OperationalFulfillmentsWorkspace']) assert.match(source, new RegExp(label));
  assert.match(shell(), /TripContextHeader/);
  assert.doesNotMatch(shell(), /sold|Finance|Compra|Vendido/i);
});

test('context uses one lightweight travel-package read and never the passenger overview', () => {
  const source = shell();
  assert.match(source, /useEffect\(\(\) => \{ let active = true; void getTravelPackageById\(travelPackageId\)/);
  assert.equal((source.match(/getTravelPackageById\(travelPackageId\)/g) ?? []).length, 1);
  assert.doesNotMatch(source, /getOperationalPassengerOverview/);
  assert.doesNotMatch(source, /listOperationalWorkItems|listOperationalPurchases|listOperationalEvidence/);
});

test('switching workspace sections keeps visited views mounted and preserves selected-trip request ownership', () => {
  const source = shell();
  assert.match(source, /useState\(false\)/);
  assert.match(source, /operationVisited \? <div hidden=\{section !== 'operation'\}>/);
  assert.match(source, /<div hidden=\{section !== 'summary'\}><OperationsTimingProfiler id="operations-readiness-dashboard"><OperationalReadinessDashboard/);
  assert.match(source, /const selectSection = \(next: Section\) => \{ if \(next === 'operation'\) setOperationVisited\(true\); setSection\(next\); \}/);
});

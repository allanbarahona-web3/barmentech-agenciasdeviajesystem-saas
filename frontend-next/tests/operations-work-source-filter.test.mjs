import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const unified = () => read('../src/components/operations/operational-unified-workspace.tsx');

test('passenger dashboard supplies source to its single server-side dashboard reader', () => {
  const source = unified();
  assert.match(source, /useState<OperationalPassengerDashboardSource \| undefined>\(\)/);
  assert.match(source, /getOperationalPassengerDashboard\(travelPackageId, \{[^]*source, status/);
  assert.match(source, /operationalSourceLabel\(facet\.value\)/);
  assert.doesNotMatch(source, /requirements\.filter\(/);
});

test('source selection resets passenger pagination and retains the dashboard empty state', () => {
  const source = unified();
  assert.match(source, /setSource\(\(event\.target\.value \|\| undefined\)/);
  assert.match(source, /resetPage\(\);/);
  assert.match(source, /No se encontraron pasajeros con estos filtros\./);
});

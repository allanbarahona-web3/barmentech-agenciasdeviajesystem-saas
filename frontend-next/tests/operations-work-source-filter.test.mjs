import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const api = () => read('../src/lib/operations-api.ts');
const unified = () => read('../src/components/operations/operational-unified-workspace.tsx');
const queue = () => read('../src/components/operations/operational-requirements-workspace.tsx');
const filter = () => read('../src/components/operations/operational-work-source-filter.tsx');

test('shared source filter defaults to Todos and exposes only user-facing origin labels', () => {
  const source = filter();
  assert.match(source, /label: 'Todos'/);
  assert.match(source, /label: operationalSourceLabel\('BASE_TRIP'\)/);
  assert.match(source, /label: operationalSourceLabel\('ADDITIONAL_SERVICES'\)/);
  assert.match(source, /aria-label="Filtrar por origen del trabajo"/);
  assert.doesNotMatch(source, /TRAVEL_PACKAGE_COST_COMPONENT|ADDITIONAL_SERVICE_ORDER_LINE/);
  assert.match(source, /operationalSourceLabel/);
  assert.match(unified(), /aria-label="Filtrar por origen"/);
});

test('work API serializes the grouped source category without client-side source filtering', () => {
  const source = api();
  assert.match(source, /OperationalWorkSourceCategory = 'ALL' \| 'BASE_TRIP' \| 'ADDITIONAL_SERVICES'/);
  assert.match(source, /if \(input\.sourceCategory\) params\.set\('sourceCategory', input\.sourceCategory\)/);
  assert.doesNotMatch(unified(), /TRAVEL_PACKAGE_COST_COMPONENT|ADDITIONAL_SERVICE_ORDER_LINE/);
});

test('passenger dashboard supplies source to its single server-side dashboard reader', () => {
  const source = unified();
  assert.match(source, /useState<OperationalPassengerDashboardSource \| undefined>\(\)/);
  assert.match(source, /getOperationalPassengerDashboard\(travelPackageId, \{[^]*source, status/);
  assert.match(source, /operationalSourceLabel\(facet\.value\)/);
  assert.doesNotMatch(source, /requirements\.filter\(/);
});

test('legacy global queue retains its own source category and dashboard does not render it as a primary view', () => {
  const source = queue();
  assert.match(source, /sourceCategory = 'ALL'/);
  assert.match(source, /sourceCategory, search/);
  assert.match(source, /loadedSourceCategory\.current !== sourceCategory.*setPage\(1\); return/);
  assert.match(source, /\[page, status, service, critical, search, active, deadlineState, groupId, participantId, sourceCategory/);
  assert.doesNotMatch(unified(), /sourceCategory=\{sourceCategory\} onSourceCategoryChange=\{setSourceCategory\}/);
});

test('source selection resets passenger pagination and retains the dashboard empty state', () => {
  const source = unified();
  assert.match(source, /setSource\(\(event\.target\.value \|\| undefined\)/);
  assert.match(source, /resetPage\(\);/);
  assert.match(source, /No se encontraron pasajeros con estos filtros\./);
});

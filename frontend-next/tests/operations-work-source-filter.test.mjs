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
  assert.match(source, /label: 'Base del viaje'/);
  assert.match(source, /label: 'Servicios adicionales'/);
  assert.match(source, /aria-label="Filtrar por origen del trabajo"/);
  assert.doesNotMatch(source, /TRAVEL_PACKAGE_COST_COMPONENT|ADDITIONAL_SERVICE_ORDER_LINE/);
  assert.doesNotMatch(source, /Contrato|Manual|Cotización personalizada/);
  assert.match(unified(), /useState<OperationalWorkSourceCategory>\('ALL'\)/);
});

test('work API serializes the grouped source category without client-side source filtering', () => {
  const source = api();
  assert.match(source, /OperationalWorkSourceCategory = 'ALL' \| 'BASE_TRIP' \| 'ADDITIONAL_SERVICES'/);
  assert.match(source, /if \(input\.sourceCategory\) params\.set\('sourceCategory', input\.sourceCategory\)/);
  assert.doesNotMatch(unified(), /TRAVEL_PACKAGE_COST_COMPONENT|ADDITIONAL_SERVICE_ORDER_LINE/);
});

test('passenger and group work requests include the shared source category while preserving selection and roster ownership', () => {
  const source = unified();
  assert.match(source, /\{ page: 1, active: true, sourceCategory, \.\.\.workFilter \}/);
  assert.match(source, /\[mode, selectedPassengerId, selectedGroupId, sourceCategory, travelPackageId, workVersion\]/);
  assert.match(source, /const selectPassenger = \(id: string\) => \{ setSelectedPassengerId\(id\); setMode\('passenger'\); \}/);
  assert.match(source, /setSelectedGroupId\(id\); setMode\('group'\)/);
  assert.equal((source.match(/getOperationalPassengerRoster\(travelPackageId, 1, search/g) ?? []).length, 1);
  assert.doesNotMatch(source, /work\.filter\(.*source|sourceCategory.*\.filter\(/);
});

test('global queue receives the same source category with existing filters and resets pagination on category changes', () => {
  const source = queue();
  assert.match(source, /sourceCategory = 'ALL'/);
  assert.match(source, /sourceCategory, search/);
  assert.match(source, /loadedSourceCategory\.current !== sourceCategory.*setPage\(1\); return/);
  assert.match(source, /\[page, status, service, critical, search, active, deadlineState, groupId, participantId, sourceCategory/);
  assert.match(unified(), /sourceCategory=\{sourceCategory\} onSourceCategoryChange=\{setSourceCategory\}/);
});

test('source selection persists across workspace views and uses contextual filtered empty states', () => {
  const source = unified();
  assert.match(source, /<OperationalWorkSourceFilter value=\{sourceCategory\} onChange=\{setSourceCategory\}/);
  assert.match(source, /const filteredEmpty = sourceCategory === 'ALL' \? undefined : 'No hay trabajos de este origen para esta vista\.'/);
  assert.match(queue(), /sourceCategory !== 'ALL' \? <>\<p className="font-medium">No hay trabajos de este origen para esta vista\./);
  assert.match(queue(), /onSourceCategoryChange\?\.\('ALL'\)/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const badge = () => read('../src/components/operations/operational-work-source-badge.tsx');
const queue = () => read('../src/components/operations/operational-requirements-workspace.tsx');
const unified = () => read('../src/components/operations/operational-unified-workspace.tsx');
const api = () => read('../src/lib/operations-api.ts');

test('maps only explicit modern source categories to visible origin labels', () => {
  const source = badge();
  assert.match(source, /sourceCategory === 'BASE_TRIP'/);
  assert.match(source, /operationalSourceLabel\(sourceCategory\)/);
  assert.match(source, /sourceCategory === 'ADDITIONAL_SERVICES'/);
  assert.match(source, /: null;/);
  assert.match(source, /variant: 'secondary'/);
  assert.match(source, /variant: 'info'/);
  assert.doesNotMatch(source, /CONTRACT|MANUAL|TRAVEL_PACKAGE_COST_COMPONENT|ADDITIONAL_SERVICE_ORDER_LINE/);
});

test('omits the modern badge for null source categories, including historical work', () => {
  const source = badge();
  assert.match(source, /if \(sourceCategory === null\) return null;/);
  assert.doesNotMatch(source, /CONTRACT|MANUAL/);
});

test('legacy queue keeps its source badge while the passenger dashboard renders its user-facing source label', () => {
  assert.match(api(), /sourceType: string \| null; sourceCategory: OperationalWorkItemSourceCategory/);
  assert.match(queue(), /<OperationalWorkSourceBadge sourceCategory=\{item\.sourceCategory\} \/>/);
  assert.match(unified(), /operationalSourceLabel\(requirement\.sourceType\)/);
  assert.doesNotMatch(unified(), /TRAVEL_PACKAGE_COST_COMPONENT|ADDITIONAL_SERVICE_ORDER_LINE/);
});

test('legacy queue keeps its source badge and dashboard renders one sourceLabel per requirement row', () => {
  assert.equal((queue().match(/<OperationalWorkSourceBadge sourceCategory=\{item\.sourceCategory\} \/>/g) ?? []).length, 1);
  assert.match(queue(), /needs\.map\(\(item\) => <NeedCard key=\{item\.id\}/);
  assert.match(unified(), /item\.requirements\.map\(\(requirement\) => <RequirementRow key=\{requirement\.requirementId\}/);
  assert.match(queue(), /sourceCategory, search/);
  assert.match(unified(), /source, status/);
});

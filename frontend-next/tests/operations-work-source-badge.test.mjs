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
  assert.match(source, /label: 'Paquete contratado'/);
  assert.match(source, /sourceCategory === 'ADDITIONAL_SERVICES'/);
  assert.match(source, /label: 'Servicio adicional'/);
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

test('consumes explicit API metadata without rendering raw categories or source identities', () => {
  assert.match(api(), /sourceType: string \| null; sourceCategory: OperationalWorkItemSourceCategory/);
  for (const source of [queue(), unified()]) {
    assert.match(source, /<OperationalWorkSourceBadge sourceCategory=\{item\.sourceCategory\} \/>/);
    assert.doesNotMatch(source, /item\.sourceType/);
    assert.doesNotMatch(source, />\{item\.sourceCategory\}</);
  }
});

test('renders one source badge from each existing card renderer without changing request filters or card keys', () => {
  assert.equal((queue().match(/<OperationalWorkSourceBadge sourceCategory=\{item\.sourceCategory\} \/>/g) ?? []).length, 1);
  assert.equal((unified().match(/<OperationalWorkSourceBadge sourceCategory=\{item\.sourceCategory\} \/>/g) ?? []).length, 1);
  assert.match(queue(), /needs\.map\(\(item\) => <NeedCard key=\{item\.id\}/);
  assert.match(unified(), /work\.map\(\(item\) => <Card key=\{item\.id\}/);
  assert.match(queue(), /sourceCategory, search/);
  assert.match(unified(), /sourceCategory, \.\.\.workFilter/);
});

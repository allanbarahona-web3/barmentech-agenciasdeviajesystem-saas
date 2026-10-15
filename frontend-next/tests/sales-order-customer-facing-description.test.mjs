import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(
  new URL('../src/app/sales-orders/[id]/page.tsx', import.meta.url),
  'utf8',
);
const api = readFileSync(
  new URL('../src/lib/sales-orders-api.ts', import.meta.url),
  'utf8',
);

test('Additional Services sales-order lines prefer the persisted customer-facing snapshot', () => {
  assert.match(api, /customerFacingDescription\?: string \| null/);
  assert.match(page, /sourceType !== 'ADDITIONAL_SERVICE_ORDER'/);
  assert.match(page, /const snapshot = customerFacingDescription\(line, sourceType\)/);
  assert.match(page, /<h3>\{snapshot \?\? line\.serviceName\}<\/h3>/);
});

test('snapshot-backed Additional Services lines suppress technical route and identity detail fields', () => {
  for (const key of [
    'route',
    'origin',
    'destination',
    'tourName',
    'eventName',
    'venueOrCity',
  ]) {
    assert.match(page, new RegExp(`'${key}'`));
  }
  assert.match(page, /const summary = snapshot \? null : description\.summary/);
  assert.match(page, /!snapshot && line\.serviceCode !== 'BAGGAGE'/);
});

test('historical and non-Additional Service lines retain the existing formatter path', () => {
  assert.match(page, /: description\.attributes;/);
  assert.match(page, /snapshot \?\? line\.serviceName/);
  assert.match(page, /sourceType=\{order\.sourceType\}/);
});

test('existing internal financial, tax, status, and commercial-notes rendering remains present', () => {
  assert.match(page, /Notas comerciales/);
  assert.match(page, /Subtotal/);
  assert.match(page, /IVA/);
  assert.match(page, /TOTAL/);
  assert.match(page, /Creada/);
  assert.doesNotMatch(page, /supplierName|supplierCost|supplierCostUrl|costEvidence/i);
});

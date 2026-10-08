import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/app/fiscal-billing/sales-orders/[salesOrderId]/preparation/page.tsx', import.meta.url),
  'utf8',
);

test('fiscal preparation communicates and validates that Tiquete electrónico is cash-only', () => {
  assert.match(source, /documentType === '04' && preparation\.paymentCondition\.type !== 'CASH'/);
  assert.match(source, /El Tiquete electrónico solo está disponible para ventas de contado\./);
  assert.match(source, /disabled=\{choice\.code === '04' && preparation\.paymentCondition\.type !== 'CASH'\}/);
  assert.match(source, /El Tiquete electrónico está disponible únicamente para ventas de contado\./);
});

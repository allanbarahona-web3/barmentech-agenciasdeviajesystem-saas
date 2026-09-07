import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const statementSource = readFileSync(
  new URL('../src/app/finance/accounts-receivable/customer-account-statement.tsx', import.meta.url),
  'utf8',
);
const receivableGroupsSource = readFileSync(
  new URL('../src/app/finance/accounts-receivable/receivable-groups.tsx', import.meta.url),
  'utf8',
);
const financeApiSource = readFileSync(
  new URL('../src/lib/finance-api.ts', import.meta.url),
  'utf8',
);

test('the canonical customer statement keeps the Cartera entry point and its PDF/email actions', () => {
  assert.match(receivableGroupsSource, /Estado de cuenta/);
  assert.match(statementSource, /getCustomerAccountStatement/);
  assert.match(statementSource, /downloadCustomerAccountStatement/);
  assert.match(statementSource, /sendCustomerAccountStatement/);
  assert.match(statementSource, /Descargar PDF/);
  assert.match(statementSource, /Enviar por correo/);
});

test('the statement renders generic charges and Contract payment/allocation labels from backend values', () => {
  assert.match(financeApiSource, /charges: Array/);
  assert.match(financeApiSource, /CONTRACT_OBLIGATION/);
  assert.match(statementSource, /statement\.charges\.map/);
  assert.match(statementSource, /Total cargos/);
  assert.match(statementSource, /Cargos: facturas y contratos/);
  assert.match(statementSource, /allocation\.purposeLabel/);
  assert.match(statementSource, /payment\.purposeLabel/);
  assert.match(statementSource, /allocation\.reference/);
  assert.match(statementSource, /statement\.totals\.outstandingAmount/);
});

test('the statement remains a Finance economic view rather than adding fiscal-document actions', () => {
  assert.doesNotMatch(statementSource, /BillingDocument|Hacienda|Emitir factura|Ver factura|Crear NC/);
  assert.match(statementSource, /formatFinanceMoney\(charge\.originalAmount/);
  assert.match(statementSource, /formatFinanceMoney\(charge\.allocatedAmount/);
  assert.match(statementSource, /formatFinanceMoney\(charge\.outstandingAmount/);
});

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
const statementTemplateSource = readFileSync(
  new URL('../../backend/src/finance/customer-account-statement.template.ts', import.meta.url),
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
  assert.match(statementSource, /newestFirst\(statement\.charges, \(charge\) => charge\.recognizedAt\)/);
  assert.match(statementSource, /charges\.map/);
  assert.match(statementSource, /Total cargos/);
  assert.match(statementSource, /Cargos: facturas y contratos/);
  assert.match(statementSource, /allocation\.purposeLabel/);
  assert.match(statementSource, /payment\.purposeLabel/);
  assert.match(statementSource, /allocation\.reference/);
  assert.match(statementSource, /statement\.totals\.outstandingAmount/);
});

test('screen charge allocation histories are collapsed by default and reuse canonical allocation metadata', () => {
  assert.match(financeApiSource, /sourceType: 'ACCOUNT_RECEIVABLE' \| 'CONTRACT_OBLIGATION'/);
  assert.match(statementSource, /charge\.allocations\.length \? <details className=\{styles\.statementChargeAllocations\}>/);
  assert.match(statementSource, /Ver recibos acreditados/);
  assert.match(statementSource, /allocation\.receiptNumber/);
  assert.match(statementSource, /allocation\.purposeLabel/);
  assert.match(statementSource, /allocation\.allocatedAt/);
  assert.doesNotMatch(statementSource, /<details[^>]*\sopen/);
});

test('charges without allocations omit the accordion while all financial summary values remain visible', () => {
  assert.match(statementSource, /charge\.allocations\.length \? <details[\s\S]* : null/);
  assert.match(statementSource, /charge\.reference/);
  assert.match(statementSource, /charge\.recognizedAt/);
  assert.match(statementSource, /charge\.dueDate/);
  assert.match(statementSource, /charge\.originalAmount/);
  assert.match(statementSource, /charge\.allocatedAmount/);
  assert.match(statementSource, /charge\.outstandingAmount/);
});

test('screen statement rows and allocation histories are presented newest to oldest', () => {
  assert.match(statementSource, /newestFirst\(statement\.charges, \(charge\) => charge\.recognizedAt\)/);
  assert.match(statementSource, /newestFirst\(statement\.payments, \(payment\) => payment\.receivedAt\)/);
  assert.match(statementSource, /newestFirst\(charge\.allocations, \(allocation\) => allocation\.allocatedAt\)/);
  assert.match(statementSource, /newestFirst\(payment\.allocations, \(allocation\) => allocation\.allocatedAt\)/);
  assert.match(statementSource, /statement\.totals\.invoicedAmount/);
  assert.match(statementSource, /statement\.totals\.allocatedAmount/);
  assert.match(statementSource, /statement\.totals\.outstandingAmount/);
  assert.match(statementSource, /statement\.totals\.availableAmount/);
});

test('payment destinations keep their values and use the Acreditado a label', () => {
  assert.match(statementSource, /<th>Acreditado a<\/th>/);
  assert.match(statementSource, /allocation\.reference/);
  assert.match(statementSource, /payment\.purposeLabel/);
});

test('PDF and email continue using the fully expanded canonical statement rendering without per-charge requests', () => {
  assert.match(statementTemplateSource, /charge\.allocations\.length \?/);
  assert.match(statementTemplateSource, /charge\.allocations\.map/);
  assert.match(statementTemplateSource, /payment\.allocations\.map/);
  assert.doesNotMatch(statementTemplateSource, /<details/);
  assert.doesNotMatch(statementSource, /getContractCommercialObligation|listContractPayments|listAccountReceivable/);
  assert.match(statementSource, /getCustomerAccountStatement\(group\.customerId, group\.currencyCode/);
});

test('the statement remains a Finance economic view rather than adding fiscal-document actions', () => {
  assert.doesNotMatch(statementSource, /BillingDocument|Hacienda|Emitir factura|Ver factura|Crear NC/);
  assert.match(statementSource, /formatFinanceMoney\(charge\.originalAmount/);
  assert.match(statementSource, /formatFinanceMoney\(charge\.allocatedAmount/);
  assert.match(statementSource, /formatFinanceMoney\(charge\.outstandingAmount/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const historySource = readFileSync(
  new URL('../src/app/history/page.tsx', import.meta.url),
  'utf8',
);
const statementSource = readFileSync(
  new URL('../src/app/finance/accounts-receivable/customer-account-statement.tsx', import.meta.url),
  'utf8',
);
const financeApiSource = readFileSync(
  new URL('../src/lib/finance-api.ts', import.meta.url),
  'utf8',
);

test('Contract History removes only the temporary Finanzas action and its panel wiring', () => {
  assert.doesNotMatch(historySource, /ContractFinancePanel|contract-finance-panel|financeContract|canOpenContractFinance|>\s*Finanzas\s*</);
});

test('Contract History removes the Estado de cuenta row action', () => {
  assert.doesNotMatch(historySource, /Estado de cuenta/);
  assert.doesNotMatch(historySource, /\/billing\/\$\{encodeURIComponent\(item\.id\)\}/);
});

test('Contract History retains Contract, Expediente, Documentos, and signing actions', () => {
  assert.match(historySource, /:\s*"Contrato"/);
  assert.match(historySource, /📦 Expediente/);
  assert.match(historySource, /:\s*"Documentos"/);
  assert.match(historySource, /Reenviar firmado/);
  assert.match(historySource, /Enviar a Firmar/);
  assert.match(historySource, /onResendSigned\(item\.id\)/);
  assert.match(historySource, /onSendSigningLinks\(item\.id\)/);
});

test('shared Finance customer statement capability remains available outside History', () => {
  assert.match(statementSource, /export function CustomerAccountStatementModal/);
  assert.match(statementSource, /downloadCustomerAccountStatement/);
  assert.match(statementSource, /sendCustomerAccountStatement/);
  assert.match(financeApiSource, /export function getCustomerAccountStatement/);
  assert.match(financeApiSource, /export async function downloadCustomerAccountStatement/);
  assert.match(financeApiSource, /export function sendCustomerAccountStatement/);
});

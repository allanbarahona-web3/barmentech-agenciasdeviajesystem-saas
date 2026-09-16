import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const financePage = readFileSync(new URL('../src/app/finance/accounts-receivable/page.tsx', import.meta.url), 'utf8');
const exchangeRatePage = readFileSync(new URL('../src/app/admin/exchange-rate/page.tsx', import.meta.url), 'utf8');
const exchangeRateHistory = readFileSync(new URL('../src/features/exchange-rate/exchange-rate-history.tsx', import.meta.url), 'utf8');
const legacyBillingContract = readFileSync(new URL('../src/app/billing/[contractId]/page.tsx', import.meta.url), 'utf8');

test('CONTADOR gets the Finance workspace reads but no payment or allocation controls', () => {
  assert.match(financePage, /const READ_ROLES = new Set\(\['ADMIN', 'FACTURACION_COBROS', 'CONTADOR'\]\)/);
  assert.match(financePage, /const WRITE_ROLES = new Set\(\['ADMIN', 'FACTURACION_COBROS'\]\)/);
  assert.match(financePage, /<PaymentsView/);
  assert.match(financePage, /<ContractObligationGroupsView canWrite=\{canWrite\}/);
  assert.match(financePage, /<ElectronicInvoicesView \/>/);
});

test('CONTADOR exchange-rate view is readonly while history download remains available', () => {
  assert.match(exchangeRatePage, /const canEdit = role === "ADMIN"/);
  assert.match(exchangeRatePage, /const canEmailHistory = role === "ADMIN" \|\| role === "FACTURACION_COBROS"/);
  assert.match(exchangeRatePage, /canEmail=\{canEmailHistory\}/);
  assert.match(exchangeRatePage, /canEdit && exchangeRateSource === "MANUAL"/);
  assert.match(exchangeRateHistory, /canEmail: boolean/);
  assert.match(exchangeRateHistory, /\{canEmail \? <Button/);
  assert.match(exchangeRateHistory, /onExportPdf/);
});

test('legacy contract-account actions also hide Finance mutations for CONTADOR', () => {
  assert.match(legacyBillingContract, /const canOperate = role !== "CONTADOR"/);
  assert.match(legacyBillingContract, /\{canOperate \? <button[^]*Generar abono/);
  assert.match(legacyBillingContract, /\{canOperate && modalMode !== "NONE"/);
  assert.match(legacyBillingContract, /if \(!canOperate\) return;/);
});

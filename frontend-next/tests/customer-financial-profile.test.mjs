import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profileSource = readFileSync(
  new URL('../src/app/admin/customers/[id]/page.tsx', import.meta.url),
  'utf8',
);
const financeApiSource = readFileSync(
  new URL('../src/lib/finance-api.ts', import.meta.url),
  'utf8',
);
const drawerSource = readFileSync(
  new URL('../src/features/contracts-finance/contract-finance-drawer.tsx', import.meta.url),
  'utf8',
);
const financeContractsSource = readFileSync(
  new URL('../src/app/finance/accounts-receivable/contract-obligation-groups.tsx', import.meta.url),
  'utf8',
);

test('Customer Profile reads the Finance customer summary and does not render legacy profile totals', () => {
  assert.match(profileSource, /getCustomerFinancialSummary\(customerId, controller\.signal\)/);
  assert.match(financeApiSource, /export function getCustomerFinancialSummary/);
  assert.match(financeApiSource, /\/finance\/customers\/\$\{encodeURIComponent\(customerId\)\}\/financial-summary/);
  assert.doesNotMatch(profileSource, /profile\.financialSummary/);
  assert.doesNotMatch(profileSource, /totalContractedAmount|totalInvoicedAmount|totalPaidAmount|outstandingBalance|availableCredit/);
});

test('Customer Profile keeps currencies separate and formats Finance decimal strings directly', () => {
  assert.match(profileSource, /financialSummary\.currencies\.length > 1/);
  assert.match(profileSource, /id="customer-financial-currency"/);
  assert.match(profileSource, /setSelectedFinancialCurrency\(event\.target\.value\)/);
  assert.match(profileSource, /totalContracted/);
  assert.match(profileSource, /totalInvoiced/);
  assert.match(profileSource, /totalPaid/);
  assert.match(profileSource, /outstanding/);
  assert.match(profileSource, /available/);
  assert.match(profileSource, /formatFinanceMoney\(value, selectedCurrencySummary\.currencyCode\)/);
});

test('Customer Profile gives the Finance summary an isolated loading, empty, and error state', () => {
  assert.match(profileSource, /Cargando resumen financiero/);
  assert.match(profileSource, /No hay actividad financiera para este cliente/);
  assert.match(profileSource, /No se pudo cargar el resumen financiero/);
  assert.match(profileSource, /setFinancialSummaryError/);
});

test('Estado de cuenta opens the canonical customer-and-currency statement modal', () => {
  assert.match(profileSource, /import \{ CustomerAccountStatementModal \}/);
  assert.match(profileSource, /Estado de cuenta/);
  assert.match(profileSource, /setStatementCurrency\(selectedCurrencySummary\.currencyCode\)/);
  assert.match(profileSource, /<CustomerAccountStatementModal/);
  assert.match(profileSource, /customerId,/);
  assert.match(profileSource, /currencyCode: statementCurrency/);
});

test('Customer Profile opens the canonical contract financial drawer without a Billing link', () => {
  assert.match(profileSource, /import \{ ContractFinanceDrawer \}/);
  assert.match(profileSource, /Detalle financiero/);
  assert.match(profileSource, /setSelectedFinancialContract\(contract\)/);
  assert.match(profileSource, /<ContractFinanceDrawer/);
  assert.doesNotMatch(profileSource, /Open Account|\/billing\//);
  assert.doesNotMatch(profileSource, /getContractCommercialObligation|listContractPayments/);
  assert.match(drawerSource, /getContractCommercialObligation\(contract\.contractId/);
  assert.match(drawerSource, /listContractPayments\(contract\.contractId/);
});

test('the shared drawer returns to the mounted Customer Profile only in Profile context', () => {
  assert.match(profileSource, /onReturnToCustomer=\{\(\) => setSelectedFinancialContract\(null\)\}/);
  assert.match(drawerSource, /Volver al cliente/);
  assert.doesNotMatch(financeContractsSource, /onReturnToCustomer=/);
});

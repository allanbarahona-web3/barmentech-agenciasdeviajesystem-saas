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
const financeReceivablesSource = readFileSync(
  new URL('../src/app/finance/accounts-receivable/page.tsx', import.meta.url),
  'utf8',
);
const financialSection = profileSource.slice(
  profileSource.indexOf('Resumen financiero'),
  profileSource.indexOf('/* Notas Operativas Section'),
);

test('Customer Profile reads the Finance customer summary and does not render legacy profile totals', () => {
  assert.match(profileSource, /getCustomerFinancialSummary\(customerId, controller\.signal\)/);
  assert.match(financeApiSource, /export function getCustomerFinancialSummary/);
  assert.match(financeApiSource, /\/finance\/customers\/\$\{encodeURIComponent\(customerId\)\}\/financial-summary/);
  assert.doesNotMatch(profileSource, /profile\.financialSummary/);
  assert.doesNotMatch(profileSource, /totalContractedAmount|totalInvoicedAmount|totalPaidAmount|outstandingBalance|availableCredit/);
});

test('Customer Profile presents the backend consolidated base-currency value without frontend FX arithmetic', () => {
  assert.match(financeApiSource, /baseCurrencyCode: FinanceCurrency/);
  assert.match(financeApiSource, /consolidated: \{/);
  assert.match(profileSource, /financialSummary\.consolidated\?\.\[key\]/);
  assert.match(profileSource, /formatFinanceMoneyDisplay\(primaryValue, primaryCurrency\)/);
  assert.doesNotMatch(financialSection, /parseFloat|Number\(|\.reduce\(/);
});

test('Customer Profile keeps every original currency visible beneath a multi-currency consolidated value', () => {
  assert.match(profileSource, /hasMultipleFinancialCurrencies/);
  assert.match(profileSource, /financialSummary\.currencies\.map\(\(currency\) => formatFinanceMoneyDisplay\(currency\[key\], currency\.currencyCode\)\)/);
  assert.doesNotMatch(profileSource, /id="customer-financial-currency"/);
  assert.doesNotMatch(profileSource, /setSelectedFinancialCurrency/);
  assert.match(profileSource, /totalContracted/);
  assert.match(profileSource, /totalInvoiced/);
  assert.match(profileSource, /totalPaid/);
  assert.match(profileSource, /outstanding/);
  assert.match(profileSource, /available/);
  assert.match(profileSource, /!hasMultipleFinancialCurrencies \? singleCurrency\?\.\[key\] : null/);
});

test('Customer Profile degrades gracefully when daily FX is missing and labels available source context', () => {
  assert.match(profileSource, /Tipo de cambio del día no disponible/);
  assert.match(profileSource, /financialSummary\.consolidated === null/);
  assert.match(profileSource, /Consolidado con TC \{financialSummary\.exchangeRateContext\.source\}/);
  assert.match(profileSource, /formatBusinessDate\(financialSummary\.exchangeRateContext\.effectiveDate\)/);
  assert.match(financeApiSource, /source: 'MANUAL' \| 'BCCR'/);
});

test('Customer Profile gives the Finance summary an isolated loading, empty, and error state', () => {
  assert.match(profileSource, /Cargando resumen financiero/);
  assert.match(profileSource, /No hay actividad financiera para este cliente/);
  assert.match(profileSource, /No se pudo cargar el resumen financiero/);
  assert.match(profileSource, /setFinancialSummaryError/);
});

test('Estado de cuenta opens directly for one currency and asks for currency when there are several', () => {
  assert.match(profileSource, /import \{ CustomerAccountStatementModal \}/);
  assert.match(profileSource, /Estado de cuenta/);
  assert.match(profileSource, /financialSummary\.currencies\.length === 1\) setStatementCurrency\(financialSummary\.currencies\[0\]\.currencyCode\)/);
  assert.match(profileSource, /setStatementCurrencyPickerOpen\(true\)/);
  assert.match(profileSource, /Seleccione la moneda para consultar el estado de cuenta/);
  assert.match(profileSource, /setStatementCurrency\(currency\.currencyCode\)/);
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

test('Customer Profile lists only the customer-scoped accepted electronic-invoice read', () => {
  assert.match(profileSource, /listCustomerElectronicInvoices\(customerId, \{ page: electronicInvoicesPage, pageSize: 25 \}, controller\.signal\)/);
  assert.match(financeApiSource, /export function listCustomerElectronicInvoices/);
  assert.match(financeApiSource, /\/finance\/customers\/\$\{encodeURIComponent\(customerId\)\}\/electronic-invoices/);
  assert.match(profileSource, /Facturas electrónicas/);
  assert.match(financeApiSource, /taxAuthorityStatus: 'ACCEPTED'/);
});

test('Customer Profile keeps invoice financial status in the Finance read model', () => {
  assert.match(financeApiSource, /CustomerElectronicInvoiceFinancialStatus/);
  assert.match(profileSource, /invoice\.financialStatus/);
  assert.match(profileSource, /Pendiente/);
  assert.match(profileSource, /Abonada/);
  assert.match(profileSource, /Pagada/);
  assert.match(profileSource, /financialOutstanding/);
  assert.doesNotMatch(profileSource, /invoice\.total\s*[-+*/]/);
});

test('Total facturas targets the separate electronic-invoice section', () => {
  assert.match(profileSource, /label: 'Total facturas'/);
  assert.match(profileSource, /value: electronicInvoices\?\.total \?\? 0/);
  assert.match(profileSource, /scrollToSection\(electronicInvoicesRef\)/);
  assert.match(profileSource, /ref=\{electronicInvoicesRef\}/);
});

test('invoice actions reuse the accepted-invoice route and canonical Finance detail', () => {
  assert.match(profileSource, /\/fiscal-billing\/invoices\/\$\{encodeURIComponent\(invoice\.billingDocumentId\)\}/);
  assert.match(profileSource, /\/finance\/accounts-receivable\?receivableId=/);
  assert.match(profileSource, /setSelectedFinancialContract\(contract\)/);
  assert.match(financeReceivablesSource, /new URLSearchParams\(window\.location\.search\)\.get\('receivableId'\)/);
  assert.match(financeReceivablesSource, /<ReceivableDrawer/);
  assert.doesNotMatch(profileSource, /\/billing\//);
});

test('accepted invoice viewing remains customer-scoped for AGENT while Finance detail stays canonical', () => {
  assert.match(profileSource, /\['ADMIN', 'FACTURACION_COBROS', 'AGENT'\]/);
  assert.match(profileSource, /\?customerId=\$\{encodeURIComponent\(customer\.id\)\}/);
  assert.match(profileSource, /financialDetail\?\.type === 'ACCOUNT_RECEIVABLE'/);
  assert.match(profileSource, /\['PENDING', 'PARTIALLY_PAID'\]\.includes\(invoice\.financialStatus\)/);
});

test('the canonical AR drawer keeps fiscal debt detail business-readable', () => {
  assert.match(financeReceivablesSource, /function fiscalDocumentTypeLabel/);
  assert.match(financeReceivablesSource, /Factura electrónica/);
  assert.doesNotMatch(financeReceivablesSource, /<dt>BillingDocument<\/dt>/);
  assert.doesNotMatch(financeReceivablesSource, /<dt>Tipo de origen<\/dt>/);
});

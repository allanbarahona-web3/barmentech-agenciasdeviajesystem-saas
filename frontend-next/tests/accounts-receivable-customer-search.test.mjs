import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const receivablesSource = readFileSync(new URL('../src/app/finance/accounts-receivable/receivable-groups.tsx', import.meta.url), 'utf8');
const contractsSource = readFileSync(new URL('../src/app/finance/accounts-receivable/contract-obligation-groups.tsx', import.meta.url), 'utf8');
const paymentsSource = readFileSync(new URL('../src/app/finance/accounts-receivable/payments-view.tsx', import.meta.url), 'utf8');
const invoicesSource = readFileSync(new URL('../src/app/finance/accounts-receivable/electronic-invoices-view.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/lib/finance-api.ts', import.meta.url), 'utf8');

for (const [name, source, endpoint, inputId] of [
  ['Cartera', receivablesSource, 'listAccountReceivableGroups', 'receivable-customer-search'],
  ['Contratos', contractsSource, 'listContractObligationGroups', 'contract-customer-search'],
]) {
  test(`${name} forwards its local customer search and resets its own page`, () => {
    assert.match(source, /const \[customerSearch, setCustomerSearch\] = useState\(''\)/);
    assert.match(source, new RegExp(`${endpoint}\\(\\{ page, pageSize: PAGE_SIZE, customerSearch: customerSearch\\.trim\\(\\) \\|\\| undefined \\}`));
    assert.match(source, new RegExp(`htmlFor="${inputId}"`));
    assert.match(source, /Cliente \/ identificación/);
    assert.match(source, /placeholder="Buscar cliente\.\.\."/);
    assert.match(source, /function updateCustomerSearch\(value: string\) \{ setCustomerSearch\(value\); setPage\(1\); \}/);
    assert.match(source, /function clearFilters\(\) \{ setCustomerSearch\(''\); setPage\(1\); \}/);
    assert.match(source, /customerSearch \? <Button[^>]*onClick=\{clearFilters\}>Limpiar filtros<\/Button> : null/);
    assert.doesNotMatch(source, /result\.(groups|items)\.filter\(/);
  });
}

test('only grouped-list API contracts expose the customer search parameter', () => {
  assert.match(apiSource, /export type GroupedCustomerSearchParams = PageParams & \{\n  customerSearch\?: string;/);
  assert.match(apiSource, /export function listAccountReceivableGroups\(\n  params: GroupedCustomerSearchParams/);
  assert.match(apiSource, /export function listContractObligationGroups\(\n  params: GroupedCustomerSearchParams/);
});

test('Recibos and Facturas electrónicas retain their existing independent customer filters', () => {
  assert.match(paymentsSource, /id="payment-customer-search"/);
  assert.match(paymentsSource, /listPayments\(\{/);
  assert.match(invoicesSource, /id="invoice-customer-search"/);
  assert.match(invoicesSource, /listElectronicInvoices\(\{/);
  assert.doesNotMatch(paymentsSource, /receivable-customer-search|contract-customer-search/);
  assert.doesNotMatch(invoicesSource, /receivable-customer-search|contract-customer-search/);
});

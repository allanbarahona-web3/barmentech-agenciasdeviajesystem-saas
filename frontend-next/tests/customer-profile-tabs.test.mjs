import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profileSource = readFileSync(new URL('../src/app/admin/customers/[id]/page.tsx', import.meta.url), 'utf8');

test('Customer Profile exposes Información and Finanzas with Información as the default', () => {
  assert.match(profileSource, /useSearchParams/);
  assert.match(profileSource, /const requestedTab = searchParams\.get\('tab'\) === 'finance' \? 'finance' : 'information'/);
  assert.match(profileSource, /useState<'information' \| 'finance'>\(requestedTab\)/);
  assert.match(profileSource, /role="tablist"/);
  assert.match(profileSource, />Información<\/button>/);
  assert.match(profileSource, />Finanzas<\/button>/);
  assert.match(profileSource, /url\.searchParams\.set\('tab', 'finance'\)/);
});

test('Información retains customer content while Finanzas owns Finance sections', () => {
  assert.match(profileSource, /Información del cliente/);
  assert.match(profileSource, /Información adicional del perfil/);
  assert.match(profileSource, /Documentos \(\{documents\.length\}\)/);
  assert.match(profileSource, /Notas del cliente/);
  assert.match(profileSource, /hidden=\{activeTab !== 'finance'\}[\s\S]{0,1000}Resumen financiero/);
  assert.match(profileSource, /hidden=\{activeTab !== 'finance'\}[\s\S]{0,18000}Contratos \(\{contracts\.length\}\)/);
  assert.match(profileSource, /Facturas electrónicas/);
  assert.match(profileSource, /<CustomerPaymentsReceipts customerId=\{customerId\} \/>/);
  assert.match(profileSource, /Estado de cuenta/);
});

test('tab switching preserves mounted reads and routes section shortcuts to the correct tab', () => {
  assert.match(profileSource, /<div hidden=\{activeTab !== 'information'\}>/);
  assert.match(profileSource, /<div hidden=\{activeTab !== 'finance'\}>/);
  assert.match(profileSource, /scrollToTabSection\('finance', contractsRef\)/);
  assert.match(profileSource, /scrollToTabSection\('finance', electronicInvoicesRef\)/);
  assert.equal((profileSource.match(/<CustomerPaymentsReceipts customerId=\{customerId\} \/>/g) ?? []).length, 1);
  assert.equal((profileSource.match(/getCustomerFinancialSummary\(customerId, controller\.signal\)/g) ?? []).length, 1);
});

test('existing customer-scoped Finance actions and AGENT boundaries remain unchanged', () => {
  assert.match(profileSource, /Registrar pago/);
  assert.match(profileSource, /Detalle financiero/);
  assert.match(profileSource, /Ver factura/);
  assert.match(profileSource, /\['ADMIN', 'FACTURACION_COBROS', 'AGENT'\]\.includes\(sessionRole\)/);
  assert.doesNotMatch(profileSource, /approvePayment|rejectPayment|issueFiscalDocument/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const viewSource = readFileSync(new URL('../src/app/finance/accounts-receivable/payments-view.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../src/app/finance/accounts-receivable/page.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/lib/finance-api.ts', import.meta.url), 'utf8');
const statusSource = readFileSync(new URL('../src/features/finance/customer-payment-status-labels.ts', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../src/app/finance/accounts-receivable/accounts-receivable.module.css', import.meta.url), 'utf8');

test('global Finance Recibos remains inside accounts receivable and is limited to Finance roles', () => {
  assert.match(pageSource, /view === 'payments' \? <PaymentsView/);
  assert.match(pageSource, /const READ_ROLES = new Set\(\['ADMIN', 'FACTURACION_COBROS', 'CONTADOR'\]\)/);
  assert.doesNotMatch(pageSource, /'AGENT'\]\);/);
  assert.match(viewSource, /<h2>\{customerFilter \? `Historial de recibos/);
  assert.match(viewSource, /: 'Recibos'\}<\/h2>/);
});

test('global Pagos uses the enhanced paginated Payments API and compact business columns', () => {
  assert.match(viewSource, /const PAGE_SIZE = 25/);
  assert.match(viewSource, /listPayments\(\{/);
  assert.match(viewSource, /page, pageSize: PAGE_SIZE/);
  assert.match(viewSource, /<TableHead>Fecha<\/TableHead><TableHead>Cliente \/ identificación<\/TableHead><TableHead>Recibido<\/TableHead><TableHead>Aplicado \/ equivalente<\/TableHead><TableHead>Estado<\/TableHead><TableHead>Aplicado a<\/TableHead><TableHead>Acciones<\/TableHead>/);
  assert.doesNotMatch(viewSource, /<TableHead>Identificación<\/TableHead>|<TableHead>Método<\/TableHead>|<TableHead>Recibo<\/TableHead>/);
  assert.match(stylesSource, /\.paymentTable \{ width: 100%; min-width: 0; table-layout: fixed; \}/);
  assert.match(stylesSource, /\.paymentTable th, \.paymentTable td \{ vertical-align: top; white-space: normal; overflow-wrap: anywhere; \}/);
  assert.match(apiSource, /export type PaymentListItem = \{/);
  assert.match(apiSource, /customerDisplayName: string/);
  assert.match(apiSource, /settlementAvailableAmount: string \| null/);
});

test('compact cells retain customer identification, payment method, and distinct currencies', () => {
  assert.match(statusSource, /PENDING_VERIFICATION: 'Pendiente de aprobación'/);
  assert.match(statusSource, /REJECTED: 'Rechazado'/);
  assert.match(statusSource, /PARTIALLY_ALLOCATED: 'Parcialmente acreditado'/);
  assert.match(statusSource, /FULLY_ALLOCATED: 'Acreditado'/);
  assert.match(viewSource, /formatCustomerPaymentStatus\(payment\.status\)/);
  assert.match(viewSource, /\{payment\.customerIdentification \?\? 'Sin identificación'\}/);
  assert.match(viewSource, /\{formatFinancePaymentMethod\(payment\.paymentMethod\)\}/);
  assert.match(viewSource, /\{formatFinanceMoney\(payment\.receivedAmount, payment\.currencyCode\)\}/);
  assert.match(viewSource, /Equivalente: \{formatFinanceMoney\(payment\.settlementAmount, payment\.settlementCurrencyCode!\)\}/);
  assert.match(viewSource, /crossCurrency \? 'Aplicado: ' : ''/);
  assert.match(viewSource, /formatFinanceMoney\(application\.amount, application\.currencyCode\)/);
  assert.match(viewSource, /Ver razón en detalle/);
});

test('only the compact filters are exposed and custom dates are conditional', () => {
  for (const field of ['dateFrom', 'dateTo', 'customerSearch', 'status', 'currency', 'paymentMethod']) {
    assert.match(viewSource, new RegExp(`${field}:`));
    assert.match(apiSource, new RegExp(`${field}\\?:`));
  }
  assert.match(viewSource, /Hoy/);
  assert.match(viewSource, /Últimos 7 días/);
  assert.match(viewSource, /Últimos 15 días/);
  assert.match(viewSource, /Último mes/);
  assert.match(viewSource, /Mes anterior/);
  assert.match(viewSource, /Personalizado/);
  assert.match(viewSource, /useTenantRegional\(\)/);
  assert.match(viewSource, /FINANCE_PAYMENT_METHOD_OPTIONS/);
  assert.match(viewSource, /datePreset === 'CUSTOM' \? <>/);
  assert.doesNotMatch(viewSource, /payment-reference|payment-receipt-number|payment-application-type/);
});

test('pagination preserves active filters and does not client-filter a full Payment dataset', () => {
  assert.match(viewSource, /setPage\(\(value\) => Math\.max\(1, value - 1\)\)/);
  assert.match(viewSource, /setPage\(\(value\) => Math\.min\(result\.totalPages, value \+ 1\)\)/);
  assert.match(viewSource, /page, pageSize: PAGE_SIZE/);
  assert.doesNotMatch(viewSource, /result\.payments\.filter\(/);
});

test('generic detail keeps evidence and receipt actions on demand while rows expose only Detail', () => {
  assert.match(viewSource, /getPayment\(paymentId\)/);
  assert.match(viewSource, /payment\.settlement/);
  assert.match(viewSource, /Razón de rechazo/);
  assert.match(viewSource, /Aplicado a/);
  assert.match(viewSource, /Factura \$\{application\.reference\}/);
  assert.match(viewSource, /Contrato \$\{application\.reference\}/);
  assert.match(viewSource, /await getReportedInvoicePaymentEvidence\(detail\.customerId, detail\.id, selectedEvidence\.id\)/);
  assert.match(viewSource, /<AttachmentViewer attachments=\{evidenceViewer\.attachments\} resolveAttachmentUrl=\{resolveEvidenceUrl\}/);
  assert.match(viewSource, /downloadPaymentReceipt\(paymentId\)/);
  assert.match(viewSource, /payment\.receiptAvailable \? <Button/);
  const tableSource = viewSource.slice(viewSource.indexOf('<Table className={styles.paymentTable}'), viewSource.indexOf('{!loading && !error && result && result.totalPages'));
  assert.match(tableSource, /'Detalle'/);
  assert.doesNotMatch(tableSource, /Comprobante|Descargar/);
  assert.match(viewSource, /<DetailFact label="Monto aplicado">/);
  assert.match(viewSource, /<DetailFact label="Saldo disponible">/);
  assert.doesNotMatch(viewSource, /allocatePayment|approvePayment|rejectPayment|cancelPayment/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profileSource = readFileSync(new URL('../src/app/admin/customers/[id]/page.tsx', import.meta.url), 'utf8');
const sectionSource = readFileSync(new URL('../src/features/finance/customer-payments-receipts.tsx', import.meta.url), 'utf8');
const statusSource = readFileSync(new URL('../src/features/finance/customer-payment-status-labels.ts', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/lib/finance-api.ts', import.meta.url), 'utf8');

test('Customer Profile mounts the readonly Pagos y recibos section', () => {
  assert.match(profileSource, /CustomerPaymentsReceipts customerId=\{customerId\}/);
  assert.match(sectionSource, /Pagos y recibos/);
  assert.match(sectionSource, /listCustomerPayments\(customerId, \{ page, pageSize: PAGE_SIZE \}/);
  assert.match(sectionSource, /const PAGE_SIZE = 25/);
  assert.match(apiSource, /export function listCustomerPayments/);
  assert.match(apiSource, /\/finance\/customers\/\$\{encodeURIComponent\(customerId\)\}\/payments/);
});

test('Payment statuses use business labels without raw enum rendering', () => {
  assert.match(statusSource, /PENDING_VERIFICATION: 'Pendiente de aprobación'/);
  assert.match(statusSource, /REJECTED: 'Rechazado'/);
  assert.match(statusSource, /RECEIVED: 'Recibido'/);
  assert.match(statusSource, /PARTIALLY_ALLOCATED: 'Parcialmente acreditado'/);
  assert.match(statusSource, /FULLY_ALLOCATED: 'Acreditado'/);
  assert.match(statusSource, /CANCELLED: 'Anulado'/);
  assert.match(sectionSource, /formatCustomerPaymentStatus\(payment\.status\)/);
});

test('Customer payment presentation keeps received, settlement, and applications distinct', () => {
  assert.match(sectionSource, /Monto recibido/);
  assert.match(sectionSource, /Equivalente de liquidación/);
  assert.match(sectionSource, /Aplicado: \{formatFinanceMoney\(application\.amount, application\.currencyCode\)\}/);
  assert.match(sectionSource, /Factura \$\{application\.reference\}/);
  assert.match(sectionSource, /Contrato \$\{application\.reference\}/);
  assert.match(sectionSource, /Razón: \{payment\.rejectionReason\}/);
  assert.doesNotMatch(sectionSource, /parseFloat|Number\(|\.reduce\(/);
});

test('Receipt downloads stay customer-scoped and terminal-action controls are not rendered', () => {
  assert.match(apiSource, /export async function downloadCustomerPaymentReceipt/);
  assert.match(apiSource, /\/finance\/customers\/\$\{encodeURIComponent\(customerId\)\}\/payments\/\$\{encodeURIComponent\(paymentId\)\}\/receipt/);
  assert.match(sectionSource, /payment\.receiptAvailable \? <Button/);
  assert.match(sectionSource, />Detalle<\/Button>/);
  assert.match(sectionSource, /payment\.receiptNumber \?\? '—'/);
  assert.doesNotMatch(sectionSource, /approvePayment|rejectPayment|allocatePayment|precheckPendingPaymentApproval/);
});

test('Loading, error, empty, and server-driven pagination states remain distinct', () => {
  assert.match(sectionSource, /Cargando pagos/);
  assert.match(sectionSource, /No se pudieron cargar los pagos/);
  assert.match(sectionSource, /No hay pagos registrados para este cliente/);
  assert.match(sectionSource, /!loading && !error && result\?\.items\.length === 0/);
  assert.match(sectionSource, /result\.totalPages > 1/);
  assert.match(sectionSource, /setPage\(\(current\) => Math\.min\(result\.totalPages, current \+ 1\)\)/);
});

test('Evidence actions use minimal list metadata and resolve signed URLs only on demand', () => {
  assert.match(sectionSource, /payment\.evidence\.length \? <Button/);
  assert.match(sectionSource, /Comprobante/);
  assert.match(sectionSource, /const selectedEvidence = payment\.evidence\[0\]/);
  assert.match(sectionSource, /await getReportedInvoicePaymentEvidence\(customerId, payment\.id, selectedEvidence\.id\)/);
  assert.match(sectionSource, /\{ url: access\.url \}/);
  assert.match(sectionSource, /getReportedInvoicePaymentEvidence\(customerId, evidenceViewer\.paymentId, attachment\.id, signal\)/);
  assert.match(sectionSource, /<AttachmentViewer attachments=\{evidenceViewer\.attachments\} resolveAttachmentUrl=\{resolveEvidenceUrl\}/);
  assert.match(apiSource, /export type CustomerPaymentEvidence/);
  assert.match(apiSource, /extractionMetadata/);
  const customerEvidenceType = apiSource.slice(apiSource.indexOf('export type CustomerPaymentEvidence'), apiSource.indexOf('export type CustomerPaymentListItem'));
  assert.doesNotMatch(customerEvidenceType, /extractionMetadata|objectKey|url/);
});

test('Payments table uses the final compact business column order', () => {
  assert.match(sectionSource, /<TableHead>Fecha<\/TableHead><TableHead>Método de pago<\/TableHead><TableHead>Nº recibo<\/TableHead><TableHead>Monto<\/TableHead><TableHead>Aplicado a<\/TableHead><TableHead>Estado<\/TableHead><TableHead>Acciones<\/TableHead>/);
  assert.match(sectionSource, /Recibido: \{formatFinanceMoney\(payment\.receivedAmount, payment\.currencyCode\)\}/);
  assert.match(sectionSource, /Equivalente: \{formatFinanceMoney\(payment\.settlementAmount, payment\.settlementCurrencyCode\)\}/);
  assert.match(sectionSource, /flex items-center gap-1\.5/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profileSource = readFileSync(new URL('../src/app/admin/customers/[id]/page.tsx', import.meta.url), 'utf8');
const intakeSource = readFileSync(new URL('../src/features/finance/customer-invoice-payment-intake-sheet.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/lib/finance-api.ts', import.meta.url), 'utf8');
const apiClientSource = readFileSync(new URL('../src/lib/api-client.ts', import.meta.url), 'utf8');

test('Customer Profile exposes one Registrar pago flow from the invoice header and eligible rows', () => {
  assert.match(profileSource, /CustomerInvoicePaymentIntakeSheet/);
  assert.match(profileSource, /openInvoicePaymentIntake\(\)/);
  assert.match(profileSource, /openInvoicePaymentIntake\(invoice\)/);
  assert.match(profileSource, /financialDetail\?\.type === 'ACCOUNT_RECEIVABLE'/);
  assert.match(profileSource, /Registrar pago/);
  assert.doesNotMatch(profileSource, /\/billing\//);
});

test('row entry preselects an invoice while the shared sheet loads only customer-scoped targets for its application currency', () => {
  assert.match(intakeSource, /preselectedInvoice/);
  assert.match(intakeSource, /preselectedReceivableId/);
  assert.match(intakeSource, /listCustomerInvoicePaymentTargets\(customerId, applicationCurrencyCode/);
  assert.match(apiSource, /payment-targets\/invoices/);
  assert.match(intakeSource, /receivedCurrencyCode: FinanceCurrency \| ''/);
  assert.match(intakeSource, /Moneda recibida/);
  assert.match(intakeSource, /Moneda de aplicación/);
});

test('the intake uses decimal-safe UI-only distribution totals and blocks an over-proposal', () => {
  assert.match(intakeSource, /BigInt\(100_000\)/);
  assert.match(intakeSource, /remainingUnits/);
  assert.match(intakeSource, /allocationsExceedPayment/);
  assert.match(intakeSource, /La propuesta no puede superar el monto disponible para aplicar/);
  assert.doesNotMatch(intakeSource, /parseFloat|Math\.round/);
});

test('AI prefill uses only the Finance extraction endpoint and remains editable/manual', () => {
  assert.match(intakeSource, /extractReportedInvoicePaymentEvidence\(customerId, file\)/);
  assert.match(intakeSource, /Puede completar el pago manualmente/);
  assert.match(intakeSource, /setForm\(\(current\)/);
  assert.match(apiSource, /reported-payments\/invoices\/evidence\/extract/);
  assert.doesNotMatch(intakeSource, /payment-verification|processReceipt|PaymentReceiptImage/);
});

test('AI extraction uses the shared blocking LoadingModal and returns to the editable form after failure', () => {
  assert.match(intakeSource, /import \{ LoadingModal \}/);
  assert.match(intakeSource, /isOpen=\{extracting\}/);
  assert.match(intakeSource, /loadingMessage="Analizando comprobante…"/);
  assert.match(intakeSource, /finally \{ setExtracting\(false\); \}/);
  assert.match(intakeSource, /Puede completar el pago manualmente/);
});

test('submission creates one pending Finance Payment before attaching selected evidence', () => {
  assert.match(intakeSource, /submitReportedInvoicePayment\(customerId/);
  assert.match(intakeSource, /attachEvidenceAndContinue\(payment\.paymentId\)/);
  assert.match(intakeSource, /attachReportedInvoicePaymentEvidence\(customerId, paymentId, evidenceFile, evidenceExtractionMetadata/);
  assert.match(intakeSource, /setPendingEvidencePaymentId\(paymentId\)/);
  assert.match(intakeSource, /Reintentar adjunto/);
  assert.match(intakeSource, /Pago enviado para verificación/);
  assert.match(apiSource, /export function submitReportedInvoicePayment/);
  assert.match(apiSource, /export function attachReportedInvoicePaymentEvidence/);
  assert.doesNotMatch(intakeSource, /allocatePayment|registerPaymentAndApply|BillingPayment|BillingReceipt/);
});

test('cross-currency proposals use the Finance settlement preview, never browser FX arithmetic', () => {
  assert.match(intakeSource, /getCustomerPaymentSettlementPreview\(customerId/);
  assert.match(apiSource, /payment-settlement-preview/);
  assert.match(intakeSource, /settlementAmount/);
  assert.match(intakeSource, /Tipo de cambio del día no disponible/);
  assert.match(intakeSource, /previewAvailable/);
  assert.doesNotMatch(intakeSource, /exchangeRate\s*[*\/]\s*/);
  assert.doesNotMatch(intakeSource, /parseFloat|Math\.round/);
});

test('FX warning state waits for complete current inputs and an explicit missing-rate response', () => {
  assert.match(intakeSource, /type FxUiState = 'not_required' \| 'insufficient_input' \| 'loading' \| 'available' \| 'unavailable' \| 'error'/);
  assert.match(intakeSource, /!fxLookupKey\n\s*\? 'insufficient_input'/);
  assert.match(intakeSource, /settlementPreviewKey !== fxLookupKey \|\| previewLoading\n\s*\? 'loading'/);
  assert.match(intakeSource, /settlementPreview\?\.status === 'MISSING'\n\s*\? 'unavailable'/);
  assert.match(intakeSource, /state === 'not_required' \|\| state === 'insufficient_input'\) return null/);
  assert.match(intakeSource, /if \(state === 'unavailable'\) return <Alert variant="warning"><AlertTitle>Tipo de cambio del día no disponible/);
  assert.doesNotMatch(intakeSource, /if \(!preview \|\| preview\.status === 'MISSING' \|\| !preview\.settlementAmount\)/);
});

test('FX-driving edits invalidate a stale result while the existing Finance lookup resolves again', () => {
  assert.match(intakeSource, /const fxLookupKey =[\s\S]{0,400}\$\{form\.amount\.trim\(\)\}:\$\{form\.paymentDate\}/);
  assert.match(intakeSource, /\$\{form\.receivedCurrencyCode\}:\$\{applicationCurrencyCode\}:/);
  assert.match(intakeSource, /setSettlementPreview\(null\); setSettlementPreviewKey\(null\); setPreviewLoading\(true\);/);
  assert.match(intakeSource, /setSettlementPreviewKey\(fxLookupKey\)/);
  assert.match(intakeSource, /settlementPreviewKey !== fxLookupKey/);
  assert.match(intakeSource, /settlementPreview\?\.status === 'AVAILABLE' && settlementPreview\.settlementAmount\n\s*\? 'available'/);
  assert.match(intakeSource, /!crossCurrency\n\s*\? 'not_required'/);
});

test('destination validation is safe, persisted with evidence, and overridden only after two confirmations', () => {
  assert.match(intakeSource, /destinationValidation/);
  assert.match(intakeSource, /Cuenta destino verificada/);
  assert.match(intakeSource, /No fue posible identificar una cuenta o SINPE destino/);
  assert.match(intakeSource, /Cuenta destino no registrada/);
  assert.match(intakeSource, /Destino ambiguo/);
  assert.match(intakeSource, /maskIdentifier\(extractionDetails\.destinationAccount\)/);
  assert.match(intakeSource, /overrideDialogStage === 'FIRST'/);
  assert.match(intakeSource, /setOverrideDialogStage\('SECOND'\)/);
  assert.match(intakeSource, /acceptReportedInvoicePaymentDestinationOverride/);
  assert.match(apiSource, /destination-override/);
  assert.match(apiSource, /extractionMetadata: JSON\.stringify/);
  assert.doesNotMatch(intakeSource, /payment-verification|processReceipt|PaymentReceiptImage/);
});

test('destination mismatch keeps the blocking dialogs but reduces duplicate inline severity to a compact status', () => {
  assert.match(intakeSource, /Cuenta destino no verificada/);
  assert.match(intakeSource, /<Badge variant="destructive"/);
  assert.match(intakeSource, /title="Cuenta destino no registrada"/);
  assert.match(intakeSource, /title="Confirmar excepción de destino"/);
  assert.doesNotMatch(intakeSource, /return <Alert variant="destructive" className="mt-3"><AlertTitle>\{inactive/);
});

test('evidence multipart preserves the browser boundary and sends only backend-valid advisory metadata', () => {
  assert.match(apiSource, /formData\.append\('file', file\)/);
  assert.match(apiSource, /formData\.append\(key, value\)/);
  assert.match(apiClientSource, /fetchOptions\.body instanceof FormData \? \{\} : \{ 'Content-Type': 'application\/json' \}/);
  assert.match(intakeSource, /optionalMetadataText\(extraction\.destinationAccount\)/);
  assert.match(intakeSource, /optionalMetadataText\(extraction\.reference\)/);
  assert.match(intakeSource, /Object\.values\(metadata\)\.some/);
  assert.match(intakeSource, /const persistedValidation = evidence\.extractionMetadata\?\.destinationValidation/);
});

test('a failed attachment retains the original payment and retry continues persisted validation without another intake', () => {
  assert.match(intakeSource, /setPendingEvidencePaymentId\(paymentId\)/);
  assert.match(intakeSource, /await attachEvidenceAndContinue\(pendingEvidencePaymentId\)/);
  assert.match(intakeSource, /if \(requiresDestinationOverride\(persistedValidation\)\)/);
  assert.match(intakeSource, /setOverrideDialogStage\('FIRST'\)/);
  assert.doesNotMatch(intakeSource, /retryEvidence[\s\S]{0,400}submitReportedInvoicePayment/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profileSource = readFileSync(new URL('../src/app/admin/customers/[id]/page.tsx', import.meta.url), 'utf8');
const intakeSource = readFileSync(new URL('../src/features/finance/customer-invoice-payment-intake-sheet.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/lib/finance-api.ts', import.meta.url), 'utf8');

test('Customer Profile exposes Registrar pago only for Contracts returned as eligible payment targets', () => {
  assert.match(profileSource, /listCustomerContractPaymentTargets/);
  assert.match(profileSource, /contractPaymentTargetByContractId\.get\(contract\.id\)/);
  assert.match(profileSource, /openContractPaymentIntake/);
  assert.match(profileSource, /Registrar pago/);
  assert.doesNotMatch(profileSource, /global.*multi-contract/i);
});

test('the shared payment sheet has a fixed readonly Contract target and no Contract-selection branch', () => {
  assert.match(intakeSource, /CustomerContractPaymentIntakeSheet/);
  assert.match(intakeSource, /contractTarget \? <section/);
  assert.match(intakeSource, /Destino fijo/);
  assert.match(intakeSource, /Contrato \{contractTarget\.contractNumber\}/);
  assert.match(intakeSource, /Saldo pendiente/);
  assert.match(intakeSource, /!contractTarget \? <div className="space-y-3">/);
  assert.doesNotMatch(intakeSource, /add another Contract|agregar otro contrato/i);
});

test('Contract intended amount is bounded by the displayed outstanding amount with decimal-safe UI validation', () => {
  assert.match(intakeSource, /contractAmountExceedsOutstanding/);
  assert.match(intakeSource, /decimalUnits\(contractTarget\.outstandingAmount\)/);
  assert.match(intakeSource, /no puede superar el saldo pendiente del contrato/);
  assert.match(intakeSource, /BigInt\(100_000\)/);
  assert.doesNotMatch(intakeSource, /parseFloat|Math\.round/);
});

test('received currency remains independent from Contract application currency and uses Finance settlement preview', () => {
  assert.match(intakeSource, /receivedCurrencyCode: FinanceCurrency \| ''/);
  assert.match(intakeSource, /contractTarget\?\.currencyCode/);
  assert.match(intakeSource, /getCustomerPaymentSettlementPreview\(customerId/);
  assert.match(apiSource, /payment-settlement-preview/);
  assert.doesNotMatch(intakeSource, /exchangeRate\s*[*\/]\s*/);
});

test('Contract intake reuses the Finance evidence, AI extraction, and destination-override flow', () => {
  assert.match(intakeSource, /extractReportedInvoicePaymentEvidence\(customerId, file\)/);
  assert.match(intakeSource, /attachReportedInvoicePaymentEvidence\(customerId, paymentId, evidenceFile/);
  assert.match(intakeSource, /await attachEvidenceAndContinue\(payment\.paymentId\)/);
  assert.match(intakeSource, /setPendingEvidencePaymentId\(paymentId\)/);
  assert.match(intakeSource, /Pago enviado para verificación con ID \$\{paymentId\}.*reintentar el adjunto sin registrar otro pago/);
  assert.match(intakeSource, /LoadingModal/);
  assert.match(intakeSource, /overrideDialogStage === 'FIRST'/);
  assert.match(intakeSource, /acceptReportedInvoicePaymentDestinationOverride/);
  assert.doesNotMatch(intakeSource, /PaymentReceiptImage/);
});

test('Contract submission sends exactly one fixed Contract and CommercialObligation, never a target array', () => {
  assert.match(intakeSource, /submitReportedContractPayment\(customerId/);
  assert.match(intakeSource, /contractId: contractTarget\.contractId, commercialObligationId: contractTarget\.commercialObligationId/);
  assert.match(intakeSource, /intendedAmount: allocations\[contractTarget\.commercialObligationId\]/);
  assert.match(apiSource, /reported-payments\/contracts/);
  assert.match(apiSource, /export type ReportedContractPaymentInput/);
  assert.doesNotMatch(intakeSource, /contractTarget[\s\S]{0,700}targets:/);
});

test('success is pending verification only and does not optimistically reduce a Contract balance', () => {
  assert.match(profileSource, /Pago enviado a verificación/);
  assert.match(profileSource, /El saldo se actualizará cuando Administración o Facturación valide el pago/);
  assert.match(profileSource, /listCustomerContractPaymentTargets\(customerId, currencyCode\)/);
  assert.doesNotMatch(profileSource, /setContractPaymentTargets\([^\n]*outstandingAmount/);
});

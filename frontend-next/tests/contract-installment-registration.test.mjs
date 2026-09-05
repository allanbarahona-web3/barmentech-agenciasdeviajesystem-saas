import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildContractInstallmentRequest,
  canRegisterContractInstallments,
  CONTRACT_OBLIGATION_STATUS_LABELS,
  createContractInstallmentDeduplicationKey,
  installmentFormError,
} from '../src/features/contracts-finance/contract-installment.ts';
import { FINANCE_PAYMENT_METHOD_OPTIONS } from '../src/lib/finance-payment-methods.ts';

test('only authorized Finance roles can register Contract installments', () => {
  assert.equal(canRegisterContractInstallments('ADMIN'), true);
  assert.equal(canRegisterContractInstallments('FACTURACION_COBROS'), true);
  assert.equal(canRegisterContractInstallments('AGENT'), false);
  assert.equal(canRegisterContractInstallments('OPERACIONES'), false);
});

test('obligation statuses and Finance payment methods use Spanish shared labels', () => {
  assert.equal(CONTRACT_OBLIGATION_STATUS_LABELS.OPEN, 'Pendiente');
  assert.equal(CONTRACT_OBLIGATION_STATUS_LABELS.PARTIALLY_SETTLED, 'Parcialmente pagado');
  assert.deepEqual(
    FINANCE_PAYMENT_METHOD_OPTIONS.map(({ token, label }) => [token, label]),
    [
      ['CASH', 'Efectivo'],
      ['BANK_TRANSFER', 'Transferencia bancaria'],
      ['CARD', 'Tarjeta'],
      ['CHECK', 'Cheque'],
      ['MOBILE_TRANSFER', 'SINPE Móvil'],
      ['OTHER', 'Otro'],
    ],
  );
});

test('the installment form requires amount, payment method, received date, and respects authoritative outstanding balance', () => {
  assert.equal(installmentFormError({ amount: '', paymentMethod: 'CASH', receivedAt: '2026-09-05T10:00', outstandingAmount: '1000' }), 'Indique un monto de abono mayor que cero.');
  assert.equal(installmentFormError({ amount: '25', paymentMethod: '', receivedAt: '2026-09-05T10:00', outstandingAmount: '1000' }), 'Seleccione un método de pago.');
  assert.equal(installmentFormError({ amount: '25', paymentMethod: 'CARD', receivedAt: '', outstandingAmount: '1000' }), 'Indique una fecha de recepción válida.');
  assert.equal(installmentFormError({ amount: '1000.01', paymentMethod: 'CARD', receivedAt: '2026-09-05T10:00', outstandingAmount: '1000' }), 'El abono no puede superar el saldo pendiente.');
  assert.equal(installmentFormError({ amount: '1000.00', paymentMethod: 'CARD', receivedAt: '2026-09-05T10:00', outstandingAmount: '1000' }), null);
});

test('installment requests contain only client-authorized fields', () => {
  const request = buildContractInstallmentRequest({
    registrationDeduplicationKey: 'contract-installment-test-key',
    amount: '400.00',
    receivedAt: '2026-09-05T10:00',
    paymentMethod: 'BANK_TRANSFER',
    externalReference: ' TRX-100 ',
    description: ' Abono de septiembre ',
  });

  assert.deepEqual(Object.keys(request).sort(), [
    'amount',
    'description',
    'externalReference',
    'paymentMethod',
    'receivedAt',
    'registrationDeduplicationKey',
  ]);
  assert.equal(request.amount, '400.00');
  assert.equal(request.externalReference, 'TRX-100');
  assert.equal(request.description, 'Abono de septiembre');
  assert.equal('customerId' in request, false);
  assert.equal('currencyCode' in request, false);
  assert.equal('purpose' in request, false);
  assert.equal('obligationId' in request, false);
});

test('a retry retains one idempotency key and a new registration creates a fresh key', () => {
  const retryKey = createContractInstallmentDeduplicationKey();
  const retryOne = buildContractInstallmentRequest({ registrationDeduplicationKey: retryKey, amount: '10', receivedAt: '2026-09-05T10:00', paymentMethod: 'CASH', externalReference: '', description: '' });
  const retryTwo = buildContractInstallmentRequest({ registrationDeduplicationKey: retryKey, amount: '10', receivedAt: '2026-09-05T10:00', paymentMethod: 'CASH', externalReference: '', description: '' });
  const nextKey = createContractInstallmentDeduplicationKey();

  assert.equal(retryOne.registrationDeduplicationKey, retryTwo.registrationDeduplicationKey);
  assert.notEqual(nextKey, retryKey);
});

test('Contract Finance panel reads the obligation, refetches after success, reuses receipt download, and does not add uploads or Billing fields', () => {
  const source = readFileSync(
    new URL('../src/features/contracts-finance/contract-finance-panel.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /getContractCommercialObligation\(contractId/);
  assert.match(source, /await refreshObligation\(\)/);
  assert.match(source, /downloadPaymentReceipt\(success\.payment\.id\)/);
  assert.match(source, /FINANCE_PAYMENT_METHOD_OPTIONS/);
  assert.match(source, /Abono registrado correctamente\./);
  assert.doesNotMatch(source, /type=["']file["']/);
  assert.doesNotMatch(source, /BillingDocument|Hacienda|fiscal/i);
});

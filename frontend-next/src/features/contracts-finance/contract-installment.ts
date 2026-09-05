import type { FinancePaymentMethod } from '@/lib/finance-payment-methods';
import type { RegisterContractInstallmentInput } from '@/lib/finance-api';

export const CONTRACT_INSTALLMENT_REGISTRATION_ROLES = ['ADMIN', 'FACTURACION_COBROS'] as const;

export const CONTRACT_OBLIGATION_STATUS_LABELS = {
  OPEN: 'Pendiente',
  PARTIALLY_SETTLED: 'Parcialmente pagado',
  SETTLED: 'Pagado',
  CANCELLED: 'Cancelado',
} as const;

const DECIMAL_TEXT = /^\d+(?:\.\d+)?$/;

export function canRegisterContractInstallments(role: unknown): boolean {
  return CONTRACT_INSTALLMENT_REGISTRATION_ROLES.includes(
    String(role || '').toUpperCase() as (typeof CONTRACT_INSTALLMENT_REGISTRATION_ROLES)[number],
  );
}

export function createContractInstallmentDeduplicationKey(): string {
  return `contract-installment-${crypto.randomUUID()}`;
}

export function installmentFormError(input: {
  amount: string;
  paymentMethod: FinancePaymentMethod | '';
  receivedAt: string;
  outstandingAmount: string;
}): string | null {
  if (!DECIMAL_TEXT.test(input.amount.trim()) || !isPositiveDecimal(input.amount)) {
    return 'Indique un monto de abono mayor que cero.';
  }
  if (!input.paymentMethod) return 'Seleccione un método de pago.';
  if (!input.receivedAt || Number.isNaN(new Date(input.receivedAt).getTime())) {
    return 'Indique una fecha de recepción válida.';
  }
  if (comparePositiveDecimals(input.amount, input.outstandingAmount) > 0) {
    return 'El abono no puede superar el saldo pendiente.';
  }
  return null;
}

export function buildContractInstallmentRequest(input: {
  registrationDeduplicationKey: string;
  amount: string;
  receivedAt: string;
  paymentMethod: FinancePaymentMethod;
  externalReference: string;
  description: string;
}): RegisterContractInstallmentInput {
  return {
    registrationDeduplicationKey: input.registrationDeduplicationKey,
    amount: input.amount.trim(),
    receivedAt: new Date(input.receivedAt).toISOString(),
    paymentMethod: input.paymentMethod,
    ...(input.externalReference.trim() ? { externalReference: input.externalReference.trim() } : {}),
    ...(input.description.trim() ? { description: input.description.trim() } : {}),
  };
}

function isPositiveDecimal(value: string): boolean {
  return comparePositiveDecimals(value, '0') > 0;
}

function comparePositiveDecimals(left: string, right: string): number {
  const [leftWhole, leftFraction = ''] = left.trim().split('.');
  const [rightWhole, rightFraction = ''] = right.trim().split('.');
  const wholeComparison = BigInt(leftWhole || '0') < BigInt(rightWhole || '0')
    ? -1
    : BigInt(leftWhole || '0') > BigInt(rightWhole || '0') ? 1 : 0;
  if (wholeComparison !== 0) return wholeComparison;
  const length = Math.max(leftFraction.length, rightFraction.length);
  const normalizedLeft = BigInt((leftFraction.padEnd(length, '0') || '0'));
  const normalizedRight = BigInt((rightFraction.padEnd(length, '0') || '0'));
  return normalizedLeft < normalizedRight ? -1 : normalizedLeft > normalizedRight ? 1 : 0;
}

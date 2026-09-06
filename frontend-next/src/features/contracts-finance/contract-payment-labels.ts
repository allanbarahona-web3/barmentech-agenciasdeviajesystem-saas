import type { ContractPaymentPurpose, ContractPaymentStatus } from '@/lib/finance-api';

export const CONTRACT_PAYMENT_PURPOSE_LABELS: Record<ContractPaymentPurpose, string> = {
  CONTRACT_RESERVATION: 'Reserva',
  CONTRACT_PAYMENT: 'Pago de contado',
  CONTRACT_INSTALLMENT: 'Abono',
};

export const CONTRACT_PAYMENT_STATUS_LABELS: Record<ContractPaymentStatus, string> = {
  PENDING_VERIFICATION: 'Pendiente de verificación',
  RECEIVED: 'Recibido',
  PARTIALLY_ALLOCATED: 'Aplicado parcialmente',
  FULLY_ALLOCATED: 'Aplicado por completo',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
};

export function formatContractPaymentPurpose(value: ContractPaymentPurpose): string {
  return CONTRACT_PAYMENT_PURPOSE_LABELS[value];
}

export function formatContractPaymentStatus(value: ContractPaymentStatus): string {
  return CONTRACT_PAYMENT_STATUS_LABELS[value];
}

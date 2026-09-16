import type { CustomerPaymentStatus } from '@/lib/finance-api';

const CUSTOMER_PAYMENT_STATUS_LABELS: Record<CustomerPaymentStatus, string> = {
  PENDING_VERIFICATION: 'Pendiente de aprobación',
  REJECTED: 'Rechazado',
  RECEIVED: 'Recibido',
  PARTIALLY_ALLOCATED: 'Parcialmente acreditado',
  FULLY_ALLOCATED: 'Acreditado',
  CANCELLED: 'Anulado',
};

export function formatCustomerPaymentStatus(status: CustomerPaymentStatus): string {
  return CUSTOMER_PAYMENT_STATUS_LABELS[status];
}

export function customerPaymentStatusVariant(status: CustomerPaymentStatus): 'warning' | 'destructive' | 'info' | 'success' | 'secondary' {
  if (status === 'PENDING_VERIFICATION') return 'warning';
  if (status === 'REJECTED') return 'destructive';
  if (status === 'RECEIVED') return 'info';
  if (status === 'PARTIALLY_ALLOCATED') return 'warning';
  if (status === 'FULLY_ALLOCATED') return 'success';
  return 'secondary';
}

import type { CustomQuotationStatus, CustomQuotationTarget } from '@/lib/custom-quotations-api';

export const quotationStatusLabel = (status: CustomQuotationStatus) => ({ DRAFT: 'Borrador', ISSUED: 'Emitida', ACCEPTED: 'Aceptada', REJECTED: 'Rechazada', EXPIRED: 'Vencida', CANCELLED: 'Cancelada' })[status];
export const quotationTargetLabel = (target: CustomQuotationTarget | null) => target?.type === 'LEAD' ? 'Prospecto' : 'Cliente';
export const paymentConditionLabel = (condition: 'CASH' | 'CREDIT' | null, value?: number | null, unit?: 'DAYS' | 'MONTHS' | null) => condition === 'CASH' ? 'Contado' : condition === 'CREDIT' ? `Crédito · ${value ?? '—'} ${unit === 'MONTHS' ? 'meses' : 'días'}` : 'Sin definir';
export function hasExactlyOneQuotationTarget(leadId: string | null, customerId: string | null) { return Boolean(leadId) !== Boolean(customerId); }

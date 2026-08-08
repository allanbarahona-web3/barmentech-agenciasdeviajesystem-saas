import type { CommercialProposalStatus } from '@/lib/additional-services-orders-api';

export const COMMERCIAL_PROPOSAL_STATUS_LABELS: Record<
  CommercialProposalStatus,
  string
> = {
  DRAFT: 'Borrador',
  PDF_GENERATED: 'PDF generado',
  SENT: 'Enviada',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  EXPIRED: 'Vencida',
};

export function commercialProposalStatusLabel(
  status: CommercialProposalStatus | null,
) {
  return status ? COMMERCIAL_PROPOSAL_STATUS_LABELS[status] : 'Sin propuesta';
}

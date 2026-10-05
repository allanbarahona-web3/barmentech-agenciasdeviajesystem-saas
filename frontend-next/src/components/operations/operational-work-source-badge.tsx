import { Badge } from '@/components/ui/badge';
import { type OperationalWorkItemSourceCategory } from '@/lib/operations-api';

export function OperationalWorkSourceBadge({ sourceCategory }: { sourceCategory: OperationalWorkItemSourceCategory }) {
  if (sourceCategory === null) return null;
  const presentation = sourceCategory === 'BASE_TRIP'
    ? { label: 'Paquete contratado', variant: 'secondary' as const }
    : sourceCategory === 'ADDITIONAL_SERVICES'
      ? { label: 'Servicio adicional', variant: 'info' as const }
      : null;
  return presentation ? <Badge variant={presentation.variant} aria-label={`Origen: ${presentation.label}`}>{presentation.label}</Badge> : null;
}

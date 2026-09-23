import type { Lead } from '@/lib/leads-api';
import type { LeadCustomQuotationSummary } from '@/lib/custom-quotations-api';

export type LeadCommercialActivity = {
  id: string;
  timestamp: string;
  label: string;
  priority: number;
};

export function leadCommercialActivity(lead: Pick<Lead, 'createdAt' | 'convertedAt'>, quotations: LeadCustomQuotationSummary[]): LeadCommercialActivity[] {
  const events: LeadCommercialActivity[] = [
    { id: 'lead-created', timestamp: lead.createdAt, label: 'Prospecto creado', priority: 0 },
  ];
  if (lead.convertedAt) events.push({ id: 'lead-converted', timestamp: lead.convertedAt, label: 'Prospecto convertido a cliente', priority: 4 });

  for (const quotation of quotations) {
    events.push({ id: `${quotation.id}-created`, timestamp: quotation.createdAt, label: `${quotation.quotationNumber} creada`, priority: 0 });
    const version = quotation.latestVersion;
    if (!version) continue;
    events.push({ id: `${quotation.id}-issued-${version.id}`, timestamp: version.createdAt, label: `${quotation.quotationNumber} emitida`, priority: 1 });
    if (version.acceptedAt) events.push({ id: `${quotation.id}-accepted-${version.id}`, timestamp: version.acceptedAt, label: `${quotation.quotationNumber} aceptada`, priority: 2 });
    if (version.rejectedAt) events.push({ id: `${quotation.id}-rejected-${version.id}`, timestamp: version.rejectedAt, label: `${quotation.quotationNumber} rechazada`, priority: 3 });
  }

  return events.sort((left, right) => right.timestamp.localeCompare(left.timestamp) || right.priority - left.priority || right.id.localeCompare(left.id));
}

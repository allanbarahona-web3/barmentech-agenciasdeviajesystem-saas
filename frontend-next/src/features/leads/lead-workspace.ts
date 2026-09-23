import type { LeadStatus } from '@/lib/leads-api';

export const LEAD_WORKSPACE_ROLES = ['ADMIN', 'AGENT'] as const;

export function canAccessLeadWorkspace(role: unknown): boolean {
  return LEAD_WORKSPACE_ROLES.includes(String(role ?? '').toUpperCase() as (typeof LEAD_WORKSPACE_ROLES)[number]);
}

export function leadStatusLabel(status: LeadStatus): string {
  return status === 'CONVERTED' ? 'Convertido' : 'Abierto';
}

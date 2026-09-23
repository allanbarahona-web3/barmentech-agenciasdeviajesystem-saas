import { authenticatedFetch, getStoredToken } from './auth-api';
import { resolveApiBase } from './runtime-config';

export type LeadStatus = 'OPEN' | 'CONVERTED';

export type Lead = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  status: LeadStatus;
  convertedCustomerId: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateLeadInput = {
  fullName: string;
  email: string;
  phone?: string;
  companyName?: string;
};

export type GetLeadsParams = {
  page?: number;
  pageSize?: number;
  status?: LeadStatus;
  search?: string;
};

export type LeadListResponse = {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export const LEAD_LIST_DEFAULT_PAGE_SIZE = 20;
export const LEAD_LIST_MAX_PAGE_SIZE = 25;

export function buildLeadListQuery(params: GetLeadsParams = {}): string {
  const query = new URLSearchParams();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(
    LEAD_LIST_MAX_PAGE_SIZE,
    Math.max(1, params.pageSize ?? LEAD_LIST_DEFAULT_PAGE_SIZE),
  );

  query.set('page', String(page));
  query.set('pageSize', String(pageSize));
  if (params.status) query.set('status', params.status);
  if (params.search?.trim()) query.set('search', params.search.trim());
  return query.toString();
}

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  const response = await authenticatedFetch(`${apiBase}/leads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error('No se pudo crear el prospecto. Verifique los datos e intente nuevamente.');
  }

  return response.json();
}

export async function getLeads(params: GetLeadsParams = {}, signal?: AbortSignal): Promise<LeadListResponse> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  const response = await authenticatedFetch(`${apiBase}/leads?${buildLeadListQuery(params)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  });

  if (!response.ok) {
    throw new Error('No se pudieron cargar los prospectos. Intente nuevamente.');
  }

  return response.json();
}

export async function getLead(leadId: string, signal?: AbortSignal): Promise<Lead> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  const response = await authenticatedFetch(`${apiBase}/leads/${encodeURIComponent(leadId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  });

  if (!response.ok) {
    throw new Error('No se pudo cargar el prospecto. Intente nuevamente.');
  }

  return response.json();
}

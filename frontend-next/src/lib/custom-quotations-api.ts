import { authenticatedFetch, getStoredToken } from './auth-api';
import { resolveApiBase } from './runtime-config';

export type CustomQuotationStatus = 'DRAFT' | 'ISSUED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
export type CustomQuotationTarget = { type: 'LEAD' | 'CUSTOMER'; id: string; displayName: string; email: string | null; phone: string | null; companyName: string | null };
export type CustomQuotation = { id: string; quotationNumber: string; leadId: string | null; customerId: string | null; target: CustomQuotationTarget | null; currency: 'USD' | 'CRC'; title: string; commercialObservations: string | null; quotationValidUntil: string | null; paymentConditionType: 'CASH' | 'CREDIT' | null; paymentTermValue: number | null; paymentTermUnit: 'DAYS' | 'MONTHS' | null; status: CustomQuotationStatus; createdAt: string; updatedAt: string };
export type CustomQuotationLine = { id: string; displayOrder: number; description: string; quantity: string; commercialNote: string | null; createdAt: string; updatedAt: string };
export type CustomQuotationDetail = CustomQuotation & { lines: CustomQuotationLine[] };
export type CustomQuotationList = { items: CustomQuotation[]; total: number; page: number; pageSize: number; totalPages: number };
export type CustomQuotationInput = { leadId?: string; customerId?: string; currency: 'USD' | 'CRC'; title: string; commercialObservations?: string | null; quotationValidUntil?: string | null; paymentConditionType?: 'CASH' | 'CREDIT' | null; paymentTermValue?: number | null; paymentTermUnit?: 'DAYS' | 'MONTHS' | null };
export type CustomQuotationLineInput = { description: string; quantity?: string; commercialNote?: string | null };
export type CustomQuotationCostingProject = { costingProjectId: string; baseCurrency: 'USD' | 'CRC'; authoritativeTotalCost?: string };
export type CustomQuotationPricing = { hasCalculation: boolean; currency: 'USD' | 'CRC'; finalSellingPrice: string | null; status: string | null; stale: boolean };
export type CustomQuotationVersionLine = { id: string; displayOrder: number; description: string; quantity: string; commercialNote: string | null };
export type CustomQuotationVersion = { versionId: string; quotationId: string; quotationNumber: string; versionNumber: number; status: Exclude<CustomQuotationStatus, 'DRAFT'>; recipientFullName: string | null; recipientEmail: string | null; recipientPhone: string | null; recipientCompanyName: string | null; salesOrder: { id: string; orderNumber: string | null } | null; lines: CustomQuotationVersionLine[]; currency: 'USD' | 'CRC'; finalSellingPrice: string; quotationValidUntil: string | null; paymentConditionType: 'CASH' | 'CREDIT' | null; paymentTermValue: number | null; paymentTermUnit: 'DAYS' | 'MONTHS' | null; commercialObservations: string | null; createdAt: string; acceptedAt: string | null; rejectedAt: string | null };
export type CustomQuotationProposalDocument = { id: string; fileName: string; mimeType: string; size: number; createdAt: string; updatedAt: string; url: string; expiresInSeconds: number };
export type CustomQuotationDelivery = { documentId: string; sentTo: string };
export type CustomQuotationSalesOrderMaterialization = { salesOrderId: string; orderNumber: string | null; reusedExisting: boolean };

const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 25;
const base = () => resolveApiBase();
const headers = () => ({ Authorization: `Bearer ${getStoredToken()}`, 'Content-Type': 'application/json' });

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await authenticatedFetch(`${base()}${path}`, { ...init, headers: { ...headers(), ...init.headers } });
  if (!response.ok) throw new Error('No se pudo completar la operación de cotización. Intente nuevamente.');
  return response.json();
}

async function pricingRequest<T>(path: string, method: 'GET' | 'POST'): Promise<T> {
  const response = await authenticatedFetch(`${base()}${path}`, { method, headers: headers() });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message || 'CUSTOM_QUOTATION_PRICING_REQUEST_FAILED');
  }
  return response.json();
}

async function versionRequest<T>(path: string, method: 'GET' | 'POST'): Promise<T> {
  const response = await authenticatedFetch(`${base()}${path}`, { method, headers: headers() });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message || 'CUSTOM_QUOTATION_VERSION_REQUEST_FAILED');
  }
  return response.json();
}

export async function listCustomQuotations(params: { page?: number; pageSize?: number; status?: CustomQuotationStatus; search?: string } = {}): Promise<CustomQuotationList> {
  const query = new URLSearchParams();
  query.set('page', String(Math.max(1, params.page ?? 1)));
  query.set('pageSize', String(Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? PAGE_SIZE))));
  if (params.status) query.set('status', params.status);
  if (params.search?.trim()) query.set('search', params.search.trim());
  return request(`/custom-quotations?${query}`, { method: 'GET' });
}
export const getCustomQuotation = (id: string) => request<CustomQuotationDetail>(`/custom-quotations/${encodeURIComponent(id)}`, { method: 'GET' });
export const createCustomQuotation = (input: CustomQuotationInput) => request<CustomQuotation>('/custom-quotations', { method: 'POST', body: JSON.stringify(input) });
export const updateCustomQuotation = (id: string, input: Partial<CustomQuotationInput>) => request<CustomQuotation>(`/custom-quotations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
export const addCustomQuotationLine = (id: string, input: CustomQuotationLineInput) => request<CustomQuotationLine>(`/custom-quotations/${encodeURIComponent(id)}/lines`, { method: 'POST', body: JSON.stringify(input) });
export const updateCustomQuotationLine = (id: string, lineId: string, input: Partial<CustomQuotationLineInput>) => request<CustomQuotationLine>(`/custom-quotations/${encodeURIComponent(id)}/lines/${encodeURIComponent(lineId)}`, { method: 'PATCH', body: JSON.stringify(input) });
export const removeCustomQuotationLine = (id: string, lineId: string) => request<void>(`/custom-quotations/${encodeURIComponent(id)}/lines/${encodeURIComponent(lineId)}`, { method: 'DELETE' });
export const reorderCustomQuotationLines = (id: string, lineIds: string[]) => request<{ lineIds: string[] }>(`/custom-quotations/${encodeURIComponent(id)}/lines/reorder`, { method: 'PATCH', body: JSON.stringify({ lineIds }) });
export const resolveCustomQuotationCostingProject = (id: string) => request<CustomQuotationCostingProject>(`/custom-quotations/${encodeURIComponent(id)}/costing-project`, { method: 'POST' });
export const getCustomQuotationPricing = (id: string) => pricingRequest<CustomQuotationPricing>(`/custom-quotations/${encodeURIComponent(id)}/pricing`, 'GET');
export const calculateCustomQuotationPricing = (id: string) => pricingRequest<Omit<CustomQuotationPricing, 'hasCalculation'>>(`/custom-quotations/${encodeURIComponent(id)}/pricing/calculate`, 'POST');
export const issueCustomQuotation = (id: string) => versionRequest<{ customQuotationVersionId: string }>(`/custom-quotations/${encodeURIComponent(id)}/issue`, 'POST');
export const getLatestCustomQuotationVersion = (id: string) => versionRequest<CustomQuotationVersion>(`/custom-quotations/${encodeURIComponent(id)}/versions/latest`, 'GET');
export const getCustomQuotationVersion = (id: string, versionId: string) => versionRequest<CustomQuotationVersion>(`/custom-quotations/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`, 'GET');
export const generateCustomQuotationProposal = (id: string, versionId: string) => versionRequest<{ documentId: string }>(`/custom-quotations/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/proposal`, 'POST');
export const sendCustomQuotationProposal = (id: string, versionId: string) => versionRequest<CustomQuotationDelivery>(`/custom-quotations/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/send`, 'POST');
export const materializeCustomQuotationSalesOrder = (id: string, versionId: string) => versionRequest<CustomQuotationSalesOrderMaterialization>(`/custom-quotations/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/sales-order`, 'POST');
export async function getCustomQuotationProposal(id: string, versionId: string): Promise<CustomQuotationProposalDocument | null> {
  const response = await authenticatedFetch(`${base()}/custom-quotations/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/proposal`, { method: 'GET', headers: headers() });
  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message || 'CUSTOM_QUOTATION_PROPOSAL_REQUEST_FAILED');
  }
  return response.json();
}
export { PAGE_SIZE as CUSTOM_QUOTATION_PAGE_SIZE, MAX_PAGE_SIZE as CUSTOM_QUOTATION_MAX_PAGE_SIZE };

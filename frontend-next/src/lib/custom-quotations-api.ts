import { authenticatedFetch, getStoredToken } from './auth-api';
import { resolveApiBase } from './runtime-config';
import { apiGet, apiPost, fetchApi } from './api-client';
import type {
  CostCategory,
  CostComponent,
  CostComposition,
  CostCompositionApiAdapter,
  CostEvidence,
  CostEvidenceAccess,
  CostSupplier,
} from './cost-engine-api';

export type CustomQuotationStatus = 'DRAFT' | 'ISSUED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
export type CustomQuotationTarget = { type: 'LEAD' | 'CUSTOMER'; id: string; displayName: string; email: string | null; phone: string | null; companyName: string | null };
export type CustomQuotation = { id: string; quotationNumber: string; leadId: string | null; customerId: string | null; target: CustomQuotationTarget | null; currency: 'USD' | 'CRC'; title: string; commercialObservations: string | null; quotationValidUntil: string | null; paymentConditionType: 'CASH' | 'CREDIT' | null; paymentTermValue: number | null; paymentTermUnit: 'DAYS' | 'MONTHS' | null; status: CustomQuotationStatus; createdAt: string; updatedAt: string };
export type CustomQuotationCommercialLine = { displayOrder: number; description: string; quantity: string; commercialNote: string | null };
export type CustomQuotationDetail = CustomQuotation;
export type CustomQuotationList = { items: CustomQuotation[]; total: number; page: number; pageSize: number; totalPages: number };
export type LeadCustomQuotationSummary = {
  id: string;
  quotationNumber: string;
  title: string;
  status: CustomQuotationStatus;
  currency: 'USD' | 'CRC';
  createdAt: string;
  quotationValidUntil: string | null;
  customerId: string | null;
  latestVersion: null | {
    id: string;
    versionNumber: number;
    status: Exclude<CustomQuotationStatus, 'DRAFT'>;
    finalSellingPrice: string;
    createdAt: string;
    acceptedAt: string | null;
    rejectedAt: string | null;
    salesOrder: { id: string; orderNumber: string | null } | null;
  };
};
export type LeadCustomQuotationSummaryList = { items: LeadCustomQuotationSummary[]; total: number; page: number; pageSize: number; totalPages: number };
export type CustomQuotationInput = { leadId?: string; customerId?: string; currency: 'USD' | 'CRC'; title: string; commercialObservations?: string | null; quotationValidUntil?: string | null; paymentConditionType?: 'CASH' | 'CREDIT' | null; paymentTermValue?: number | null; paymentTermUnit?: 'DAYS' | null };
export type CustomQuotationCostingProject = { costingProjectId: string; baseCurrency: 'USD' | 'CRC'; authoritativeTotalCost?: string };
export type CustomQuotationPricing = { hasCalculation: boolean; currency: 'USD' | 'CRC'; finalSellingPrice: string | null; status: string | null; stale: boolean };
export type CustomQuotationVersionLine = { id: string; displayOrder: number; description: string; quantity: string; commercialNote: string | null };
export type CustomQuotationDeliverySummary = { sentAt: string; recipientEmail: string };
export type CustomQuotationVersion = { versionId: string; quotationId: string; quotationNumber: string; versionNumber: number; status: Exclude<CustomQuotationStatus, 'DRAFT'>; recipientFullName: string | null; recipientEmail: string | null; recipientPhone: string | null; recipientCompanyName: string | null; salesOrder: { id: string; orderNumber: string | null } | null; delivery: CustomQuotationDeliverySummary | null; lines: CustomQuotationVersionLine[]; currency: 'USD' | 'CRC'; finalSellingPrice: string; quotationValidUntil: string | null; paymentConditionType: 'CASH' | 'CREDIT' | null; paymentTermValue: number | null; paymentTermUnit: 'DAYS' | 'MONTHS' | null; commercialObservations: string | null; createdAt: string; acceptedAt: string | null; rejectedAt: string | null };
export type CustomQuotationProposalDocument = { id: string; fileName: string; mimeType: string; size: number; createdAt: string; updatedAt: string; url: string; expiresInSeconds: number; delivery: CustomQuotationDeliverySummary | null };
export type CustomQuotationDelivery = { documentId: string; sentTo: string };
export type CustomQuotationSalesOrderMaterialization = { salesOrderId: string; orderNumber: string | null; reusedExisting: boolean };

const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 25;
const base = () => resolveApiBase();
const headers = () => ({ Authorization: `Bearer ${getStoredToken()}`, 'Content-Type': 'application/json' });

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await authenticatedFetch(`${base()}${path}`, { ...init, headers: { ...headers(), ...init.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: unknown } | null;
    throw new Error(customQuotationErrorMessage(body?.message));
  }
  return response.json();
}

function customQuotationErrorMessage(message: unknown) {
  if (message === 'CUSTOM_QUOTATION_CREDIT_TERM_UNIT_INVALID') {
    return 'Para cotizaciones a crédito, el plazo debe definirse en días.';
  }
  return 'No se pudo completar la operación de cotización. Intente nuevamente.';
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
export async function getLeadCustomQuotationSummaries(leadId: string, params: { page?: number; pageSize?: number } = {}): Promise<LeadCustomQuotationSummaryList> {
  const query = new URLSearchParams();
  query.set('page', String(Math.max(1, params.page ?? 1)));
  query.set('pageSize', String(Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? PAGE_SIZE))));
  return request(`/custom-quotations/lead/${encodeURIComponent(leadId)}?${query}`, { method: 'GET' });
}
export const getCustomQuotation = (id: string) => request<CustomQuotationDetail>(`/custom-quotations/${encodeURIComponent(id)}`, { method: 'GET' });
export const getCustomQuotationCommercialLines = (id: string) => request<{ lines: CustomQuotationCommercialLine[] }>(`/custom-quotations/${encodeURIComponent(id)}/commercial-lines`, { method: 'GET' });
export const createCustomQuotation = (input: CustomQuotationInput) => request<CustomQuotation>('/custom-quotations', { method: 'POST', body: JSON.stringify(input) });
export const updateCustomQuotation = (id: string, input: Partial<CustomQuotationInput>) => request<CustomQuotation>(`/custom-quotations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
export const resolveCustomQuotationCostingProject = (id: string) => request<CustomQuotationCostingProject>(`/custom-quotations/${encodeURIComponent(id)}/costing-project`, { method: 'POST' });

export function createCustomQuotationCostEngineApi(quotationId: string): CostCompositionApiAdapter {
  const scope = `/custom-quotations/${encodeURIComponent(quotationId)}/cost-engine`;
  return {
    getComposition: () => apiGet<CostComposition>(`${scope}/composition`, { params: { page: 1, pageSize: 20 } }),
    listCategories: async () => (await apiGet<{ categories: CostCategory[] }>(`${scope}/categories`, { params: { page: 1, pageSize: 20 } })).categories,
    listSuppliers: async () => (await apiGet<{ suppliers: CostSupplier[] }>(`${scope}/suppliers`, { params: { page: 1, pageSize: 20 } })).suppliers,
    createSupplier: (input) => apiPost<CostSupplier>(`${scope}/suppliers`, input),
    createCategory: (input) => apiPost<CostCategory>(`${scope}/categories`, input),
    createComponent: (_costingProjectId, input) => apiPost<CostComponent>(`${scope}/components`, input),
    updateComponent: (costComponentId, input) => scopedCostPatch<CostComponent>(`${scope}/components/${encodeURIComponent(costComponentId)}`, input),
    updateComponentCost: (costComponentId, input) => scopedCostPatch<CostComponent>(`${scope}/components/${encodeURIComponent(costComponentId)}/cost`, input),
    archiveComponent: (costComponentId) => scopedCostPatch<CostComponent>(`${scope}/components/${encodeURIComponent(costComponentId)}/archive`, {}),
    listEvidence: (costSnapshotId) => apiGet<{ evidence: CostEvidence[] }>(`${scope}/snapshots/${encodeURIComponent(costSnapshotId)}/evidence`, { params: { page: 1, pageSize: 20 } }),
    getEvidenceAccess: (costSnapshotId, costEvidenceId) => apiGet<CostEvidenceAccess>(`${scope}/snapshots/${encodeURIComponent(costSnapshotId)}/evidence/${encodeURIComponent(costEvidenceId)}/access`),
    uploadEvidence: (costSnapshotId, file) => uploadScopedCostEvidence(`${scope}/snapshots/${encodeURIComponent(costSnapshotId)}/evidence`, file),
  };
}
export const getCustomQuotationPricing = (id: string) => pricingRequest<CustomQuotationPricing>(`/custom-quotations/${encodeURIComponent(id)}/pricing`, 'GET');
export const calculateCustomQuotationPricing = (id: string) => pricingRequest<Omit<CustomQuotationPricing, 'hasCalculation'>>(`/custom-quotations/${encodeURIComponent(id)}/pricing/calculate`, 'POST');
export const issueCustomQuotation = (id: string) => versionRequest<{ customQuotationVersionId: string }>(`/custom-quotations/${encodeURIComponent(id)}/issue`, 'POST');
export const getLatestCustomQuotationVersion = (id: string) => versionRequest<CustomQuotationVersion>(`/custom-quotations/${encodeURIComponent(id)}/versions/latest`, 'GET');
export const getCustomQuotationVersion = (id: string, versionId: string) => versionRequest<CustomQuotationVersion>(`/custom-quotations/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`, 'GET');
export const acceptCustomQuotationVersion = (id: string, versionId: string) => versionRequest<{ status: 'ACCEPTED' }>(`/custom-quotations/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/accept`, 'POST');
export const rejectCustomQuotationVersion = (id: string, versionId: string) => versionRequest<{ status: 'REJECTED' }>(`/custom-quotations/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/reject`, 'POST');
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

async function scopedCostPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetchApi(path, { method: 'PATCH', body: JSON.stringify(body) });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(payload.message || 'CUSTOM_QUOTATION_COST_ENGINE_REQUEST_FAILED');
  }
  return response.json();
}

async function uploadScopedCostEvidence(path: string, file: File): Promise<CostEvidence> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetchApi(path, { method: 'POST', body: formData });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(payload.message || 'CUSTOM_QUOTATION_COST_ENGINE_REQUEST_FAILED');
  }
  return response.json();
}

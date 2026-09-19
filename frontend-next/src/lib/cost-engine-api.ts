import { apiGet, apiPost, fetchApi } from "@/lib/api-client";

export type CostEngineSourceType = "TRAVEL_PACKAGE" | "INTERNAL_TRIP";

export type CostingProject = {
  id: string;
  displayName: string;
  baseCurrency: string;
  status: string;
};

export type CostingProjectResolution = {
  costingProject: CostingProject;
  source: { type: CostEngineSourceType; id: string };
};

export type CostCategory = {
  id: string;
  code: string;
  displayName: string;
  origin: "STANDARD" | "CUSTOM";
  isActive: boolean;
};

export type CostSupplier = {
  id: string;
  name: string;
  website: string | null;
  isActive: boolean;
};

export type CostSnapshot = {
  id: string;
  amount: string;
  currency: string;
  sourceReference: string | null;
  sourceUrl: string | null;
  reason: string | null;
};

export type CostComponent = {
  id: string;
  costingProjectId: string;
  title: string;
  description: string | null;
  detailPayload: Record<string, unknown> | null;
  detailSchemaVersion: number | null;
  quantity: string | null;
  unit: string | null;
  status: "ACTIVE" | "ARCHIVED";
  sortPosition: number;
  costCategory: Pick<CostCategory, "id" | "code" | "displayName">;
  costSupplier: Pick<CostSupplier, "id" | "name" | "website"> | null;
  currentSnapshot: CostSnapshot | null;
};

export type CostComposition = {
  project: CostingProject;
  components: CostComponent[];
  categorySubtotals: Array<{
    category: Pick<CostCategory, "id" | "code" | "displayName">;
    amount: string;
  }>;
  authoritativeTotalCost: string;
  total: number;
  page: number;
  pageSize: number;
};

export type GenericCostComponentInput = {
  costCategoryId: string;
  costSupplierId?: string | null;
  title: string;
  description?: string | null;
  quantity?: string | null;
  unit?: string | null;
  detailPayload?: Record<string, unknown> | null;
  detailSchemaVersion?: number | null;
  amount: string;
  currency: string;
  sourceReference?: string | null;
  sourceUrl?: string | null;
  reason?: string | null;
};

export const SPECIALIZED_STANDARD_CATEGORY_CODES = new Set([
  "AIRFARE",
  "BAGGAGE",
  "LODGING",
  "TRANSPORTATION",
  "TOUR",
  "INSURANCE",
  "EVENT_TICKET",
  "VISA_ASSISTANCE",
  "MEALS",
]);

export function isGenericCostCategory(category: Pick<CostCategory, "code" | "origin"> | null | undefined) {
  return !category || category.origin === "CUSTOM" || !SPECIALIZED_STANDARD_CATEGORY_CODES.has(category.code);
}

export function normalizeCustomCostCategoryCode(displayName: string) {
  const normalized = displayName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 56);
  return `CUSTOM_${normalized || "CATEGORY"}`.slice(0, 64);
}

export async function resolveTravelPackageCostingProject(travelPackageId: string) {
  return apiPost<CostingProjectResolution>(`/cost-engine/travel-packages/${encodeURIComponent(travelPackageId)}/costing-project`);
}

export async function resolveInternalTripCostingProject(internalTripId: string) {
  return apiPost<CostingProjectResolution>(`/cost-engine/internal-trips/${encodeURIComponent(internalTripId)}/costing-project`);
}

export function getCostComposition(costingProjectId: string) {
  return apiGet<CostComposition>(`/cost-engine/projects/${encodeURIComponent(costingProjectId)}`, { params: { page: 1, pageSize: 20 } });
}

export async function listCostCategories() {
  const response = await apiGet<{ categories: CostCategory[] }>("/cost-engine/categories", { params: { page: 1, pageSize: 25 } });
  return response.categories;
}

export async function listCostSuppliers() {
  const response = await apiGet<{ suppliers: CostSupplier[] }>("/cost-engine/suppliers", { params: { page: 1, pageSize: 25 } });
  return response.suppliers;
}

export function createCostSupplier(input: { name: string; website?: string | null; notes?: string | null }) {
  return apiPost<CostSupplier>("/cost-engine/suppliers", input);
}

export function createCostCategory(input: { code: string; displayName: string }) {
  return apiPost<CostCategory>("/cost-engine/categories", input);
}

export function createGenericCostComponent(costingProjectId: string, input: GenericCostComponentInput) {
  return apiPost<CostComponent>(`/cost-engine/projects/${encodeURIComponent(costingProjectId)}/components`, input);
}

export function getCostComponent(costComponentId: string) {
  return apiGet<CostComponent>(`/cost-engine/components/${encodeURIComponent(costComponentId)}`);
}

export function updateGenericCostComponent(costComponentId: string, input: Omit<GenericCostComponentInput, "amount" | "currency" | "sourceReference" | "sourceUrl" | "reason">) {
  return patch<CostComponent>(`/cost-engine/components/${encodeURIComponent(costComponentId)}`, input);
}

export function updateCostComponentCost(costComponentId: string, input: Pick<GenericCostComponentInput, "amount" | "currency" | "sourceReference" | "sourceUrl" | "reason">) {
  return patch<CostComponent>(`/cost-engine/components/${encodeURIComponent(costComponentId)}/cost`, input);
}

export function archiveCostComponent(costComponentId: string) {
  return patch<CostComponent>(`/cost-engine/components/${encodeURIComponent(costComponentId)}/archive`, {});
}

export function createCostApplicability(costComponentId: string, input: { scopeType: string; label?: string | null; startDate?: string | null; endDate?: string | null }) {
  return apiPost(`/cost-engine/components/${encodeURIComponent(costComponentId)}/applicabilities`, input);
}

export type CostEvidence = {
  id: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  uploadedAt: string;
};

export type CostEvidenceAccess = CostEvidence & { url: string };

export type AirfareDailyStatus = {
  businessDate: string;
  pendingToday: number;
  registeredToday: number;
};

export type AirfareDailyTask = {
  costComponentId: string;
  costingProjectId: string;
  sourceTravelType: CostEngineSourceType;
  sourceTravelId: string;
  travelName: string;
  startDate: string;
  endDate: string;
  title: string;
  detailPayload: Record<string, unknown> | null;
  currentSnapshot: { amount: string; currency: string | null } | null;
  baseCurrency: string;
  taskStatus: "PENDING";
};

export type AirfareDailyTaskPage = {
  tasks: AirfareDailyTask[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type RegisterAirfareDailyAuthorityInput = {
  observedAmount: string;
  sourceReference?: string | null;
  sourceUrl?: string | null;
  reason?: string | null;
};

export function getAgentAirfareDailyStatus() {
  return apiGet<AirfareDailyStatus>("/travel-costing/airfare/daily-status");
}

export function listAgentAirfareDailyTasks(page = 1, pageSize = 20) {
  return apiGet<AirfareDailyTaskPage>("/travel-costing/airfare/daily-tasks", { params: { page, pageSize } });
}

export function registerAgentAirfareDailyAuthority(costComponentId: string, input: RegisterAirfareDailyAuthorityInput) {
  return apiPost<{ authorityId: string; revisionId: string; snapshotId: string; businessDate: string }>(
    `/travel-costing/airfare/components/${encodeURIComponent(costComponentId)}/daily-authority`,
    input,
  );
}

export type AirfareHistoryItem = {
  businessDate: string;
  observedAmount: string;
  appliedAmount: string;
  kind: "AGENT_INITIAL" | "ADMIN_OVERRIDE";
  isOverride: boolean;
  actor: { userId: string; name: string };
  observedAt: string;
  createdAt: string;
  sourceReference: string | null;
  sourceUrl: string | null;
  overrideReason: string | null;
  costComponentId: string;
  costingProjectId: string;
  airfareDailyAuthorityId: string;
  appliedSnapshotId: string;
  componentTitle: string;
  route: Record<string, unknown> | null;
  revisionNumber: number;
};

export type AirfareHistoryPage = {
  history: AirfareHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AdminAirfareOverrideInput = {
  observedAmount: string;
  overrideReason: string;
  sourceReference?: string | null;
  sourceUrl?: string | null;
};

export function listAdminProjectAirfareHistory(costingProjectId: string, page = 1, pageSize = 20) {
  return apiGet<AirfareHistoryPage>(`/travel-costing/airfare/projects/${encodeURIComponent(costingProjectId)}/history`, { params: { page, pageSize } });
}

export function listAdminComponentAirfareHistory(costComponentId: string, page = 1, pageSize = 20) {
  return apiGet<AirfareHistoryPage>(`/travel-costing/airfare/components/${encodeURIComponent(costComponentId)}/history`, { params: { page, pageSize } });
}

export function overrideAdminAirfareDailyAuthority(airfareDailyAuthorityId: string, input: AdminAirfareOverrideInput) {
  return apiPost<{ authorityId: string; revisionId: string; snapshotId: string }>(
    `/travel-costing/airfare/daily-authorities/${encodeURIComponent(airfareDailyAuthorityId)}/overrides`,
    input,
  );
}

export function listCostEvidence(costSnapshotId: string) {
  return apiGet<{ evidence: CostEvidence[] }>(`/cost-engine/snapshots/${encodeURIComponent(costSnapshotId)}/evidence`, { params: { page: 1, pageSize: 20 } });
}

export async function uploadCostEvidence(costSnapshotId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetchApi(`/cost-engine/snapshots/${encodeURIComponent(costSnapshotId)}/evidence`, { method: "POST", body: formData });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload?.message === "string" ? payload.message : `API Error: ${response.statusText}`);
  }
  return response.json() as Promise<CostEvidence>;
}

export function getCostEvidenceAccess(costSnapshotId: string, costEvidenceId: string) {
  return apiGet<CostEvidenceAccess>(`/cost-engine/snapshots/${encodeURIComponent(costSnapshotId)}/evidence/${encodeURIComponent(costEvidenceId)}/access`);
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetchApi(path, { method: "PATCH", body: JSON.stringify(body) });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = typeof payload?.message === "string" ? payload.message : `API Error: ${response.statusText}`;
    throw new Error(message);
  }
  return response.json();
}

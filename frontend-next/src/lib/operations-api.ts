import { fetchApi } from './api-client';

export type OperationsTravelType = 'INTERNATIONAL' | 'MIGRATION';
export type OperationsReadinessState = 'READY' | 'AT_RISK' | 'NOT_READY' | 'NO_CRITICAL_REQUIREMENTS';

/** Operations APIs use internal error codes; UI callers must supply a safe action-specific message. */
export function operationsErrorMessage(_reason: unknown, fallback: string): string { return fallback; }

export interface OperationsTravelPackageSummary {
  travelPackageId: string;
  packageCode: string;
  name: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  status: string;
  passengerCount: number;
  operational: {
    progressPercent: number | null;
    completePassengerCount: number;
    participantCountWithRequirements: number;
    criticalPending: number;
    criticalDueSoon: number;
    readinessState: OperationsReadinessState;
  };
}

export interface PaginatedOperationsTravelPackages {
  items: OperationsTravelPackageSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface OperationalPassengerOverviewRow {
  travelPackageParticipantId: string;
  clientId: string;
  fullName: string;
  role: string;
  groups: Array<{ id: string; name: string; servicePurposeCode: string; servicePurposeName: string; color: string | null }>;
  operationalNotes: Array<{ id: string; text: string; sourceReference: string; createdAt: string }>;
  additionalServices: Array<{ sourceRef: { type: 'ADDITIONAL_SERVICE_ORDER_LINE'; id: string; lineId: string; version: number | null }; serviceCode: string; serviceName: string; commercialStatus: 'APPROVED'; soldValue: { amount: string; currency: string; scope: 'EXACT_SERVICE_LINE' }; presentation: { title: string | null; subtitle: string | null; fields: Array<{ key: string; label: string; value: string; valueType: 'TEXT' | 'DATE' }> } }>;
  requirements: Array<{ id: string; servicePurposeCode: string; servicePurposeName: string; status: string; critical: boolean; deadline: string | null; coverageStatus: 'FULFILLED' | 'PENDING' }>;
  progress: { fulfilled: number; total: number; percent: number | null; isOperationallyComplete: boolean };
  financeEligibility: { eligibility: 'ELIGIBLE' | 'BLOCKED' | 'UNKNOWN'; reason: string | null; outstandingAmount: string | null; currency: string | null; sources: Array<{ sourceId: string; eligibility: 'ELIGIBLE' | 'BLOCKED'; reason: string; outstandingAmount: string | null; currency: string | null }> };
  missingItems: Array<{ servicePurposeCode: string; servicePurposeName: string }>;
}

export interface OperationalPassengerOverviewPage {
  trip: Pick<OperationsTravelPackageSummary, 'travelPackageId' | 'packageCode' | 'name' | 'destination' | 'departureDate' | 'returnDate'>;
  items: OperationalPassengerOverviewRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type OperationalAdditionalServiceContext = { sourceRef: { type: 'ADDITIONAL_SERVICE_ORDER_LINE'; id: string; lineId: string; version: number | null }; serviceCode: string; serviceName: string; commercialStatus: 'APPROVED'; soldValue: { amount: string; currency: string; scope: 'EXACT_SERVICE_LINE' }; presentation: { title: string | null; subtitle: string | null; fields: Array<{ key: string; label: string; value: string; valueType: 'TEXT' | 'DATE' }> } };
export interface OperationalPassengerRosterRow { travelPackageParticipantId: string; clientId: string; fullName: string; role: string; groups: Array<{ id: string; name: string; servicePurposeCode: string; servicePurposeName: string; color: string | null }>; progress: { fulfilled: number; total: number; percent: number | null; isOperationallyComplete: boolean }; }
export interface OperationalPassengerRosterPage { items: OperationalPassengerRosterRow[]; total: number; page: number; pageSize: number; totalPages: number; }
export type OperationalPassengerContractRole = 'HOLDER' | 'COMPANION' | 'MINOR';
export interface OperationalPassengerContractContext {
  travelPackageParticipantId: string;
  clientId: string;
  contractId: string;
  contractNumber: string;
  sourceRole: OperationalPassengerContractRole;
  commercial: { snapshotAvailable: boolean; perPersonSellingPrice: string | null; commercialTotal: string | null; currency: string | null; frozenAt: string | null };
  responsibleAdult: { responsibleParticipantId: string; responsibleClientId: string; responsibleName: string | null } | null;
}
export interface OperationalPassengerOperationalNote {
  id: string;
  travelPackageParticipantId: string;
  text: string;
  status: 'ACTIVE';
  createdAt: string;
  archivedAt: string | null;
  sourceType: 'CONTRACT' | 'CLIENT_PROFILE';
  authorName: string | null;
  source: { type: 'CONTRACT_NOTE'; sourceId: string };
}
export interface OperationalPassengerCommercialContext {
  travelPackageParticipantId: string;
  additionalServices: OperationalAdditionalServiceContext[];
  contractContexts: OperationalPassengerContractContext[];
  operationalNotes: OperationalPassengerOperationalNote[];
}

export type OperationalRequirementStatus = 'PENDING' | 'IN_PROGRESS' | 'FULFILLED' | 'CANCELLED' | 'NOT_APPLICABLE';
export type OperationalWorkSourceCategory = 'ALL' | 'BASE_TRIP' | 'ADDITIONAL_SERVICES';
export type OperationalRequirementSourceType = 'MANUAL' | 'CONTRACT' | 'CUSTOM_QUOTATION';
export type OperationalSoldValueScope = 'EXACT_SERVICE_LINE' | 'ORDER_TOTAL' | 'QUOTATION_TOTAL' | 'CONTRACT_TOTAL' | 'PACKAGE_REFERENCE' | 'NONE';
export interface OperationalRequirementCoverage { fulfilledPassengerCount: number; totalPassengerCount: number; }
export interface OperationalRequirementSummary {
  id: string; travelPackageId: string; servicePurposeCode: string; servicePurposeName: string; description: string;
  status: OperationalRequirementStatus; critical: boolean; operationalDeadlineAt: string | null;
  assignedTo: { userId: string; name: string | null } | null;
  source: { type: OperationalRequirementSourceType; id: string | null; lineId: string | null; versionId: string | null; reference: string | null; acceptedAt: string | null; passengerGroup: { id: string | null; name: string | null; serviceCode: string | null } };
  soldValue: { amount: string | null; currency: string | null; scope: OperationalSoldValueScope };
  passengerCount: number; passengerPreview: string[]; coverage: OperationalRequirementCoverage; createdAt: string; updatedAt: string;
}
export interface OperationalRequirementDetail extends OperationalRequirementSummary {
  sourceLineId: string | null; sourceVersionId: string | null; sourceAcceptedAt: string | null;
  confirmedPassengerIds: string[];
  passengers: Array<{ travelPackageParticipantId: string; clientId: string; fullName: string; role: string }>;
}
export interface OperationalWorkItemsInput { page?: number; active?: boolean; status?: OperationalRequirementStatus; servicePurposeCode?: string; participantId?: string; passengerGroupId?: string; critical?: boolean; deadlineState?: 'OVERDUE' | 'DUE_SOON' | 'FUTURE' | 'NONE'; sourceCategory?: OperationalWorkSourceCategory; search?: string; }
export interface OperationalWorkItem { id: string; travelPackageId: string; servicePurposeCode: string; servicePurposeName: string; description: string; status: OperationalRequirementStatus; critical: boolean; operationalDeadlineAt: string | null; assignedTo: { userId: string; name: string | null } | null; passengers: { total: number; preview: Array<{ travelPackageParticipantId: string; clientId: string; fullName: string; role: string }> }; sourceGroup: { id: string | null; name: string } | null; coverage: OperationalRequirementCoverage; participantCoverageStatus: 'FULFILLED' | 'PENDING' | null; soldContext: { scope: OperationalSoldValueScope; amount: string | null; currency: string | null }; finance: { state: 'ELIGIBLE' | 'BLOCKED' | 'UNAVAILABLE'; reason: string | null }; management: { fulfillmentCount: number; confirmedFulfillmentCount: number; purchaseCount: number; evidenceCount: number }; createdAt: string; updatedAt: string; }
export interface OperationalWorkItemsPage { items: OperationalWorkItem[]; total: number; page: number; pageSize: number; totalPages: number; }
export type OperationalFulfillmentStatus = 'DRAFT' | 'RESERVED' | 'PURCHASED' | 'CONFIRMED' | 'CANCELLED';
export interface OperationalFulfillmentSummary { id: string; requirementId: string; travelPackageId: string; servicePurposeCode: string; servicePurposeName: string; providerName: string | null; reservationCode: string | null; confirmationReference: string | null; status: OperationalFulfillmentStatus; serviceStartAt: string | null; serviceEndAt: string | null; assignedTo: { userId: string; name: string | null } | null; passengerCount: number; passengerPreview: string[]; purchaseCount: number; createdAt: string; updatedAt: string; }
export interface OperationalFulfillmentDetail extends OperationalFulfillmentSummary { providerReference: string | null; voucherReference: string | null; ticketReference: string | null; detailPayload: Record<string, unknown> | null; detailVersion: number | null; confirmationNotes: string | null; passengers: Array<{ travelPackageParticipantId: string; clientId: string; fullName: string; role: string }>; }
export interface OperationalFulfillmentsPage { items: OperationalFulfillmentSummary[]; total: number; page: number; pageSize: number; totalPages: number; }
export interface FulfillmentInput { participantIds?: string[]; providerName?: string | null; providerReference?: string | null; reservationCode?: string | null; confirmationReference?: string | null; voucherReference?: string | null; ticketReference?: string | null; serviceStartAt?: string | null; serviceEndAt?: string | null; confirmationNotes?: string | null; }
export interface OperationalPurchase {
  id: string; fulfillmentId: string; travelPackageId: string; providerName: string; supplierReference: string | null;
  amount: string; currency: string; taxAmount: string | null; purchasedAt: string; supplierInvoiceNumber: string | null;
  notes: string | null; createdBy: { userId: string; name: string }; createdAt: string; updatedAt: string;
}
export interface OperationalPurchasesPage { items: OperationalPurchase[]; total: number; page: number; pageSize: number; totalPages: number; }
export interface CreateOperationalPurchaseInput { providerName: string; supplierReference?: string | null; amount: string; currency: string; taxAmount?: string | null; purchasedAt: string; supplierInvoiceNumber?: string | null; notes?: string | null; }
export interface UpdateOperationalPurchaseInput { supplierReference?: string | null; supplierInvoiceNumber?: string | null; notes?: string | null; }
export type OperationalEvidenceType = 'SUPPLIER_QUOTE' | 'BOOKING_CONFIRMATION' | 'TICKET' | 'VOUCHER' | 'SUPPLIER_INVOICE' | 'RECEIPT' | 'INSURANCE_CERTIFICATE' | 'SCREENSHOT' | 'OTHER';
export interface OperationalEvidence { id: string; travelPackageId: string; fulfillmentId: string; purchaseId: string | null; evidenceType: OperationalEvidenceType; originalFilename: string; mimeType: string; byteSize: number; contentHash: string | null; uploadedBy: { userId: string; name: string }; createdAt: string; }
export interface OperationalEvidencePage { items: OperationalEvidence[]; total: number; page: number; pageSize: number; totalPages: number; }
export interface OperationalEvidenceAccess { id: string; originalFilename: string; mimeType: string; byteSize: number; url: string; expiresInSeconds: number; }
export interface OperationalReadiness {
  overall: { totalAssignments: number; fulfilledAssignments: number; pendingAssignments: number; progressPercent: number | null; completePassengerCount: number; participantCountWithRequirements: number; totalRosterPassengerCount: number; };
  readinessState: OperationsReadinessState;
  critical: { pending: number; dueSoon: number; overdue: number };
  riskSummary: { criticalPending: number; criticalOverdue: number; criticalDueSoon: number; nonCriticalPending: number };
  services: Array<{ servicePurposeCode: string; servicePurposeName: string; totalAssignments: number; fulfilledAssignments: number; pendingAssignments: number; progressPercent: number | null }>;
  inconsistency: { fulfilledRequirementWithoutCoverageCount: number };
}
export type OperationalHeatmapStatus = 'FULFILLED' | 'IN_PROGRESS' | 'PENDING' | 'NOT_APPLICABLE' | 'NONE';
export interface OperationalPassengerMatrix { items: Array<{ travelPackageParticipantId: string; clientId: string; fullName: string; role: string; progressPercent: number | null; isOperationallyComplete: boolean; requirementCount: number; fulfilledRequirementCount: number; serviceCells: Array<{ servicePurposeCode: string; status: OperationalHeatmapStatus }> }>; total: number; page: number; pageSize: number; totalPages: number; serviceColumns: Array<{ servicePurposeCode: string; servicePurposeName: string }>; }

export async function listOperationsTravelPackages(
  travelType: OperationsTravelType,
  page = 1,
  search?: string,
): Promise<PaginatedOperationsTravelPackages> {
  const params = new URLSearchParams({ travelType, page: String(page), pageSize: '20' });
  if (search?.trim()) params.set('search', search.trim());
  const response = await fetchApi(`/operations/travel-packages/summaries?${params.toString()}`, { method: 'GET' });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API Error: ${response.statusText}`);
  }
  return response.json() as Promise<PaginatedOperationsTravelPackages>;
}

export async function getOperationalPassengerOverview(travelPackageId: string, page = 1, search?: string, passengerGroupId?: string): Promise<OperationalPassengerOverviewPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (search?.trim()) params.set('search', search.trim());
  if (passengerGroupId?.trim()) params.set('passengerGroupId', passengerGroupId.trim());
  const response = await fetchApi(`/operations/travel-packages/${encodeURIComponent(travelPackageId)}/passenger-overview?${params.toString()}`, { method: 'GET' });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.message || `API Error: ${response.statusText}`); }
  return response.json() as Promise<OperationalPassengerOverviewPage>;
}

export async function getOperationalPassengerRoster(travelPackageId: string, page = 1, search?: string): Promise<OperationalPassengerRosterPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (search?.trim()) params.set('search', search.trim());
  const response = await fetchApi(`/operations/travel-packages/${encodeURIComponent(travelPackageId)}/passenger-roster?${params.toString()}`, { method: 'GET' });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.message || `API Error: ${response.statusText}`); }
  return response.json() as Promise<OperationalPassengerRosterPage>;
}

export function getOperationalPassengerCommercialContext(travelPackageId: string, participantId: string): Promise<OperationalPassengerCommercialContext> {
  return operationsRequest(`/operations/travel-packages/${encodeURIComponent(travelPackageId)}/passengers/${encodeURIComponent(participantId)}/commercial-context`, 'GET');
}

async function operationsRequest<T>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const response = await fetchApi(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.message || `API Error: ${response.statusText}`); }
  return response.json() as Promise<T>;
}
async function operationsFormRequest<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetchApi(path, { method: 'POST', body: formData });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.message || `API Error: ${response.statusText}`); }
  return response.json() as Promise<T>;
}
function requirementsPath(travelPackageId: string, suffix = '') { return `/operations/travel-packages/${encodeURIComponent(travelPackageId)}/requirements${suffix}`; }
export function listOperationalWorkItems(travelPackageId: string, input: OperationalWorkItemsInput = {}): Promise<OperationalWorkItemsPage> { const params = new URLSearchParams({ page: String(input.page ?? 1), pageSize: '20' }); if (input.active) params.set('active', 'true'); if (input.status) params.set('status', input.status); if (input.servicePurposeCode) params.set('servicePurposeCode', input.servicePurposeCode); if (input.participantId) params.set('participantId', input.participantId); if (input.passengerGroupId) params.set('passengerGroupId', input.passengerGroupId); if (input.critical !== undefined) params.set('critical', String(input.critical)); if (input.deadlineState) params.set('deadlineState', input.deadlineState); if (input.sourceCategory) params.set('sourceCategory', input.sourceCategory); if (input.search?.trim()) params.set('search', input.search.trim()); return operationsRequest(`/operations/travel-packages/${encodeURIComponent(travelPackageId)}/work-items?${params}`, 'GET'); }
export function getOperationalRequirement(travelPackageId: string, requirementId: string): Promise<OperationalRequirementDetail> { return operationsRequest(requirementsPath(travelPackageId, `/${encodeURIComponent(requirementId)}`), 'GET'); }
function fulfillmentsPath(travelPackageId: string, requirementId: string, suffix = '') { return `${requirementsPath(travelPackageId, `/${encodeURIComponent(requirementId)}/fulfillments`)}${suffix}`; }
export function listOperationalFulfillments(travelPackageId: string, requirementId: string, page = 1): Promise<OperationalFulfillmentsPage> { return operationsRequest(`${fulfillmentsPath(travelPackageId, requirementId)}?${new URLSearchParams({ page: String(page), pageSize: '20' })}`, 'GET'); }
export function getOperationalFulfillment(travelPackageId: string, requirementId: string, fulfillmentId: string): Promise<OperationalFulfillmentDetail> { return operationsRequest(fulfillmentsPath(travelPackageId, requirementId, `/${encodeURIComponent(fulfillmentId)}`), 'GET'); }
export function createOperationalFulfillment(travelPackageId: string, requirementId: string, input: FulfillmentInput & { participantIds: string[] }): Promise<OperationalFulfillmentDetail> { return operationsRequest(fulfillmentsPath(travelPackageId, requirementId), 'POST', input); }
export function updateOperationalFulfillment(travelPackageId: string, requirementId: string, fulfillmentId: string, input: FulfillmentInput): Promise<OperationalFulfillmentDetail> { return operationsRequest(fulfillmentsPath(travelPackageId, requirementId, `/${encodeURIComponent(fulfillmentId)}`), 'PATCH', input); }
export function addOperationalFulfillmentPassengers(travelPackageId: string, requirementId: string, fulfillmentId: string, participantIds: string[]): Promise<OperationalFulfillmentDetail> { return operationsRequest(fulfillmentsPath(travelPackageId, requirementId, `/${encodeURIComponent(fulfillmentId)}/passengers`), 'POST', { participantIds }); }
export function removeOperationalFulfillmentPassengers(travelPackageId: string, requirementId: string, fulfillmentId: string, participantIds: string[]): Promise<OperationalFulfillmentDetail> { return operationsRequest(fulfillmentsPath(travelPackageId, requirementId, `/${encodeURIComponent(fulfillmentId)}/passengers`), 'DELETE', { participantIds }); }
export function transitionOperationalFulfillment(travelPackageId: string, requirementId: string, fulfillmentId: string, targetStatus: OperationalFulfillmentStatus): Promise<OperationalFulfillmentDetail> { return operationsRequest(fulfillmentsPath(travelPackageId, requirementId, `/${encodeURIComponent(fulfillmentId)}/status`), 'POST', { targetStatus }); }
function purchasesPath(travelPackageId: string, requirementId: string, fulfillmentId: string, suffix = '') { return `${fulfillmentsPath(travelPackageId, requirementId, `/${encodeURIComponent(fulfillmentId)}/purchases`)}${suffix}`; }
export function listOperationalPurchases(travelPackageId: string, requirementId: string, fulfillmentId: string, page = 1): Promise<OperationalPurchasesPage> { return operationsRequest(`${purchasesPath(travelPackageId, requirementId, fulfillmentId)}?${new URLSearchParams({ page: String(page), pageSize: '20' })}`, 'GET'); }
export function getOperationalPurchase(travelPackageId: string, requirementId: string, fulfillmentId: string, purchaseId: string): Promise<OperationalPurchase> { return operationsRequest(purchasesPath(travelPackageId, requirementId, fulfillmentId, `/${encodeURIComponent(purchaseId)}`), 'GET'); }
export function createOperationalPurchase(travelPackageId: string, requirementId: string, fulfillmentId: string, input: CreateOperationalPurchaseInput): Promise<OperationalPurchase> { return operationsRequest(purchasesPath(travelPackageId, requirementId, fulfillmentId), 'POST', input); }
export function updateOperationalPurchase(travelPackageId: string, requirementId: string, fulfillmentId: string, purchaseId: string, input: UpdateOperationalPurchaseInput): Promise<OperationalPurchase> { return operationsRequest(purchasesPath(travelPackageId, requirementId, fulfillmentId, `/${encodeURIComponent(purchaseId)}`), 'PATCH', input); }
function evidencePath(travelPackageId: string, requirementId: string, fulfillmentId: string, suffix = '') { return `${fulfillmentsPath(travelPackageId, requirementId, `/${encodeURIComponent(fulfillmentId)}/evidence`)}${suffix}`; }
export function listOperationalEvidence(travelPackageId: string, requirementId: string, fulfillmentId: string, page = 1): Promise<OperationalEvidencePage> { return operationsRequest(`${evidencePath(travelPackageId, requirementId, fulfillmentId)}?${new URLSearchParams({ page: String(page), pageSize: '20' })}`, 'GET'); }
export function uploadOperationalEvidence(travelPackageId: string, requirementId: string, fulfillmentId: string, input: { evidenceType: OperationalEvidenceType; operationalPurchaseId?: string; file: File }): Promise<OperationalEvidence> { const formData = new FormData(); formData.append('evidenceType', input.evidenceType); if (input.operationalPurchaseId) formData.append('operationalPurchaseId', input.operationalPurchaseId); formData.append('file', input.file, input.file.name); return operationsFormRequest(evidencePath(travelPackageId, requirementId, fulfillmentId), formData); }
export function getOperationalEvidenceAccess(travelPackageId: string, requirementId: string, fulfillmentId: string, evidenceId: string): Promise<OperationalEvidenceAccess> { return operationsRequest(evidencePath(travelPackageId, requirementId, fulfillmentId, `/${encodeURIComponent(evidenceId)}/access`), 'GET'); }
export function deleteOperationalEvidence(travelPackageId: string, requirementId: string, fulfillmentId: string, evidenceId: string): Promise<{ id: string; deleted: boolean }> { return operationsRequest(evidencePath(travelPackageId, requirementId, fulfillmentId, `/${encodeURIComponent(evidenceId)}`), 'DELETE'); }
export function getOperationsReadiness(travelPackageId: string): Promise<OperationalReadiness> { return operationsRequest(`/operations/travel-packages/${encodeURIComponent(travelPackageId)}/readiness`, 'GET'); }
export function getOperationsPassengerMatrix(travelPackageId: string, page = 1): Promise<OperationalPassengerMatrix> { return operationsRequest(`/operations/travel-packages/${encodeURIComponent(travelPackageId)}/passenger-matrix?${new URLSearchParams({ page: String(page), pageSize: '20' })}`, 'GET'); }

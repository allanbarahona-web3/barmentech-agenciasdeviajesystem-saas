import { fetchApi } from './api-client';

export type PassengerGroupStatus = 'ACTIVE' | 'ARCHIVED';

export interface PassengerGroupMember {
  travelPackageParticipantId: string;
  clientId: string;
  fullName: string;
}

export interface PassengerGroup {
  id: string;
  travelPackageId: string;
  additionalServiceCatalogId: string;
  serviceCode: string;
  serviceName: string;
  name: string;
  color: string | null;
  notes: string | null;
  status: PassengerGroupStatus;
  createdAt: string;
  updatedAt: string;
  members: PassengerGroupMember[];
}

export interface TravelPackageRosterParticipant {
  id: string;
  clientId: string;
  role: 'HOLDER' | 'COMPANION' | 'MINOR';
  client: { fullName: string };
}

export type GroupingTravelPackageType = 'INTERNATIONAL' | 'MIGRATION';

export interface GroupingTravelPackageSummary {
  travelPackageId: string;
  packageCode: string;
  name: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  status: string;
  passengerCount: number;
  groupedPassengerCount: number;
  ungroupedPassengerCount: number;
}

export interface PaginatedGroupingTravelPackages {
  items: GroupingTravelPackageSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SavePassengerGroupInput {
  additionalServiceCatalogId: string;
  name: string;
  color?: string | null;
  notes?: string | null;
}

function path(travelPackageId: string, suffix = ''): string {
  return `/travel-packages/${encodeURIComponent(travelPackageId)}/passenger-groups${suffix}`;
}

async function request<T>(
  requestPath: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const response = await fetchApi(requestPath, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API Error: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export function listPassengerGroups(travelPackageId: string): Promise<PassengerGroup[]> {
  return request(path(travelPackageId), 'GET');
}

export function getPassengerGroup(
  travelPackageId: string,
  groupId: string,
): Promise<PassengerGroup> {
  return request(path(travelPackageId, `/${encodeURIComponent(groupId)}`), 'GET');
}

export function createPassengerGroup(
  travelPackageId: string,
  input: SavePassengerGroupInput,
): Promise<PassengerGroup> {
  return request(path(travelPackageId), 'POST', input);
}

export function updatePassengerGroup(
  travelPackageId: string,
  groupId: string,
  input: SavePassengerGroupInput,
): Promise<PassengerGroup> {
  return request(path(travelPackageId, `/${encodeURIComponent(groupId)}`), 'PATCH', input);
}

export function archivePassengerGroup(
  travelPackageId: string,
  groupId: string,
): Promise<PassengerGroup> {
  return request(path(travelPackageId, `/${encodeURIComponent(groupId)}/archive`), 'POST');
}

export function addPassengerGroupMembers(
  travelPackageId: string,
  groupId: string,
  participantIds: string[],
): Promise<PassengerGroup> {
  return request(path(travelPackageId, `/${encodeURIComponent(groupId)}/members`), 'POST', {
    participantIds,
  });
}

export function removePassengerGroupMembers(
  travelPackageId: string,
  groupId: string,
  participantIds: string[],
): Promise<PassengerGroup> {
  return request(path(travelPackageId, `/${encodeURIComponent(groupId)}/members`), 'DELETE', {
    participantIds,
  });
}

export function getTravelPackageParticipants(
  travelPackageId: string,
): Promise<TravelPackageRosterParticipant[]> {
  return request(
    `/travel-packages/${encodeURIComponent(travelPackageId)}/participants`,
    'GET',
  );
}

export function listGroupingTravelPackages(
  travelType: GroupingTravelPackageType,
  page = 1,
  search?: string,
): Promise<PaginatedGroupingTravelPackages> {
  const params = new URLSearchParams({
    travelType,
    page: String(page),
    pageSize: '20',
  });
  if (search?.trim()) params.set('search', search.trim());
  return request(`/travel-packages/grouping-summaries?${params.toString()}`, 'GET');
}

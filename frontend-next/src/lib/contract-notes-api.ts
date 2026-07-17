// Contract Notes API Client

import { authenticatedFetch, getStoredToken } from './auth-api';
import { resolveApiBase } from './runtime-config';

export interface ContractNote {
  id: string;
  contractId: string;
  passengerType: 'HOLDER' | 'COMPANION' | 'MINOR';
  passengerIndex: number | null;
  passengerName: string;
  note: string;
  status: 'ACTIVE' | 'ARCHIVED';
  archivedAt: Date | null;
  createdByUserId: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
  contract?: {
    contractNumber: string;
    destination: string;
    startDate: Date;
    endDate: Date;
  };
}

export interface CreateContractNoteDto {
  passengerType: 'HOLDER' | 'COMPANION' | 'MINOR';
  passengerIndex?: number | null;
  passengerName: string;
  note: string;
}

export interface CreateContractNoteForCustomerDto {
  customerId: string;
  note: string;
}

export interface UpdateContractNoteDto {
  note: string;
}

async function requestContractNotes<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  if (!apiBase) {
    throw new Error('No hay API configurada.');
  }

  if (!token) {
    throw new Error('Sesion no activa.');
  }

  const response = await authenticatedFetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API Error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Create a new note for a contract passenger
 */
export async function createContractNote(
  contractId: string,
  data: CreateContractNoteDto
): Promise<ContractNote> {
  return requestContractNotes<ContractNote>(`/contracts/${contractId}/notes`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Create a new note for a customer's participation in a contract
 * Passenger identity is derived automatically
 */
export async function createContractNoteForCustomer(
  contractId: string,
  data: CreateContractNoteForCustomerDto
): Promise<ContractNote> {
  return requestContractNotes<ContractNote>(
    `/contracts/${contractId}/notes/for-customer`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

/**
 * List all notes for a contract
 */
export async function listContractNotes(
  contractId: string,
  includeArchived = false
): Promise<ContractNote[]> {
  const params = new URLSearchParams({ includeArchived: String(includeArchived) });
  return requestContractNotes<ContractNote[]>(
    `/contracts/${contractId}/notes?${params.toString()}`,
    { method: 'GET' }
  );
}

/**
 * List all operational notes for a customer (across all their contracts)
 */
export async function listCustomerOperationalNotes(
  customerId: string
): Promise<ContractNote[]> {
  return requestContractNotes<ContractNote[]>(
    `/contracts/operational-notes/customer/${customerId}`,
    { method: 'GET' }
  );
}

/**
 * Update a contract note
 */
export async function updateContractNote(
  contractId: string,
  noteId: string,
  data: UpdateContractNoteDto
): Promise<ContractNote> {
  return requestContractNotes<ContractNote>(
    `/contracts/${contractId}/notes/${noteId}`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

/**
 * Delete a contract note (admin only)
 */
export async function deleteContractNote(
  contractId: string,
  noteId: string
): Promise<{ message: string }> {
  return requestContractNotes<{ message: string }>(
    `/contracts/${contractId}/notes/${noteId}`,
    { method: 'DELETE' }
  );
}

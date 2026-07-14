// Contract Notes API Client

import { apiGet, apiPost, apiDelete } from './api-client';

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

/**
 * Create a new note for a contract passenger
 */
export async function createContractNote(
  contractId: string,
  data: CreateContractNoteDto
): Promise<ContractNote> {
  return apiPost<ContractNote>(`/contracts/${contractId}/notes`, data);
}

/**
 * Create a new note for a customer's participation in a contract
 * Passenger identity is derived automatically
 */
export async function createContractNoteForCustomer(
  contractId: string,
  data: CreateContractNoteForCustomerDto
): Promise<ContractNote> {
  return apiPost<ContractNote>(`/contracts/${contractId}/notes/for-customer`, data);
}

/**
 * List all notes for a contract
 */
export async function listContractNotes(
  contractId: string,
  includeArchived = false
): Promise<ContractNote[]> {
  return apiGet<ContractNote[]>(`/contracts/${contractId}/notes`, {
    params: { includeArchived },
  });
}

/**
 * List all operational notes for a customer (across all their contracts)
 */
export async function listCustomerOperationalNotes(
  customerId: string
): Promise<ContractNote[]> {
  return apiGet<ContractNote[]>(`/contracts/operational-notes/customer/${customerId}`);
}

/**
 * Update a contract note
 */
export async function updateContractNote(
  contractId: string,
  noteId: string,
  data: UpdateContractNoteDto
): Promise<ContractNote> {
  return apiPost<ContractNote>(`/contracts/${contractId}/notes/${noteId}`, data);
}

/**
 * Delete a contract note (admin only)
 */
export async function deleteContractNote(
  contractId: string,
  noteId: string
): Promise<{ message: string }> {
  return apiDelete<{ message: string }>(`/contracts/${contractId}/notes/${noteId}`);
}

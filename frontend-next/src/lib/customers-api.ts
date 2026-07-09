import { authenticatedFetch, getStoredToken } from './auth-api';
import { resolveApiBase } from './runtime-config';

// Types
export interface CustomerListItem {
  id: string;
  fullName: string;
  idNumber: string;
  email: string;
  phone: string | null;
  createdAt: string;
}

export interface CustomerListResponse {
  customers: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface GetCustomersParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export type CustomerDocumentCategory = 
  | 'ID_FRONT'
  | 'ID_BACK'
  | 'PASSPORT'
  | 'PROFILE_PHOTO'
  | 'OTHER';

export interface CustomerDocument {
  id: string;
  customerId: string;
  tenantId: string;
  category: CustomerDocumentCategory;
  originalFileName: string;
  objectKey: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface CustomerNote {
  id: string;
  customerId: string;
  tenantId: string;
  note: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInfo {
  id: string;
  fullName: string;
  idNumber: string;
  idType: string | null;
  email: string;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  createdAt: string;
  updatedAt: string;
  dateOfBirth: string | null;
  nationality: string | null;
  occupation: string | null;
  maritalStatus: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  secondaryEmail: string | null;
  secondaryPhone: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactEmail: string | null;
  leadSource: string | null;
  customerStatus: string;
  assignedToUserId: string | null;
  lastContactDate: string | null;
  nextFollowUpDate: string | null;
  preferredLanguage: string | null;
  tags: string | null;
  bloodType: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  medications: string | null;
}

export interface CustomerContractItem {
  id: string;
  contractNumber: string;
  destination: string;
  status: string;
  source: string;
  participantCount: number;
  createdAt: string;
}

export interface CustomerFinancialSummary {
  // Monetary amounts
  totalContractedAmount: number;
  totalInvoicedAmount: number;
  totalPaidAmount: number;
  outstandingBalance: number;
  availableCredit: number;

  // Last payment info
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;

  // Last contract info
  lastContractDate: string | null;
  lastContractNumber: string | null;

  // Record counts (kept for backward compatibility)
  totalInvoices: number;
  totalReceipts: number;
  totalPayments: number;
}

export interface CustomerStatistics {
  totalContracts: number;
  totalTravels: number;
  totalDocuments: number;
  totalNotes: number;
}

export interface CustomerProfile {
  customer: CustomerInfo;
  contracts: CustomerContractItem[];
  financialSummary: CustomerFinancialSummary;
  statistics: CustomerStatistics;
  documents: CustomerDocument[];
  notes: CustomerNote[];
}

export interface UpdateCustomerDto {
  fullName?: string;
  idType?: string;
  email?: string;
  phone?: string;
  maritalStatus?: string;
  nationality?: string;
  occupation?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export interface CreateCustomerDto {
  fullName: string;
  idNumber: string;
  email: string;
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export interface ValidateCustomerIdentityRequest {
  idNumber: string;
  fullName: string;
}

export interface CustomerIdentityValidationResult {
  valid: boolean;
  message: string;
  existingCustomer?: {
    id: string;
    fullName: string;
    idNumber: string;
    email: string;
  };
}

// API Functions
export async function getCustomers(
  params?: GetCustomersParams
): Promise<CustomerListResponse> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append('page', String(params.page));
  if (params?.pageSize) queryParams.append('pageSize', String(params.pageSize));
  if (params?.search) queryParams.append('search', params.search);

  const queryString = queryParams.toString();
  const url = `${apiBase}/customers${queryString ? `?${queryString}` : ''}`;

  const response = await authenticatedFetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      errorText || `Error al obtener clientes: ${response.status}`
    );
  }

  return response.json();
}

export async function getCustomerProfile(id: string): Promise<CustomerProfile> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  const response = await authenticatedFetch(`${apiBase}/customers/${id}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      errorText || `Error al cargar perfil del cliente: ${response.status}`
    );
  }

  return response.json();
}

export async function createCustomer(
  data: CreateCustomerDto
): Promise<CustomerInfo> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  const response = await authenticatedFetch(`${apiBase}/customers`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      errorText || `Error al crear cliente: ${response.status}`
    );
  }

  return response.json();
}

export async function updateCustomer(
  id: string,
  data: UpdateCustomerDto
): Promise<CustomerProfile> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  const response = await authenticatedFetch(`${apiBase}/customers/${id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      errorText || `Error al actualizar cliente: ${response.status}`
    );
  }

  return response.json();
}

export async function validateCustomerIdentity(
  data: ValidateCustomerIdentityRequest
): Promise<CustomerIdentityValidationResult> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  const response = await authenticatedFetch(`${apiBase}/customers/validate-identity`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      errorText || `Error al validar identidad del cliente: ${response.status}`
    );
  }

  return response.json();
}

export async function getCustomerDocumentDownloadUrl(
  customerId: string,
  documentId: string
): Promise<{ url: string; fileName: string; mimeType: string; size: number }> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  const response = await authenticatedFetch(
    `${apiBase}/customers/${customerId}/documents/${documentId}/url`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      errorText || `Error al obtener URL de descarga: ${response.status}`
    );
  }

  return response.json();
}

export async function uploadCustomerDocument(
  customerId: string,
  category: CustomerDocumentCategory,
  file: File
): Promise<CustomerDocument> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);

  const response = await authenticatedFetch(
    `${apiBase}/customers/${customerId}/documents`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      errorText || `Error al subir documento: ${response.status}`
    );
  }

  return response.json();
}

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

export interface CustomerInfo {
  id: string;
  fullName: string;
  idNumber: string;
  email: string;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  createdAt: string;
  updatedAt: string;
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
}

export interface CustomerProfile {
  customer: CustomerInfo;
  contracts: CustomerContractItem[];
  financialSummary: CustomerFinancialSummary;
  statistics: CustomerStatistics;
}

export interface UpdateCustomerDto {
  fullName?: string;
  email?: string;
  phone?: string;
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

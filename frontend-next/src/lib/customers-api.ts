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

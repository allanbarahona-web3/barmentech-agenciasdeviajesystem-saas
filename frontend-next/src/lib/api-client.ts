/**
 * API Client para comunicación con el backend
 * Maneja JWT, multi-tenancy, y errores de forma centralizada
 */

import { AUTH_TOKEN_KEY, resolveApiBase } from './runtime-config';

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean>;
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function buildUrl(path: string, params?: Record<string, any>): string {
  const url = new URL(`${resolveApiBase()}${path}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.toString();
}

export async function fetchApi(
  path: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { params, ...fetchOptions } = options;

  const url = buildUrl(path, params);
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  // Agregar token JWT si existe
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    // Si es 401, probablemente el token expiró
    if (response.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        window.location.href = '/login';
      }
    }

    return response;
  } catch (error) {
    if (
      fetchOptions.signal?.aborted ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      throw error;
    }

    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Helper para hacer llamadas GET
 */
export async function apiGet<T = any>(
  path: string,
  options?: Omit<FetchOptions, 'method'>
): Promise<T> {
  const response = await fetchApi(path, {
    ...options,
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Helper para hacer llamadas POST
 */
export async function apiPost<T = any>(
  path: string,
  body?: any,
  options?: Omit<FetchOptions, 'method' | 'body'>
): Promise<T> {
  const response = await fetchApi(path, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API Error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Helper para hacer llamadas PUT
 */
export async function apiPut<T = any>(
  path: string,
  body?: any,
  options?: Omit<FetchOptions, 'method' | 'body'>
): Promise<T> {
  const response = await fetchApi(path, {
    ...options,
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API Error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Helper para hacer llamadas DELETE
 */
export async function apiDelete<T = any>(
  path: string,
  options?: Omit<FetchOptions, 'method'>
): Promise<T> {
  const response = await fetchApi(path, {
    ...options,
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API Error: ${response.statusText}`);
  }

  return response.json();
}

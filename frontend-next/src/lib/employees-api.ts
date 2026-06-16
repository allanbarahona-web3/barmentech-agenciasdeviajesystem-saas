import { authenticatedFetch, getStoredToken } from './auth-api';
import { resolveApiBase } from './runtime-config';

// Types
export interface Employee {
  id: string;
  tenantId: string;
  fullName: string;
  documentId: string;
  dateOfBirth?: Date | string | null;
  email: string;
  phone?: string | null;
  address?: string | null;
  hireDate: Date | string;
  employmentType: EmploymentType;
  position: string;
  department?: string | null;
  monthlySalary: number;
  dailySalary: number;
  status: 'ACTIVO' | 'SUSPENDIDO' | 'INACTIVO';
  terminationDate?: Date | string | null;
  userId?: string | null;
  user?: {
    id: string;
    email: string;
    role: string;
    isActive: boolean;
  } | null;
  documents?: EmployeeDocument[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  documentType: 'CONTRATO' | 'CEDULA_FRONTAL' | 'CEDULA_TRASERA' | 'PASAPORTE' | 'LICENCIA' | 'INCAPACIDAD' | 'CERTIFICADO' | 'OTRO';
  fileName: string;
  fileUrl: string;
  objectKey: string;
  mimeType: string;
  size: number;
  notes?: string | null;
  uploadedByUserId: string;
  uploadedByName: string;
  uploadedAt: Date | string;
}

export type EmploymentType =
  | 'FULL_TIME'
  | 'PART_TIME'
  | 'TEMPORARY'
  | 'CONTRACTOR';

export interface CreateEmployeeDto {
  fullName: string;
  documentId: string;
  dateOfBirth?: string;
  email: string;
  phone?: string;
  address?: string;
  hireDate: string;
  employmentType: EmploymentType;
  position: string;
  department?: string;
  monthlySalary: number;
  status?: 'ACTIVO' | 'SUSPENDIDO' | 'INACTIVO';
}

export interface UpdateEmployeeDto {
  fullName?: string;
  documentId?: string;
  dateOfBirth?: string;
  email?: string;
  phone?: string;
  address?: string;
  hireDate?: string;
  position?: string;
  department?: string;
  employmentType?: EmploymentType;
  monthlySalary?: number;
  status?: 'ACTIVO' | 'SUSPENDIDO' | 'INACTIVO';
  terminationDate?: string;
}

export interface EmployeeStats {
  total: number;
  activos: number;
  suspendidos: number;
  inactivos: number;
}

// API Functions
export async function createEmployee(data: CreateEmployeeDto): Promise<Employee> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  const response = await authenticatedFetch(`${apiBase}/employees`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Error al crear empleado');
  }

  return response.json();
}

export async function getEmployees(filters?: {
  status?: string;
  position?: string;
  department?: string;
  search?: string;
}): Promise<Employee[]> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.position) params.append('position', filters.position);
  if (filters?.department) params.append('department', filters.department);
  if (filters?.search) params.append('search', filters.search);

  const response = await authenticatedFetch(`${apiBase}/employees?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Error al cargar empleados');
  }

  return response.json();
}

export async function getEmployee(id: string): Promise<Employee> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  const response = await authenticatedFetch(`${apiBase}/employees/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Error al cargar empleado');
  }

  return response.json();
}

export async function updateEmployee(id: string, data: UpdateEmployeeDto): Promise<Employee> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  const response = await authenticatedFetch(`${apiBase}/employees/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Error al actualizar empleado');
  }

  return response.json();
}

export async function uploadEmployeeDocument(
  employeeId: string,
  file: File,
  documentType: string,
  notes?: string,
): Promise<EmployeeDocument> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('documentType', documentType);
  if (notes) formData.append('notes', notes);

  const response = await authenticatedFetch(`${apiBase}/employees/${employeeId}/documents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Error al subir documento');
  }

  return response.json();
}

export async function deleteEmployeeDocument(documentId: string): Promise<void> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  const response = await authenticatedFetch(`${apiBase}/employees/documents/${documentId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Error al eliminar documento');
  }
}

export async function getEmployeeDocumentUrl(documentId: string): Promise<{ url: string; fileName: string }> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  const response = await authenticatedFetch(`${apiBase}/employees/documents/${documentId}/url`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Error al obtener URL del documento');
  }

  return response.json();
}

export async function getEmployeeStats(): Promise<EmployeeStats> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  const response = await authenticatedFetch(`${apiBase}/employees/stats`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Error al cargar estadísticas');
  }

  return response.json();
}


export async function getAvailableEmployeeUsers() {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  const response = await authenticatedFetch(
    `${apiBase}/employees/available-users`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Error al cargar usuarios disponibles');
  }

  return response.json();
}

export async function linkEmployeeUser(
  employeeId: string,
  userId: string,
) {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  const response = await authenticatedFetch(
    `${apiBase}/employees/${employeeId}/link-user`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Error al vincular usuario');
  }

  return response.json();
}

/**
 * Calcula la edad de un empleado basado en su fecha de nacimiento
 */
export function calculateAge(dateOfBirth: Date | string): number {
  const birthDate = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  // Si aún no ha cumplido años este año, restar 1
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Labels amigables para tipos de documentos
 */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  CONTRATO: '📄 Contrato Laboral',
  CEDULA_FRONTAL: '🪪 Cédula (Frontal)',
  CEDULA_TRASERA: '🪪 Cédula (Trasera)',
  PASAPORTE: '🛂 Pasaporte',
  LICENCIA: '🚗 Licencia de Conducir',
  INCAPACIDAD: '🏥 Incapacidad Médica',
  CERTIFICADO: '🎓 Certificación',
  OTRO: '📎 Otros Documentos',
};


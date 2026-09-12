import { authenticatedFetch, getStoredSession, getStoredToken } from '@/lib/auth-api';
import { resolveApiBase } from '@/lib/runtime-config';

export type AttendanceState =
  | 'WORKING'
  | 'MEETING'
  | 'BREAK1'
  | 'LUNCH'
  | 'BREAK2'
  | 'BREAK3'
  | 'OT'
  | 'OFF';

export type AttendanceStatus = {
  currentState: AttendanceState | null;
  clockedInAt: string | null;
  sessionDuration: number;
  paidSoFar: number;
  effectiveSoFar: number;
  isWithinSystemHours: boolean;
};

export type AttendanceEntry = {
  id: string;
  type: AttendanceState;
  clockIn: string;
  clockOut: string | null;
  duration: number | null;
  exceeded: boolean;
  excessMinutes: number | null;
  isOT: boolean;
  date: string;
  correctionCount?: number;
  User?: {
    id: string;
    fullName: string;
    email?: string;
  };
};

export type AttendanceAdminListItem = {
  id: string;
  type: AttendanceState;
  clockIn: string;
  clockOut: string | null;
  duration: number | null;
  isOT: boolean;
  correctionCount: number;
  user: {
    id: string;
    fullName: string;
  };
};

export type AttendanceAdminEntriesPaginatedQuery = {
  page: number;
  pageSize: number;
  tenantId?: string;
  userId?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  type?: AttendanceState;
  isOT?: boolean;
  exceeded?: boolean;
};

export type PaginatedAttendanceAdminEntries = {
  items: AttendanceAdminListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AttendanceEmployeeOption = {
  userId: string;
  fullName: string;
};

export type AttendanceSummary = {
  id: string;
  date: string;
  workingMin: number;
  meetingMin: number;
  otMin: number;
  break1Min: number;
  break2Min: number;
  break3Min: number;
  lunchMin: number;
  effectiveMin: number;
  paidMin: number;
  totalMin: number;
  excessBreaksMin: number;
  excessLunchMin: number;
  isComplete: boolean;
  hasOT: boolean;
};

export type AttendanceConfig = {
  id: string;
  tenantId: string;
  requireAttendanceForAgente: boolean;
  requireAttendanceForOperador: boolean;
  requireAttendanceForVendedor: boolean;
  requireAttendanceForAdmin: boolean;
  requireAttendanceForContador: boolean;
  break1Duration: number;
  lunchDuration: number;
  break2Duration: number;
  break3Duration: number;
  regularHours: number;
  maxOtHours: number;
  otEnabled: boolean;
  systemHours: {
    systemStart: string;
    systemEnd: string;
    timezone: string;
    daysOfWeek?: number[];
  };
};

const parseError = async (response: Response, fallback: string) => {
  const payload = await response.json().catch(() => ({}));
  const message = (payload as { message?: unknown }).message;
  if (Array.isArray(message)) {
    return message.join(', ');
  }
  if (typeof message === 'string' && message.trim()) {
    return message;
  }
  return fallback;
};

const ensureSession = () => {
  const token = getStoredToken();
  if (!token) {
    throw new Error('Tu sesion no esta activa. Inicia sesion nuevamente.');
  }

  const session = getStoredSession();
  if (!session?.user?.id) {
    throw new Error('No se encontro sesion valida.');
  }

  return session;
};

export const attendanceCheckIn = async (state: AttendanceState) => {
  ensureSession();
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/attendance/check-in`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getStoredToken()}`,
    },
    body: JSON.stringify({ state }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, 'No se pudo registrar el marcaje.'));
  }

  return response.json();
};

export const getAttendanceStatus = async (): Promise<AttendanceStatus> => {
  ensureSession();
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/attendance/status`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getStoredToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response, 'No se pudo obtener el estado de asistencia.'));
  }

  return response.json();
};

export const getAttendanceToday = async (): Promise<{ entries: AttendanceEntry[]; summary: AttendanceSummary | null }> => {
  ensureSession();
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/attendance/today`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getStoredToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response, 'No se pudo cargar la asistencia de hoy.'));
  }

  return response.json();
};

export const getAttendanceMySummary = async (startDate: string, endDate: string) => {
  ensureSession();
  const apiBase = resolveApiBase();
  const params = new URLSearchParams({ startDate, endDate });
  const response = await authenticatedFetch(`${apiBase}/attendance/my-summary?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getStoredToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response, 'No se pudo cargar el resumen de asistencia.'));
  }

  return response.json();
};

export const getAttendanceMyEntries = async (startDate: string, endDate: string) => {
  ensureSession();
  const apiBase = resolveApiBase();
  const params = new URLSearchParams({ startDate, endDate });

  const response = await authenticatedFetch(
    `${apiBase}/attendance/my-entries?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getStoredToken()}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(await parseError(response, 'No se pudieron cargar los marcajes.'));
  }

  return response.json() as Promise<AttendanceEntry[]>;
};

export const getAttendanceAdminEntries = async (query: Record<string, string> = {}) => {
  ensureSession();
  const apiBase = resolveApiBase();
  const params = new URLSearchParams(query);
  const response = await authenticatedFetch(`${apiBase}/attendance/admin/entries?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getStoredToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response, 'No se pudieron cargar los marcajes.'));
  }

  return response.json() as Promise<AttendanceEntry[]>;
};

export const getAttendanceAdminEntriesPaginated = async (
  query: AttendanceAdminEntriesPaginatedQuery,
  options?: { signal?: AbortSignal },
): Promise<PaginatedAttendanceAdminEntries> => {
  ensureSession();
  const apiBase = resolveApiBase();
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.tenantId) params.append('tenantId', query.tenantId);
  if (query.userId) params.append('userId', query.userId);
  if (query.date) params.append('date', query.date);
  if (query.startDate) params.append('startDate', query.startDate);
  if (query.endDate) params.append('endDate', query.endDate);
  if (query.type) params.append('type', query.type);
  if (query.isOT !== undefined) params.append('isOT', String(query.isOT));
  if (query.exceeded !== undefined) params.append('exceeded', String(query.exceeded));

  const response = await authenticatedFetch(`${apiBase}/attendance/admin/entries/paginated?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getStoredToken()}`,
    },
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(await parseError(response, 'No se pudieron cargar los marcajes.'));
  }

  return response.json();
};

export const getAttendanceEmployeeOptions = async (
  query?: { tenantId?: string },
): Promise<AttendanceEmployeeOption[]> => {
  ensureSession();
  const apiBase = resolveApiBase();
  const params = new URLSearchParams();
  if (query?.tenantId) params.append('tenantId', query.tenantId);
  const queryString = params.toString();
  const response = await authenticatedFetch(
    `${apiBase}/attendance/admin/employee-options${queryString ? `?${queryString}` : ''}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getStoredToken()}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(await parseError(response, 'No se pudieron cargar las opciones de empleados.'));
  }

  return response.json();
};

export const getAttendanceAdminSummaries = async (startDate: string, endDate: string) => {
  ensureSession();
  const apiBase = resolveApiBase();
  const params = new URLSearchParams({ startDate, endDate });
  const response = await authenticatedFetch(`${apiBase}/attendance/admin/summaries?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getStoredToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response, 'No se pudieron cargar los resúmenes.'));
  }

  return response.json() as Promise<Array<AttendanceSummary & { user: { id: string; fullName: string; role: string } }>>;
};

export const getAttendanceAdminConfig = async (): Promise<AttendanceConfig> => {
  ensureSession();
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/attendance/admin/config`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getStoredToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response, 'No se pudo cargar la configuración de asistencia.'));
  }

  return response.json();
};

export const updateAttendanceAdminConfig = async (payload: Partial<AttendanceConfig>) => {
  ensureSession();
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/attendance/admin/config`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getStoredToken()}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, 'No se pudo actualizar la configuración de asistencia.'));
  }

  return response.json();
};

export const getEntryCorrections = async (entryId: string) => {
  ensureSession();
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/attendance/${entryId}/corrections`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getStoredToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response, 'No se pudo cargar el historial de correcciones.'));
  }

  return response.json();
};

export const correctAttendanceEntry = async (entryId: string, payload: { type?: string; clockIn?: string; clockOut?: string; reason: string }) => {
  ensureSession();
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/attendance/admin/corrections/${entryId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getStoredToken()}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, 'No se pudo corregir el marcaje.'));
  }

  return response.json();
};

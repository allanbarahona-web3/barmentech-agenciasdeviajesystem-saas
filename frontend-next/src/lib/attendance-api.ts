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
  user?: {
    id: string;
    fullName: string;
    email?: string;
  };
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

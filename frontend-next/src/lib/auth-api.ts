import { AUTH_SESSION_KEY, AUTH_TOKEN_KEY, resolveApiBase } from "@/lib/runtime-config";

/**
 * Obtiene la configuración pública del tenant (logo, colores) sin autenticación
 * Necesario para mostrar branding en la página de login
 * @throws {TenantSuspendedError} Si el tenant está suspendido
 */
export async function getTenantConfig(): Promise<TenantConfig> {
  const apiBase = resolveApiBase();
  const response = await fetch(`${apiBase}/auth/tenant-config`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  
  if (!response.ok) {
    // Intentar parsear el error
    const payload = await response.json().catch(() => ({}));
    
    // Detectar si es un error de tenant suspendido
    if (
      typeof payload === 'object' && 
      payload !== null && 
      'message' in payload && 
      payload.message === 'TENANT_SUSPENDED' &&
      'details' in payload
    ) {
      const details = payload.details as { 
        tenantName: string; 
        suspendedAt: string; 
        reason: string;
      };
      throw new TenantSuspendedError(
        details.tenantName,
        new Date(details.suspendedAt),
        details.reason
      );
    }
    
    throw new Error("No se pudo obtener la configuración del tenant");
  }
  
  return response.json();
}

export type LoginResponse = {
  access_token: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role?: string;
    mustChangePassword?: boolean;
  };
};

export type AuthSession = {
  token: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role?: string;
    mustChangePassword?: boolean;
  };
  loginAt: string;
};

export type TenantConfig = {
  name: string;
  subdomain: string;
  logoUrl: string | null;
  signatureUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  contactPhone: string | null;
  contactWhatsApp: string | null;
  contactEmail: string | null;
  businessAddress: string | null;
};

export type AdminUserListItem = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  activeAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

// Error personalizado para tenant suspendido
export class TenantSuspendedError extends Error {
  tenantName: string;
  suspendedAt: Date;
  reason: string;
  
  constructor(tenantName: string, suspendedAt: Date, reason: string) {
    super('TENANT_SUSPENDED');
    this.name = 'TenantSuspendedError';
    this.tenantName = tenantName;
    this.suspendedAt = suspendedAt;
    this.reason = reason;
  }
}

const parseErrorMessage = (payload: unknown, fallback: string): string => {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const message = (payload as { message?: unknown }).message;
  if (Array.isArray(message)) {
    return message.join(", ");
  }
  if (typeof message === "string" && message.trim()) {
    return message;
  }

  return fallback;
};

export const loginWithEmailPassword = async (
  email: string,
  password: string,
): Promise<LoginResponse> => {
  const apiBase = resolveApiBase();
  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  const response = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: String(email || "").trim(),
      password: String(password || ""),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Detectar si es un error de tenant suspendido
    if (
      typeof payload === 'object' && 
      payload !== null && 
      'message' in payload && 
      payload.message === 'TENANT_SUSPENDED' &&
      'details' in payload
    ) {
      const details = payload.details as { 
        tenantName: string; 
        suspendedAt: string; 
        reason: string;
      };
      throw new TenantSuspendedError(
        details.tenantName,
        new Date(details.suspendedAt),
        details.reason
      );
    }
    throw new Error(parseErrorMessage(payload, "No se pudo iniciar sesion."));
  }

  const token = String(
    (
      payload as {
        access_token?: string;
        accessToken?: string;
      }
    ).access_token ||
      (
        payload as {
          access_token?: string;
          accessToken?: string;
        }
      ).accessToken ||
      "",
  ).trim();
  const user = (payload as { user?: LoginResponse["user"] }).user;

  if (!token || !user?.id) {
    throw new Error("Respuesta de login invalida.");
  }

  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  const session: AuthSession = {
    token,
    user,
    loginAt: new Date().toISOString(),
  };
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  return {
    access_token: token,
    user,
  };
};

export const getStoredToken = (): string => {
  if (typeof window === "undefined") {
    return "";
  }
  return String(window.localStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
};

export const clearStoredToken = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_SESSION_KEY);
};

export const getStoredSession = (): AuthSession | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = String(window.localStorage.getItem(AUTH_SESSION_KEY) || "").trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    const token = String(parsed?.token || "").trim();
    const loginAt = String(parsed?.loginAt || "").trim();
    const user = parsed?.user;
    if (!token || !loginAt || !user?.id || !user?.email || !user?.fullName) {
      return null;
    }

    return {
      token,
      loginAt,
      user: {
        id: String(user.id),
        email: String(user.email),
        fullName: String(user.fullName),
        role: user.role ? String(user.role) : undefined,
        mustChangePassword: user.mustChangePassword === true,
      },
    };
  } catch {
    return null;
  }
};

const authHeaders = (): HeadersInit => {
  const token = getStoredToken();
  if (!token) {
    throw new Error("Tu sesion no esta activa. Inicia sesion nuevamente.");
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
};

const getClientTimeHeaders = (): HeadersInit => {
  if (typeof window === "undefined") {
    return {};
  }

  const timeZone = String(Intl.DateTimeFormat().resolvedOptions().timeZone || "").trim();
  const utcOffsetMinutes = String(new Date().getTimezoneOffset());

  return {
    "x-client-timezone": timeZone,
    "x-client-utc-offset-minutes": utcOffsetMinutes,
  };
};

/**
 * Wrapper for authenticated fetch that automatically handles 401 responses
 * by clearing the session and redirecting to login.
 */
export const authenticatedFetch = async (url: string, options: RequestInit): Promise<Response> => {
  const mergedHeaders = new Headers(options.headers || {});
  const clientTimeHeaders = getClientTimeHeaders();

  Object.entries(clientTimeHeaders).forEach(([key, value]) => {
    if (typeof value === "string" && value.trim()) {
      mergedHeaders.set(key, value);
    }
  });

  const response = await fetch(url, {
    ...options,
    headers: mergedHeaders,
  });
  
  // If unauthorized, clear session and redirect to login
  if (response.status === 401) {
    clearStoredToken();
    
    // Try to get error message from response
    let errorMessage = "Tu sesión ha expirado. Por favor, inicia sesión nuevamente.";
    try {
      const payload = await response.clone().json();
      const message = payload?.message;
      
      // Check if it's a suspension message
      if (typeof message === "string" && message.toLowerCase().includes("suspendido")) {
        errorMessage = message; // Use the exact backend message: "Tu usuario ha sido suspendido. Contacta al administrador."
      } else if (typeof message === "string" && message.toLowerCase().includes("rol")) {
        errorMessage = "Tu rol ha sido cambiado. Por favor, inicia sesión nuevamente.";
      } else if (typeof message === "string" && message.trim()) {
        errorMessage = message;
      }
    } catch {
      // Ignore JSON parsing errors, use default message
    }
    
    // Show alert explaining session was invalidated
    if (typeof window !== "undefined") {
      alert(errorMessage);
      window.location.href = "/";
    }
    
    throw new Error(errorMessage);
  }
  
  return response;
};

export const adminListUsers = async (): Promise<AdminUserListItem[]> => {
  const apiBase = resolveApiBase();
  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  const response = await authenticatedFetch(`${apiBase}/auth/users`, {
    method: "GET",
    headers: authHeaders(),
  });

  const payload = await response.json().catch(() => ([]));
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, "No se pudo cargar usuarios."));
  }

  return Array.isArray(payload) ? (payload as AdminUserListItem[]) : [];
};

export const adminCreateUser = async (input: {
  email: string;
  fullName: string;
  password: string;
  role: "AGENT" | "ADMIN" | "CONTADOR" | "FACTURACION_COBROS" | "VENTAS" | "OPERACIONES";
  employeeId?: string;
}): Promise<AdminUserListItem> => {
  const apiBase = resolveApiBase();
  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  const response = await authenticatedFetch(`${apiBase}/auth/users`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, "No se pudo crear el usuario."));
  }

  return payload as AdminUserListItem;
};

export const adminUpdateUser = async (
  userId: string,
  input: Partial<{ fullName: string; email: string; role: "AGENT" | "ADMIN" | "CONTADOR" | "FACTURACION_COBROS" | "VENTAS" | "OPERACIONES"; isActive: boolean }>,
): Promise<AdminUserListItem> => {
  const apiBase = resolveApiBase();
  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  const response = await authenticatedFetch(`${apiBase}/auth/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, "No se pudo actualizar el usuario."));
  }

  return payload as AdminUserListItem;
};

export const requestPasswordReset = async (email: string): Promise<{ ok: boolean; message: string }> => {
  const apiBase = resolveApiBase();
  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  const response = await fetch(`${apiBase}/auth/request-password-reset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: String(email || "").trim(),
      website: "", // Honeypot
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, "No se pudo procesar la solicitud."));
  }

  return payload as { ok: boolean; message: string };
};

export const confirmPasswordReset = async (
  token: string,
  newPassword: string,
): Promise<{ ok: boolean; message: string }> => {
  const apiBase = resolveApiBase();
  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  const response = await fetch(`${apiBase}/auth/confirm-password-reset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: String(token || "").trim(),
      newPassword: String(newPassword || ""),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, "No se pudo resetear la contraseña."));
  }

  return payload as { ok: boolean; message: string };
};

export const adminResetPassword = async (
  userId: string,
): Promise<{ ok: boolean; message: string; temporaryPassword: string; email: string; fullName: string }> => {
  const apiBase = resolveApiBase();
  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  const response = await authenticatedFetch(`${apiBase}/auth/users/reset-password`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ userId }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, "No se pudo resetear la contraseña."));
  }

  return payload as { ok: boolean; message: string; temporaryPassword: string; email: string; fullName: string };
};

export const changePassword = async (
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; message: string }> => {
  const apiBase = resolveApiBase();
  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  const response = await authenticatedFetch(`${apiBase}/auth/change-password`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      currentPassword: String(currentPassword || ""),
      newPassword: String(newPassword || ""),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, "No se pudo cambiar la contraseña."));
  }

  return payload as { ok: boolean; message: string };
};

export const logout = async (): Promise<{ ok: boolean; message: string }> => {
  const apiBase = resolveApiBase();
  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  const response = await authenticatedFetch(`${apiBase}/auth/logout`, {
    method: "POST",
    headers: authHeaders(),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, "No se pudo cerrar sesión."));
  }

  return payload as { ok: boolean; message: string };
};

/**
 * Get the default home route for a user based on their role
 */
export const getHomeRouteForRole = (role?: string): string => {
  const normalizedRole = String(role || "").toUpperCase();
  
  switch (normalizedRole) {
    case "SUPER_ADMIN":
      return "/super-admin/dashboard";
    case "ADMIN":
      return "/admin/dashboard";
    case "CONTADOR":
      return "/admin/dashboard";
    case "FACTURACION_COBROS":
      return "/admin/pending-payments";
    case "VENTAS":
    case "OPERACIONES":
      return "/agent-start"; // Flujo con modales
    default:
      // AGENTE and other roles
      return "/agent-start"; // Flujo con modales
  }
};

// ========================================
// TENANT LEGAL CONFIG
// ========================================

export type TenantLegalConfig = {
  name: string;
  contactPhone: string | null;
  contactWhatsApp: string | null;
  contactEmail: string | null;
  businessAddress: string | null;
  legalName: string | null;
  legalId: string | null;
  representativeName: string | null;
  representativeId: string | null;
  representativeTitle: string | null;
  representativeMaritalStatus: string | null;
  representativeAddress: string | null;
  representativePowers: string | null;
};

export type UpdateTenantLegalConfigDto = {
  legalName?: string;
  legalId?: string;
  representativeName?: string;
  representativeId?: string;
  representativeTitle?: string;
  representativeMaritalStatus?: string;
  representativeAddress?: string;
  representativePowers?: string;
};

/**
 * Obtiene la configuración legal del tenant (público, para construir contratos)
 */
export const getTenantLegalConfig = async (): Promise<TenantLegalConfig> => {
  const apiBase = resolveApiBase();
  const response = await fetch(`${apiBase}/auth/tenant-config/legal`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error("No se pudo obtener la configuración legal del tenant");
  }
  return response.json();
};

/**
 * Actualiza la configuración legal del tenant (solo ADMIN)
 */
export const updateTenantLegalConfig = async (
  dto: UpdateTenantLegalConfigDto,
): Promise<{ message: string; tenant: TenantLegalConfig }> => {
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/auth/tenant-config/legal`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(dto),
  });

  const payload = await response.json();
  if (!response.ok) {
    const errorMsg =
      typeof payload?.message === "string"
        ? payload.message
        : "Error al actualizar la configuración legal";
    throw new Error(errorMsg);
  }

  return payload;
};

// ========================================
// SUPER ADMIN API
// ========================================

export type SuperAdminTenant = {
  id: string;
  name: string;
  subdomain: string | null;
  customDomain: string | null;
  contractPrefix: string;
  isActive: boolean;
  suspendedAt: Date | null;
  suspendReason: string | null;
  planType: string | null;
  planExpiresAt: Date | null;
  fromEmail: string | null;
  replyToEmail: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    users: number;
    contracts: number;
    clients: number;
  };
};

export type TenantDetail = {
  id: string;
  name: string;
  subdomain: string | null;
  customDomain: string | null;
  contractPrefix: string;
  isActive: boolean;
  suspendedAt: Date | null;
  suspendReason: string | null;
  planType: string | null;
  planExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Branding
  logoUrl: string | null;
  signatureUrl: string | null;
  emailLogoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  // Legal info
  legalName: string | null;
  legalId: string | null;
  representativeName: string | null;
  representativeId: string | null;
  representativeTitle: string | null;
  representativeMaritalStatus: string | null;
  representativeAddress: string | null;
  representativePowers: string | null;
  // Admin users
  admins: Array<{
    id: string;
    email: string;
    fullName: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
  }>;
  // Counts
  counts: {
    users: number;
    clients: number;
    contracts: number;
  };
};

export type PlatformStats = {
  tenants: {
    total: number;
    active: number;
    suspended: number;
  };
  users: number;
  clients: number;
  contracts: number;
};

export type CreateTenantDto = {
  name: string;
  subdomain: string; // Obligatorio
  customDomain?: string;
  contractPrefix: string;
  adminEmail: string;
  adminFullName: string; // Backend espera adminFullName
  adminPassword: string;
};

export type UpdateTenantStatusDto = {
  action: "ACTIVATE" | "SUSPEND";
  reason?: string;
};

/**
 * Obtener todos los tenants (solo SUPER_ADMIN)
 */
export const superAdminGetAllTenants = async (): Promise<SuperAdminTenant[]> => {
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/super-admin/tenants`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload?.message || "Error al obtener tenants");
  }

  return response.json();
};

/**
 * Obtener detalles de un tenant específico (solo SUPER_ADMIN)
 */
export const superAdminGetTenantById = async (tenantId: string): Promise<TenantDetail> => {
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/super-admin/tenants/${tenantId}`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload?.message || "Error al obtener detalles del tenant");
  }

  return response.json();
};

/**
 * Crear un nuevo tenant (solo SUPER_ADMIN)
 */
export const superAdminCreateTenant = async (dto: CreateTenantDto): Promise<{ message: string; tenant: SuperAdminTenant }> => {
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/super-admin/tenants`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(dto),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message || "Error al crear tenant");
  }

  return payload;
};

/**
 * Actualizar estado de un tenant (solo SUPER_ADMIN)
 */
export const superAdminUpdateTenantStatus = async (
  tenantId: string,
  dto: UpdateTenantStatusDto,
): Promise<{ message: string; tenant: SuperAdminTenant }> => {
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/super-admin/tenants/${tenantId}/status`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(dto),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message || "Error al actualizar estado del tenant");
  }

  return payload;
};

/**
 * Marcar email del tenant como verificado en Resend (solo SUPER_ADMIN)
 */
export const superAdminVerifyTenantEmail = async (tenantId: string): Promise<SuperAdminTenant> => {
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/super-admin/tenants/${tenantId}/verify-email`, {
    method: "PATCH",
    headers: authHeaders(),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message || "Error al verificar email del tenant");
  }

  return payload;
};

/**
 * Obtener estadísticas de la plataforma (solo SUPER_ADMIN)
 */
export const superAdminGetPlatformStats = async (): Promise<PlatformStats> => {
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/super-admin/stats`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload?.message || "Error al obtener estadísticas");
  }

  return response.json();
};

// ========================================
// TENANT CONFIGURATION (ADMIN only)
// ========================================

export type TenantConfigResponse = {
  id: string;
  name: string;
  subdomain: string | null;
  customDomain: string | null;
  contractPrefix: string;
  logoUrl: string | null;
  signatureUrl: string | null;
  emailLogoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;  contactPhone?: string | null;
  contactWhatsApp?: string | null;
  contactEmail?: string | null;
  businessAddress?: string | null;
  websiteUrl?: string | null;  fromEmail: string | null;
  replyToEmail: string | null;
  emailVerified: boolean;
  legalName: string | null;
  legalId: string | null;
  representativeName: string | null;
  representativeId: string | null;
  representativeTitle: string | null;
  representativeMaritalStatus: string | null;
  representativeAddress: string | null;
  representativePowers: string | null;
};

export type UpdateTenantConfigDto = {
  primaryColor?: string;
  secondaryColor?: string;
  contactPhone?: string;
  contactWhatsApp?: string;
  contactEmail?: string;
  businessAddress?: string;
  websiteUrl?: string;
  fromEmail?: string;
  replyToEmail?: string;
  legalName?: string;
  legalId?: string;
  representativeName?: string;
  representativeId?: string;
  representativeTitle?: string;
  representativeMaritalStatus?: string;
  representativeAddress?: string;
  representativePowers?: string;
};

/**
 * Obtener configuración del tenant actual (ADMIN)
 */
export const getTenantConfigAdmin = async (): Promise<TenantConfigResponse> => {
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/tenant/config`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload?.message || "Error al obtener configuración del tenant");
  }

  return response.json();
};

/**
 * Actualizar configuración del tenant (ADMIN)
 */
export const updateTenantConfigAdmin = async (
  dto: UpdateTenantConfigDto,
): Promise<{ id: string; name: string; primaryColor: string | null; secondaryColor: string | null; legalName: string | null }> => {
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/tenant/config`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(dto),
  });

  const payload = await response.json();
  if (!response.ok) {
    // Si es un error estructurado del backend (con code, domain, etc), lanzarlo completo
    if (payload?.code) {
      throw payload; // Preserva toda la información del error
    }
    throw new Error(payload?.message || "Error al actualizar configuración");
  }

  return payload;
};

/**
 * Subir logo del tenant (ADMIN)
 */
export const uploadTenantLogo = async (file: File): Promise<{ success: boolean; assetType: string; url: string }> => {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${apiBase}/tenant/assets/logo`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      // NO incluir Content-Type para que el browser lo setee automáticamente con boundary
    },
    body: formData,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message || "Error al subir logo");
  }

  return payload;
};

/**
 * Subir firma del tenant (ADMIN)
 */
export const uploadTenantSignature = async (file: File): Promise<{ success: boolean; assetType: string; url: string }> => {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${apiBase}/tenant/assets/signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      // NO incluir Content-Type para que el browser lo setee automáticamente con boundary
    },
    body: formData,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message || "Error al subir firma");
  }

  return payload;
};

/**
 * Eliminar logo del tenant (ADMIN)
 */
export const deleteTenantLogo = async (): Promise<{ success: boolean; message: string }> => {
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/tenant/assets/logo`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload?.message || "Error al eliminar logo");
  }

  return response.json();
};

/**
 * Eliminar firma del tenant (ADMIN)
 */
export const deleteTenantSignature = async (): Promise<{ success: boolean; message: string }> => {
  const apiBase = resolveApiBase();
  const response = await authenticatedFetch(`${apiBase}/tenant/assets/signature`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload?.message || "Error al eliminar firma");
  }

  return response.json();
};




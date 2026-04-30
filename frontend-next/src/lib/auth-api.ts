import { AUTH_SESSION_KEY, AUTH_TOKEN_KEY, resolveApiBase } from "@/lib/runtime-config";

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

/**
 * Wrapper for authenticated fetch that automatically handles 401 responses
 * by clearing the session and redirecting to login.
 */
export const authenticatedFetch = async (url: string, options: RequestInit): Promise<Response> => {
  const response = await fetch(url, options);
  
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

/**
 * Get the default home route for a user based on their role
 */
export const getHomeRouteForRole = (role?: string): string => {
  const normalizedRole = String(role || "").toUpperCase();
  
  switch (normalizedRole) {
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


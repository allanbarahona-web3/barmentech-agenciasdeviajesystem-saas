import { authenticatedFetch, getStoredToken } from "@/lib/auth-api";
import { resolveApiBase } from "@/lib/runtime-config";

export type BillingAuditItem = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: string;
  actorName: string;
  beforeJson: unknown;
  afterJson: unknown;
  sourceIp: string | null;
  userAgent: string | null;
  createdAt: string;
};

const parseErrorMessage = (payload: unknown, fallback: string): string => {
  const message = (payload as { message?: unknown })?.message;
  if (Array.isArray(message)) {
    return message.join(", ");
  }
  if (typeof message === "string" && message.trim()) {
    return message;
  }
  return fallback;
};

const getApiBaseAndToken = () => {
  const token = getStoredToken();
  if (!token) {
    throw new Error("Sesion no activa.");
  }

  const apiBase = resolveApiBase();
  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  return { token, apiBase };
};

const apiFetchJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const { token, apiBase } = getApiBaseAndToken();
  const response = await authenticatedFetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, "No se pudo completar la solicitud."));
  }

  return payload as T;
};

export type PendingCounts = {
  pendingReceipts: number;
  contractsPendingSignature: number;
};

export const getPendingApprovalsCount = async (): Promise<PendingCounts> => {
  try {
    const data = await apiFetchJson<PendingCounts>("/billing/admin/pending-counts", {
      method: "GET",
    });
    return data;
  } catch {
    return { pendingReceipts: 0, contractsPendingSignature: 0 };
  }
};

export const listBillingAudit = async (params: {
  contractId?: string;
  entityType?: string;
  q?: string;
  limit?: number;
} = {}): Promise<BillingAuditItem[]> => {
  const query = new URLSearchParams();
  if (params.contractId) query.set("contractId", String(params.contractId));
  if (params.entityType) query.set("entityType", String(params.entityType));
  if (params.q) query.set("q", String(params.q));
  query.set("limit", String(params.limit || 120));

  const payload = await apiFetchJson<{ items?: BillingAuditItem[] }>(`/billing/audit?${query.toString()}`, {
    method: "GET",
  });

  return Array.isArray(payload.items) ? payload.items : [];
};

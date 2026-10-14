import { authenticatedFetch, getStoredToken } from "@/lib/auth-api";
import { resolveApiBase } from "@/lib/runtime-config";

export type BillingListItem = {
  id: string;
  contractId: string;
  contractNumber: string;
  paymentReference?: string | null;
  invoiceNumber: string;
  status: string;
  paymentDueDate?: string | null;
  isOverdue?: boolean;
  overdueDays?: number;
  client: {
    id: string;
    fullName: string;
    idNumber: string;
    email: string;
    phone: string;
  };
  amounts: {
    grossInvoiced?: number;
    creditNotesApplied?: number;
    total: number;
    verified: number;
    pending: number;
    balance: number;
    currency: string;
  };
  lastMovement: {
    paymentId: string;
    status: string;
    at: string;
  } | null;
};
export type BillingAccount = {
  invoice: {
    id: string;
    contractId: string;
    contractNumber: string;
    paymentReference?: string | null;
    invoiceNumber: string;
    status: string;
    issuedAt: string;
    paymentDueDate?: string | null;
    isOverdue?: boolean;
    overdueDays?: number;
    hasPdf: boolean;
    source?: string | null; // SCHEDULED_TRIP | MIGRATION | CUSTOM_TRIP | QUOTE
    amounts: {
      grossInvoiced?: number;
      creditNotesApplied?: number;
      total: number;
      verified: number;
      pending: number;
      balance: number;
      currency: string;
    };
    travel?: {
      name: string | null;
      departureDate: string | null;
      returnDate: string | null;
    } | null;
  };
  client: {
    id: string;
    fullName: string;
    idNumber: string;
    email: string;
    phone: string;
    availableCreditAmount: number;
  };
  creditNotes: Array<{
    id: string;
    creditNoteNumber: string;
    status: string;
    reason: string;
    amount: number;
    issuedAt: string;
    issuedByName?: string | null;
    appliedAt: string | null;
    appliedByName?: string | null;
    hasPdf: boolean;
  }>;
  payments: Array<{
    id: string;
    type: string;
    status: string;
    amount: number;
    currency: string;
    reportedAt: string;
    voucherDate?: string | null;
    createdByName?: string | null;
    bankReference: string | null;
    payerName: string | null;
    originBank?: string | null;
    destinationBank?: string | null;
    destinationAccount?: string | null;
    notes: string | null;
    verifiedAt: string | null;
    verifiedByName: string | null;
    rejectionReason: string | null;
    receipt: {
      id: string;
      receiptNumber: string;
      status: string;
      issuedAt: string;
      sentToEmail?: string | null;
      hasPdf: boolean;
    } | null;
    attachments: Array<{
      id: string;
      originalFileName: string;
      mimeType: string;
      size: number;
      url: string;
    }>;
  }>;
  reservationProofCandidates?: Array<{
    id: string;
    originalFileName: string;
    mimeType: string;
    size: number;
    url: string;
  }>;
};

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

export const listBillingContracts = async (params: { 
  q?: string; 
  status?: string; 
  limit?: number;
  datePreset?: string;
  dateFrom?: string;
  dateTo?: string;
} = {}): Promise<BillingListItem[]> => {
  const query = new URLSearchParams();
  if (params.q) query.set("q", String(params.q));
  if (params.status) query.set("status", String(params.status));
  if (params.datePreset) query.set("datePreset", String(params.datePreset));
  if (params.dateFrom) query.set("dateFrom", String(params.dateFrom));
  if (params.dateTo) query.set("dateTo", String(params.dateTo));
  query.set("limit", String(params.limit || 50));

  const payload = await apiFetchJson<{ items?: BillingListItem[] }>(`/billing/contracts?${query.toString()}`, {
    method: "GET",
  });

  return Array.isArray(payload.items) ? payload.items : [];
};

export const getBillingContractAccount = async (contractId: string): Promise<BillingAccount> =>
  apiFetchJson<BillingAccount>(`/billing/contracts/${encodeURIComponent(contractId)}/account`, {
    method: "GET",
  });

export const getBillingInvoicePdfUrl = async (contractId: string): Promise<{ fileName: string; url: string }> =>
  apiFetchJson<{ fileName: string; url: string }>(
    `/billing/contracts/${encodeURIComponent(contractId)}/invoice/pdf`,
    {
      method: "GET",
    },
  );

export const getBillingAccountStatementPdfUrl = async (contractId: string): Promise<{ fileName: string; url: string }> =>
  apiFetchJson<{ fileName: string; url: string }>(
    `/billing/contracts/${encodeURIComponent(contractId)}/account/pdf`,
    {
      method: "GET",
    },
  );

export const sendBillingAccountStatementEmail = async (
  contractId: string,
  toEmail: string,
  ccEmail?: string,
): Promise<{ ok: boolean; contractId: string; invoiceId: string; sentToEmail: string; ccEmail: string | null }> =>
  apiFetchJson<{ ok: boolean; contractId: string; invoiceId: string; sentToEmail: string; ccEmail: string | null }>(
    `/billing/contracts/${encodeURIComponent(contractId)}/account/send-email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        toEmail,
        ...(ccEmail && ccEmail.trim() ? { ccEmail: ccEmail.trim() } : {}),
      }),
    },
  );

export const getBillingReceiptPdfUrl = async (receiptId: string): Promise<{ fileName: string; url: string }> =>
  apiFetchJson<{ fileName: string; url: string }>(
    `/billing/receipts/${encodeURIComponent(receiptId)}/pdf`,
    {
      method: "GET",
    },
  );

export const getBillingCreditNotePdfUrl = async (creditNoteId: string): Promise<{ fileName: string; url: string }> =>
  apiFetchJson<{ fileName: string; url: string }>(
    `/billing/credit-notes/${encodeURIComponent(creditNoteId)}/pdf`,
    {
      method: "GET",
    },
  );

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

export const sendBillingCreditNoteEmail = async (
  creditNoteId: string,
  toEmail?: string,
  ccEmail?: string,
): Promise<{ ok: boolean; creditNoteId: string; creditNoteNumber: string; status: string; sentToEmail: string; ccEmail: string | null }> =>
  apiFetchJson<{ ok: boolean; creditNoteId: string; creditNoteNumber: string; status: string; sentToEmail: string; ccEmail: string | null }>(
    `/billing/credit-notes/${encodeURIComponent(creditNoteId)}/send-email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(toEmail ? { toEmail } : {}),
        ...(ccEmail && ccEmail.trim() ? { ccEmail: ccEmail.trim() } : {}),
      }),
    },
  );

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

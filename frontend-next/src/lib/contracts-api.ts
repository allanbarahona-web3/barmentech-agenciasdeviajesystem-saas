import { authenticatedFetch, getStoredToken } from "@/lib/auth-api";
import { resolveApiBase } from "@/lib/runtime-config";

export type HistoryContractItem = {
  kind?: "CONTRACT" | "DRAFT";
  id: string;
  draftId?: string | null;
  contractNumber: string;
  status: string;
  source?: string | null;
  travelPackageId?: string | null;
  internalTripId?: string | null;
  clientFullName: string;
  clientIdNumber: string;
  clientEmail: string;
  clientPhone?: string;
  destination: string;
  generatedByName: string;
  createdAt: string;
  documentCount: number;
  signedContractResent?: boolean;
  signedContractResentAt?: string | null;
};

export type ContractFileDocument = {
  id: string;
  originalFileName: string;
  mimeType: string;
  size: number;
  url: string;
};

export type ContractFilesResult = {
  id: string;
  contractNumber: string;
  status: string;
  pdf: {
    fileName: string;
    mimeType: string;
    size: number;
    url: string;
  };
  signedPdf: {
    fileName: string;
    mimeType: string;
    size: number;
    url: string;
    signedByName?: string | null;
    signedAt?: string | null;
  } | null;
  documents: ContractFileDocument[];
};

export type BillingDataResult = {
  contract: {
    id: string;
    number: string;
    destination: string;
    generatedByName: string;
  };
  client: {
    fullName: string;
    idNumber: string;
    idType: string;
    email: string;
    phone: string | null;
  };
  billing: {
    totalAmount: number;
    reservationAmount: number;
    balanceAmount: number;
  };
  travel: {
    startDate: string | null;
    endDate: string | null;
  };
  companions: Array<{
    fullName: string;
    idNumber: string;
  }>;
  minors: Array<{
    name?: string;
    tutorName?: string;
  }>;
};

type ArchiveContractInput = {
  draftId?: string;
  contractNumber: string;
  clientFullName: string;
  clientIdNumber: string;
  clientEmail: string;
  destination: string;
  issuedAt: string;
  startDate: string;
  endDate: string;
  payloadJson: string;
  contractHtml: string;
  documents: File[];
  source?: string; // SCHEDULED_TRIP | MIGRATION | CUSTOM_TRIP | QUOTE | INTERNAL_TRIP
  internalTripId?: string; // Para viajes internos (sin contrato PDF)
};

type ArchiveContractResult = {
  id: string;
  contractNumber: string;
  status: string;
  documentCount: number;
  createdAt: string;
  pdfUrl: string | null; // Null para viajes internos
};

type SigningLinkResult = {
  contractId: string;
  contractNumber: string;
  signingUrl: string;
  signingLinks: Array<{
    signerKey: string;
    signerRole: string;
    signerName: string;
    signerEmail: string | null;
    signingUrl: string;
  }>;
  expiresAt: string;
};

export type ContractDraftResult = {
  id: string;
  contractNumber: string;
  status: string;
  payload: unknown;
  updatedAt: string;
  createdAt: string;
};

export const reserveNextContractNumber = async (): Promise<string> => {
  const token = getStoredToken();
  if (!token) {
    throw new Error("Sesion no activa.");
  }

  const apiBase = resolveApiBase();
  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  const response = await authenticatedFetch(`${apiBase}/contracts/next-number`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof (payload as { message?: unknown }).message === "string"
        ? ((payload as { message?: string }).message as string)
        : "No se pudo reservar numero de contrato.";
    throw new Error(message);
  }

  const contractNumber = String((payload as { contractNumber?: unknown }).contractNumber || "").trim();
  if (!contractNumber) {
    throw new Error("Respuesta invalida al reservar contrato.");
  }

  return contractNumber;
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
      "Content-Type": "application/json",
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

export const archiveContract = async (input: ArchiveContractInput): Promise<ArchiveContractResult> => {
  const { token, apiBase } = getApiBaseAndToken();

  const formData = new FormData();
  if (input.draftId) {
    formData.append("draftId", input.draftId);
  }
  formData.append("contractNumber", input.contractNumber);
  formData.append("clientFullName", input.clientFullName);
  formData.append("clientIdNumber", input.clientIdNumber);
  formData.append("clientEmail", input.clientEmail);
  formData.append("destination", input.destination);
  formData.append("issuedAt", input.issuedAt);
  formData.append("startDate", input.startDate);
  formData.append("endDate", input.endDate);
  formData.append("payloadJson", input.payloadJson);
  formData.append("contractHtml", input.contractHtml);
  if (input.source) {
    formData.append("source", input.source);
  }

  input.documents.forEach((doc) => {
    formData.append("documents", doc, doc.name);
  });

  const response = await authenticatedFetch(`${apiBase}/contracts/archive`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, "No se pudo guardar el contrato."));
  }

  return payload as ArchiveContractResult;
};

export const createSigningLink = async (contractId: string, ttlMinutes = 1440): Promise<SigningLinkResult> =>
  apiFetchJson<SigningLinkResult>(`/contracts/${encodeURIComponent(contractId)}/signing-link`, {
    method: "POST",
    body: JSON.stringify({ ttlMinutes }),
  });

export const sendSigningEmail = async (params: {
  toEmail: string;
  clientName: string;
  contractNumber: string;
  signingUrl: string;
}): Promise<{ ok: boolean }> =>
  apiFetchJson<{ ok: boolean }>("/contracts/send-signing-email", {
    method: "POST",
    body: JSON.stringify(params),
  });

export const sendSigningLinksForContract = async (contractId: string): Promise<{
  contractId: string;
  contractNumber: string;
  emailsSent: number;
  signingLinks: Array<{ signerKey: string; signerName: string; signerEmail: string | null; signingUrl: string }>;
}> =>
  apiFetchJson(`/contracts/${encodeURIComponent(contractId)}/send-signing-links`, {
    method: "POST",
  });

export const searchContracts = async (query: { 
  q?: string; 
  limit?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  datePreset?: string;
} = {}): Promise<HistoryContractItem[]> => {
  const q = String(query.q || "").trim();
  const limit = Number.isFinite(Number(query.limit)) ? Number(query.limit) : 30;
  const params = new URLSearchParams();
  if (q) {
    params.set("q", q);
  }
  params.set("limit", String(limit));
  
  // Filtros adicionales
  if (query.status) {
    params.set("status", query.status);
  }
  if (query.datePreset) {
    params.set("datePreset", query.datePreset);
  }
  if (query.dateFrom) {
    params.set("dateFrom", query.dateFrom);
  }
  if (query.dateTo) {
    params.set("dateTo", query.dateTo);
  }

  const result = await apiFetchJson<{ items?: HistoryContractItem[] }>(`/contracts?${params.toString()}`, {
    method: "GET",
  });

  return Array.isArray(result.items) ? result.items : [];
};

export const getContractFiles = async (contractId: string): Promise<ContractFilesResult> =>
  apiFetchJson<ContractFilesResult>(`/contracts/${encodeURIComponent(contractId)}/files`, {
    method: "GET",
  });

export const resendSignedEmail = async (contractId: string): Promise<{ sentCount: number }> =>
  apiFetchJson<{ sentCount: number }>(`/contracts/${encodeURIComponent(contractId)}/resend-signed-email`, {
    method: "POST",
  });

export const sendContractToBilling = async (contractId: string): Promise<BillingDataResult> =>
  apiFetchJson<BillingDataResult>(`/contracts/${encodeURIComponent(contractId)}/send-to-billing`, {
    method: "POST",
  });

export const saveContractDraft = async (input: {
  id?: string;
  contractNumber: string;
  clientFullName?: string;
  clientIdNumber?: string;
  clientEmail?: string;
  clientPhone?: string;
  destination?: string;
  payloadJson: string;
}): Promise<{ id: string; contractNumber: string; status: string; updatedAt: string }> =>
  apiFetchJson<{ id: string; contractNumber: string; status: string; updatedAt: string }>("/contracts/drafts", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const getContractDraft = async (draftId: string): Promise<ContractDraftResult> =>
  apiFetchJson<ContractDraftResult>(`/contracts/drafts/${encodeURIComponent(draftId)}`, {
    method: "GET",
  });

export const deleteContractDraft = async (draftId: string): Promise<{ ok: boolean; id: string }> =>
  apiFetchJson<{ ok: boolean; id: string }>(`/contracts/drafts/${encodeURIComponent(draftId)}`, {
    method: "DELETE",
  });

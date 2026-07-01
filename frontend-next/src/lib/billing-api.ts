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

export type BillingPendingCreditNoteItem = {
  id: string;
  creditNoteNumber: string;
  contractId: string;
  invoiceId: string;
  contractNumber: string;
  status: string;
  reason: string;
  amount: number;
  issuedAt: string;
  requestedBy: {
    id: string;
    name: string;
  };
  client: {
    id: string;
    fullName: string;
    idNumber: string;
    email: string;
  };
};

export type BillingAdminReportData = {
  filters: {
    from: string | null;
    to: string | null;
    q: string | null;
    invoiceStatus: string | null;
    paymentStatus: string | null;
  };
  summary: {
    sales: {
      invoicesCount: number;
      totalInvoicedAmount: number;
      totalCreditNotesAppliedAmount?: number;
      creditNotesAppliedCount?: number;
      totalVerifiedAmount: number;
      totalPendingAmount: number;
      totalBalanceAmount: number;
      overdueInvoicesCount?: number;
      overdueBalanceAmount?: number;
      byStatus: Record<string, number>;
    };
    collections: {
      paymentsCount: number;
      totalPaymentsAmount: number;
      byStatus: Record<string, { count: number; amount: number }>;
    };
  };
  invoices: Array<{
    id: string;
    contractId: string;
    contractNumber: string;
    invoiceNumber: string;
    status: string;
    issuedAt: string;
    paymentDueDate?: string | null;
    isOverdue?: boolean;
    overdueDays?: number;
    amounts: {
      grossInvoiced?: number;
      creditNotesApplied?: number;
      total: number;
      verified: number;
      pending: number;
      balance: number;
      currency: string;
    };
    client: {
      id: string;
      fullName: string;
      idNumber: string;
      email: string;
    };
  }>;
  payments: Array<{
    id: string;
    invoiceId: string;
    contractId: string;
    type: string;
    status: string;
    amount: number;
    currency: string;
    reportedAt: string;
    voucherDate?: string | null;
    verifiedAt: string | null;
    bankReference: string | null;
    payerName: string | null;
    createdByName: string;
    verifiedByName: string | null;
    rejectionReason: string | null;
    attachments?: Array<{
      id: string;
      originalFileName: string;
      size: number;
      mimeType: string;
      url: string;
    }>;
    invoice: {
      invoiceNumber: string;
      contractNumber: string;
      status: string;
    };
    client: {
      id: string;
      fullName: string;
      idNumber: string;
      email: string;
    };
    travel?: {
      name: string | null;
      departureDate: string | null;
      returnDate: string | null;
    } | null;
  }>;
  overdueAlerts?: Array<{
    invoiceId: string;
    contractId: string;
    invoiceNumber: string;
    contractNumber: string;
    dueDate: string | null;
    overdueDays: number;
    balanceAmount: number;
    client: {
      id: string;
      fullName: string;
      idNumber: string;
      email: string;
    };
  }>;
};

export type DashboardMetrics = {
  period: string;
  startDate: string;
  currentDate: string;
  summary: {
    invoices: {
      byStatus: Array<{ status: string; count: number }>;
      overdue: number;
    };
    pendingTasks: {
      payments: number;
      receipts: number;
      creditNotes: number;
      total: number;
    };
    period: {
      invoicesCount: number;
      invoicedAmount: number;
      collectedAmount: number;
      balanceAmount: number;
      paymentsCount: number;
      paymentsAmount: number;
    };
  };
  charts: {
    dailyPayments: Array<{
      day: string;
      total: number;
      count: number;
    }>;
  };
  alerts: {
    topOverdueClients: Array<{
      id: string;
      fullName: string;
      email: string;
      totalBalance: number;
      invoiceCount: number;
    }>;
  };
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

export const bootstrapBillingContract = async (contractId: string): Promise<{ created: boolean; invoiceId: string; invoiceNumber: string }> =>
  apiFetchJson<{ created: boolean; invoiceId: string; invoiceNumber: string }>(
    `/billing/contracts/${encodeURIComponent(contractId)}/bootstrap`,
    {
      method: "POST",
    },
  );

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

export const reportBillingPayment = async (input: {
  contractId: string;
  type: "RESERVATION" | "INSTALLMENT" | "OTHER";
  amount: string;
  paymentDate?: string;
  bankReference?: string;
  payerName?: string;
  originBank?: string;
  destinationBank?: string;
  destinationAccount?: string;
  paymentReference?: string;
  notes?: string;
  attachments?: File[];
}): Promise<{ paymentId: string; receiptId: string; receiptNumber: string }> => {
  const { token, apiBase } = getApiBaseAndToken();

  const formData = new FormData();
  formData.append("type", input.type);
  formData.append("amount", input.amount);
  if (input.paymentDate) formData.append("paymentDate", input.paymentDate);
  if (input.bankReference) formData.append("bankReference", input.bankReference);
  if (input.payerName) formData.append("payerName", input.payerName);
  if (input.originBank) formData.append("originBank", input.originBank);
  if (input.destinationBank) formData.append("destinationBank", input.destinationBank);
  if (input.destinationAccount) formData.append("destinationAccount", input.destinationAccount);
  if (input.paymentReference) formData.append("paymentReference", input.paymentReference);
  if (input.notes) formData.append("notes", input.notes);
  (input.attachments || []).forEach((file) => formData.append("attachments", file, file.name));

  const response = await authenticatedFetch(`${apiBase}/billing/contracts/${encodeURIComponent(input.contractId)}/payments/report`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, "No se pudo reportar el abono."));
  }

  return payload as { paymentId: string; receiptId: string; receiptNumber: string };
};

export const markBillingPaymentInReview = async (paymentId: string): Promise<{ ok: boolean; paymentId: string; status: string }> =>
  apiFetchJson<{ ok: boolean; paymentId: string; status: string }>(`/billing/payments/${encodeURIComponent(paymentId)}/review`, {
    method: "POST",
  });

export const verifyBillingPayment = async (paymentId: string): Promise<{ ok: boolean; paymentId: string; status: string }> =>
  apiFetchJson<{ ok: boolean; paymentId: string; status: string }>(`/billing/payments/${encodeURIComponent(paymentId)}/verify`, {
    method: "POST",
  });

export const rejectBillingPayment = async (paymentId: string, reason: string): Promise<{ ok: boolean; paymentId: string; status: string }> =>
  apiFetchJson<{ ok: boolean; paymentId: string; status: string }>(`/billing/payments/${encodeURIComponent(paymentId)}/reject`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });

export const approveAndSendBillingReceipt = async (
  receiptId: string,
  toEmail?: string,
  ccEmail?: string,
): Promise<{ ok: boolean; receiptId: string; receiptNumber: string; status: string; sentToEmail: string; ccEmail: string | null }> =>
  apiFetchJson<{ ok: boolean; receiptId: string; receiptNumber: string; status: string; sentToEmail: string; ccEmail: string | null }>(
    `/billing/receipts/${encodeURIComponent(receiptId)}/approve-send`,
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

export const createBillingCreditNote = async (input: {
  contractId: string;
  reason: string;
  amount: string;
  sourceDocumentType?: string;
  sourceDocumentId?: string;
}): Promise<{ ok: boolean; creditNoteId: string; creditNoteNumber: string; status: string }> =>
  apiFetchJson<{ ok: boolean; creditNoteId: string; creditNoteNumber: string; status: string }>(
    `/billing/contracts/${encodeURIComponent(input.contractId)}/credit-notes`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: input.reason,
        amount: input.amount,
        ...(input.sourceDocumentType ? { sourceDocumentType: input.sourceDocumentType } : {}),
        ...(input.sourceDocumentId ? { sourceDocumentId: input.sourceDocumentId } : {}),
      }),
    },
  );

export const applyBillingCreditNote = async (
  creditNoteId: string,
  notes?: string,
): Promise<{ ok: boolean; creditNoteId: string; status: string; invoiceId: string }> =>
  apiFetchJson<{ ok: boolean; creditNoteId: string; status: string; invoiceId: string }>(
    `/billing/credit-notes/${encodeURIComponent(creditNoteId)}/apply`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notes ? { notes } : {}),
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
  pendingCreditNotes: number;
  contractsPendingSignature: number;
};

export const getPendingApprovalsCount = async (): Promise<PendingCounts> => {
  try {
    const data = await apiFetchJson<PendingCounts>("/billing/admin/pending-counts", {
      method: "GET",
    });
    return data;
  } catch {
    return { pendingReceipts: 0, pendingCreditNotes: 0, contractsPendingSignature: 0 };
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

export const listBillingPendingCreditNotes = async (params: {
  q?: string;
  limit?: number;
} = {}): Promise<BillingPendingCreditNoteItem[]> => {
  const query = new URLSearchParams();
  if (params.q) query.set("q", String(params.q));
  query.set("limit", String(params.limit || 120));

  const payload = await apiFetchJson<{ items?: BillingPendingCreditNoteItem[] }>(
    `/billing/admin/credit-notes/pending?${query.toString()}`,
    {
      method: "GET",
    },
  );

  return Array.isArray(payload.items) ? payload.items : [];
};

export const approveBillingCreditNote = async (
  creditNoteId: string,
  notes?: string,
): Promise<{ ok: boolean; creditNoteId: string; status: string; invoiceId: string }> =>
  apiFetchJson<{ ok: boolean; creditNoteId: string; status: string; invoiceId: string }>(
    `/billing/admin/credit-notes/${encodeURIComponent(creditNoteId)}/approve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notes ? { notes } : {}),
    },
  );

export const rejectBillingCreditNote = async (
  creditNoteId: string,
  reason: string,
): Promise<{ ok: boolean; creditNoteId: string; status: string }> =>
  apiFetchJson<{ ok: boolean; creditNoteId: string; status: string }>(
    `/billing/admin/credit-notes/${encodeURIComponent(creditNoteId)}/reject`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    },
  );

export const getBillingDashboardMetrics = async (params: { period?: string; from?: string; to?: string } = {}): Promise<DashboardMetrics> => {
  const query = new URLSearchParams();
  if (params.period) query.set("period", params.period);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);

  return apiFetchJson<DashboardMetrics>(`/billing/admin/dashboard-metrics?${query.toString()}`, {
    method: "GET",
  });
};

export const getBillingAdminReports = async (params: {
  from?: string;
  to?: string;
  q?: string;
  invoiceStatus?: string;
  paymentStatus?: string;
  limitInvoices?: number;
  limitPayments?: number;
} = {}): Promise<BillingAdminReportData> => {
  const query = new URLSearchParams();
  if (params.from) query.set("from", String(params.from));
  if (params.to) query.set("to", String(params.to));
  if (params.q) query.set("q", String(params.q));
  if (params.invoiceStatus) query.set("invoiceStatus", String(params.invoiceStatus));
  if (params.paymentStatus) query.set("paymentStatus", String(params.paymentStatus));
  query.set("limitInvoices", String(params.limitInvoices || 300));
  query.set("limitPayments", String(params.limitPayments || 600));

  return apiFetchJson<BillingAdminReportData>(`/billing/admin/reports?${query.toString()}`, {
    method: "GET",
  });
};

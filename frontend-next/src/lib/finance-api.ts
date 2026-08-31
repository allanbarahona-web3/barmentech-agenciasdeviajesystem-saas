import { fetchApi } from '@/lib/api-client';

export type AccountReceivableStatus =
  | 'OPEN'
  | 'PARTIALLY_SETTLED'
  | 'SETTLED'
  | 'CANCELLED';

export type FinanceCurrency = 'CRC' | 'USD';

export type AccountReceivableSource = {
  type: string;
  billingDocumentId: string | null;
  sourceId: string;
  sourceNumber: string | null;
  sourceDocumentType: string | null;
};

export type AccountReceivableListItem = {
  id: string;
  customerId: string | null;
  debtorDisplayName: string;
  debtorIdentificationType: string | null;
  debtorIdentificationNumber: string | null;
  currencyCode: FinanceCurrency;
  originalAmount: string;
  outstandingAmount: string;
  dueDate: string;
  status: AccountReceivableStatus;
  isOverdue: boolean;
  recognizedAt: string;
  settledAt: string | null;
  source: AccountReceivableSource;
};

export type AccountReceivableAllocation = {
  id: string;
  paymentId: string;
  amount: string;
  status: 'ACTIVE' | 'REVERSED';
  allocatedAt: string;
  reversal: {
    id: string;
    reason: string;
    reversedAt: string;
  } | null;
};

export type AccountReceivableDetail = Omit<
  AccountReceivableListItem,
  'source'
> & {
  sourceType: string;
  sourceId: string;
  sourceNumber: string | null;
  sourceDocumentType: string | null;
  paymentTermDays: number | null;
  cancelledAt: string | null;
  allocations: AccountReceivableAllocation[];
};

export type AccountReceivablesPage = {
  accountReceivables: AccountReceivableListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ListAccountReceivablesParams = {
  page?: number;
  pageSize?: number;
  customerId?: string;
  status?: AccountReceivableStatus;
  currency?: FinanceCurrency;
  dueDateFrom?: string;
  dueDateTo?: string;
};

export class FinanceApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'FinanceApiError';
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_RECEIVABLE_NOT_FOUND: 'La cuenta por cobrar ya no está disponible.',
  FINANCE_OPERATION_FAILED: 'No se pudo completar la consulta financiera.',
};

function errorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;
  const message = (payload as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join(', ');
  return typeof message === 'string' && message.trim() ? message : fallback;
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetchApi(path, { method: 'GET', signal });
  if (response.ok) return response.json() as Promise<T>;
  const payload: unknown = await response.json().catch(() => null);
  const backendMessage = errorMessage(payload, 'FINANCE_REQUEST_FAILED');
  const code = typeof (payload as { code?: unknown } | null)?.code === 'string'
    ? String((payload as { code: string }).code)
    : backendMessage;
  throw new FinanceApiError(
    code,
    ERROR_MESSAGES[code] ?? 'No se pudo cargar la información de cuentas por cobrar.',
  );
}

export function listAccountReceivables(
  params: ListAccountReceivablesParams,
  signal?: AbortSignal,
): Promise<AccountReceivablesPage> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const suffix = query.size ? `?${query.toString()}` : '';
  return request<AccountReceivablesPage>(`/finance/account-receivables${suffix}`, signal);
}

export function getAccountReceivable(
  id: string,
  signal?: AbortSignal,
): Promise<AccountReceivableDetail> {
  return request<AccountReceivableDetail>(
    `/finance/account-receivables/${encodeURIComponent(id)}`,
    signal,
  );
}

export function formatFinanceMoney(value: string, currency: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return `${currency} ${value}`;
  const whole = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = match[3] ? `.${match[3]}` : '';
  return `${currency} ${match[1]}${whole}${fraction}`;
}

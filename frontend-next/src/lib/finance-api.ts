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
  paymentReceiptNumber: string | null;
  amount: string;
  status: 'ACTIVE' | 'REVERSED';
  allocatedAt: string;
  appliedBy: { userId: string; name: string; at: string } | null;
  reversal: {
    id: string;
    reason: string;
    reversedAt: string;
    reversedBy: { userId: string; name: string; at: string } | null;
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
  unallocatedPaymentAmount: string;
  unallocatedPaymentCount: number;
  hasUnallocatedPayments: boolean;
  allocations: AccountReceivableAllocation[];
};

export type AccountReceivablesPage = {
  accountReceivables: AccountReceivableListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AccountReceivableGroup = {
  groupKey: string;
  customerId: string | null;
  debtor: {
    displayName: string;
    identificationType: string | null;
    identificationNumber: string | null;
  };
  currencyCode: FinanceCurrency;
  totalOriginalAmount: string;
  totalAllocatedAmount: string;
  totalOutstandingAmount: string;
  totalOverdueOutstandingAmount: string;
  totalReceivedAmount: string;
  totalActiveAllocatedAmount: string;
  unallocatedPaymentAmount: string;
  unallocatedPaymentCount: number;
  counts: {
    total: number;
    open: number;
    partiallySettled: number;
    settled: number;
    cancelled: number;
    overdue: number;
  };
};

export type AccountReceivableGroupsPage = {
  groups: AccountReceivableGroup[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type PaymentStatus =
  | 'RECEIVED'
  | 'PARTIALLY_ALLOCATED'
  | 'FULLY_ALLOCATED'
  | 'CANCELLED';

export type PaymentAllocationDetail = {
  id: string;
  accountReceivableId: string;
  amount: string;
  status: 'ACTIVE' | 'REVERSED';
  allocatedAt: string;
  appliedBy: { userId: string; name: string; at: string } | null;
  accountReceivable: {
    id: string;
    sourceNumber: string | null;
    sourceDocumentType: string | null;
    currencyCode: FinanceCurrency;
    originalAmount: string;
    outstandingAmount: string;
    status: AccountReceivableStatus;
  };
  reversal: {
    id: string;
    reason: string;
    reversedAt: string;
    reversedBy: { userId: string; name: string; at: string } | null;
  } | null;
};

export type PaymentDetail = {
  id: string;
  receiptNumber: string;
  customerId: string | null;
  payerDisplayName: string;
  payerIdentificationType: string | null;
  payerIdentificationNumber: string | null;
  currencyCode: FinanceCurrency;
  receivedAmount: string;
  availableAmount: string;
  receivedAt: string;
  paymentMethod: string;
  externalReference: string | null;
  description: string | null;
  status: PaymentStatus;
  cancelledAt: string | null;
  registeredBy: { userId: string; name: string; at: string } | null;
  cancelledBy: { userId: string; name: string; at: string; reason: string | null } | null;
  allocations: PaymentAllocationDetail[];
};

export type PaymentListItem = Omit<PaymentDetail, 'allocations'>;

export type PaymentsPage = {
  payments: PaymentListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AllocationSuggestion = {
  paymentId: string;
  accountReceivableId: string;
  currencyCode: FinanceCurrency;
  paymentAvailableAmount: string;
  accountReceivableOutstandingAmount: string;
  suggestedAmount: string;
  remainingAfterSuggestion: string;
  hasRemainingAfterSuggestion: boolean;
};

export type UnallocatedPaymentBalance = {
  customerId: string;
  debtor: {
    displayName: string;
    identificationType: string | null;
    identificationNumber: string | null;
  };
  currencyCode: FinanceCurrency;
  unallocatedPaymentAmount: string;
  unallocatedPaymentCount: number;
};

export type UnallocatedPaymentBalancesPage = {
  balances: UnallocatedPaymentBalance[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type RegisterPaymentInput = {
  registrationDeduplicationKey: string;
  payerDisplayName: string;
  currencyCode: FinanceCurrency;
  receivedAmount: string;
  receivedAt: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'CHECK' | 'MOBILE_TRANSFER' | 'OTHER';
  customerId?: string;
  payerIdentificationType?: string;
  payerIdentificationNumber?: string;
  externalReference?: string;
  description?: string;
};

export type AllocatePaymentInput = {
  allocations: Array<{
    accountReceivableId: string;
    amount: string;
    allocationDeduplicationKey: string;
  }>;
};
export type ReversePaymentAllocationInput = { reversalDeduplicationKey: string; reason: string };
export type ReversePaymentAllocationResult = { reversal: { id: string; paymentAllocationId: string; reason: string; reversedAt: string }; payment: PaymentDetail };
export type CancelPaymentInput = { reason: string };

export type CustomerFundsAllocationTarget = { accountReceivableId: string; amount: string };
export type CustomerFundsAllocationPreview = {
  customerId: string; currencyCode: FinanceCurrency; totalAvailableAmount: string; totalRequestedAmount: string; remainingAvailableAmount: string;
  targets: Array<{ accountReceivableId: string; requestedAmount: string; currentOutstandingAmount: string; projectedOutstandingAmount: string; resultingStatus?: AccountReceivableStatus }>;
  fundingBreakdown: Array<{ paymentId: string; receiptNumber: string; accountReceivableId: string; amount: string; paymentAllocationId?: string }>;
  commandId?: string;
};
export type CustomerFundsAllocationInput = { customerId: string; currencyCode: FinanceCurrency; portfolioAllocationDeduplicationKey: string; targets: CustomerFundsAllocationTarget[] };

export type CustomerAccountStatement = {
  generatedAt: string;
  customer: { id: string; name: string; identification: string | null; email: string | null };
  currencyCode: FinanceCurrency;
  totals: { invoicedAmount: string; allocatedAmount: string; outstandingAmount: string; availableAmount: string };
  invoices: Array<{ id: string; number: string; documentType: string | null; recognizedAt: string; dueDate: string; originalAmount: string; allocatedAmount: string; outstandingAmount: string; status: AccountReceivableStatus; allocations: Array<{ receiptNumber: string; amount: string; allocatedAt: string; status: 'ACTIVE' | 'REVERSED'; statusLabel: string }> }>;
  payments: Array<{ id: string; receiptNumber: string; receivedAt: string; receivedAmount: string; availableAmount: string; paymentMethod: string; paymentMethodLabel: string; status: PaymentStatus; allocations: Array<{ invoiceNumber: string; amount: string; allocatedAt: string; status: 'ACTIVE' | 'REVERSED'; statusLabel: string }> }>;
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

export type PageParams = {
  page?: number;
  pageSize?: number;
};

export type ListPaymentsParams = PageParams & {
  customerId?: string;
  currency?: FinanceCurrency;
  status?: PaymentStatus;
  availableOnly?: boolean;
};

export class FinanceApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'FinanceApiError';
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_RECEIVABLE_NOT_FOUND: 'La cuenta por cobrar ya no está disponible.',
  ACCOUNT_RECEIVABLE_GROUP_NOT_FOUND: 'El grupo financiero ya no está disponible.',
  PAYMENT_NOT_FOUND: 'El pago ya no está disponible.',
  PAYMENT_OR_ACCOUNT_RECEIVABLE_NOT_FOUND: 'El pago o la cuenta por cobrar ya no está disponible.',
  PAYMENT_NOT_ALLOCATABLE: 'El pago ya no tiene saldo disponible para aplicar.',
  ACCOUNT_RECEIVABLE_NOT_ALLOCATABLE: 'La cuenta por cobrar ya no está disponible para aplicar.',
  PAYMENT_REGISTRATION_INVALID: 'Revise la fecha, moneda, monto y método del pago.',
  PAYMENT_REGISTRATION_CUSTOMER_INVALID: 'El cliente indicado no está disponible.',
  PAYMENT_REGISTRATION_CONFLICT: 'La solicitud de pago ya fue utilizada con información diferente.',
  PAYMENT_ALLOCATION_INVALID: 'Revise las cuentas seleccionadas y los montos por aplicar.',
  PAYMENT_ALLOCATION_PAYMENT_INVALID: 'El pago no está disponible para aplicar.',
  PAYMENT_ALLOCATION_RECEIVABLE_INVALID: 'Una cuenta por cobrar seleccionada ya no está disponible.',
  PAYMENT_ALLOCATION_CURRENCY_MISMATCH: 'La moneda del pago no coincide con una cuenta seleccionada.',
  PAYMENT_ALLOCATION_PAYMENT_INSUFFICIENT: 'El backend rechazó la aplicación porque el pago no tiene saldo disponible suficiente.',
  PAYMENT_ALLOCATION_RECEIVABLE_INSUFFICIENT: 'El backend rechazó la aplicación porque el monto supera el saldo de una cuenta.',
  PAYMENT_ALLOCATION_CONFLICT: 'La solicitud de aplicación ya fue utilizada con información diferente.',
  CUSTOMER_FUNDS_ALLOCATION_INSUFFICIENT: 'El cliente ya no tiene saldo disponible suficiente. Actualice la vista y vuelva a previsualizar.',
  CUSTOMER_FUNDS_ALLOCATION_TARGET_INVALID: 'Una cuenta o monto ya no está disponible. Actualice la vista y vuelva a previsualizar.',
  CUSTOMER_FUNDS_ALLOCATION_DUPLICATE_TARGET: 'Una cuenta por cobrar solo puede incluirse una vez.',
  CUSTOMER_FUNDS_ALLOCATION_IDEMPOTENCY_CONFLICT: 'Esta confirmación ya fue utilizada con una intención diferente.',
  CUSTOMER_ACCOUNT_STATEMENT_NOT_FOUND: 'No se encontró información financiera para este cliente.',
  CUSTOMER_ACCOUNT_STATEMENT_EMAIL_INVALID: 'El cliente no tiene un correo válido. Indique un destinatario.',
  CUSTOMER_ACCOUNT_STATEMENT_CC_INVALID: 'El correo CC no es válido.',
  CUSTOMER_ACCOUNT_STATEMENT_EMAIL_FAILED: 'No se pudo enviar el estado de cuenta.',
  FINANCE_OPERATION_FAILED: 'No se pudo completar la consulta financiera.',
};

function queryString(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return query.size ? `?${query.toString()}` : '';
}

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
  throw new FinanceApiError(code, ERROR_MESSAGES[code] ?? backendMessage);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetchApi(path, { method: 'POST', body: JSON.stringify(body) });
  if (response.ok) return response.json() as Promise<T>;
  const payload: unknown = await response.json().catch(() => null);
  const backendMessage = errorMessage(payload, 'FINANCE_OPERATION_FAILED');
  const code = typeof (payload as { code?: unknown } | null)?.code === 'string'
    ? String((payload as { code: string }).code)
    : backendMessage;
  throw new FinanceApiError(code, ERROR_MESSAGES[code] ?? backendMessage);
}

export function listAccountReceivables(
  params: ListAccountReceivablesParams,
  signal?: AbortSignal,
): Promise<AccountReceivablesPage> {
  const suffix = queryString(params);
  return request<AccountReceivablesPage>(`/finance/account-receivables${suffix}`, signal);
}

export function listAccountReceivableGroups(
  params: PageParams,
  signal?: AbortSignal,
): Promise<AccountReceivableGroupsPage> {
  return request<AccountReceivableGroupsPage>(
    `/finance/account-receivable-groups${queryString(params)}`,
    signal,
  );
}

export function listAccountReceivableGroupItems(
  groupKey: string,
  params: PageParams,
  signal?: AbortSignal,
): Promise<AccountReceivablesPage & { groupKey: string }> {
  return request<AccountReceivablesPage & { groupKey: string }>(
    `/finance/account-receivable-groups/${encodeURIComponent(groupKey)}/account-receivables${queryString(params)}`,
    signal,
  );
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

export function listPayments(
  params: ListPaymentsParams,
  signal?: AbortSignal,
): Promise<PaymentsPage> {
  return request<PaymentsPage>(`/finance/payments${queryString(params)}`, signal);
}

export function getPayment(id: string, signal?: AbortSignal): Promise<PaymentDetail> {
  return request<PaymentDetail>(`/finance/payments/${encodeURIComponent(id)}`, signal);
}

export function getAllocationSuggestion(
  paymentId: string,
  accountReceivableId: string,
  signal?: AbortSignal,
): Promise<AllocationSuggestion> {
  return request<AllocationSuggestion>(
    `/finance/payments/${encodeURIComponent(paymentId)}/allocation-suggestions/${encodeURIComponent(accountReceivableId)}`,
    signal,
  );
}

export function listUnallocatedPaymentBalances(
  params: PageParams,
  signal?: AbortSignal,
): Promise<UnallocatedPaymentBalancesPage> {
  return request<UnallocatedPaymentBalancesPage>(
    `/finance/unallocated-payment-balances${queryString(params)}`,
    signal,
  );
}

export function registerPayment(input: RegisterPaymentInput): Promise<PaymentDetail> {
  return post<PaymentDetail>('/finance/payments', input);
}

export function allocatePayment(
  paymentId: string,
  input: AllocatePaymentInput,
): Promise<PaymentDetail> {
  return post<PaymentDetail>(
    `/finance/payments/${encodeURIComponent(paymentId)}/allocations`,
    input,
  );
}

export function reversePaymentAllocation(paymentAllocationId: string, input: ReversePaymentAllocationInput): Promise<ReversePaymentAllocationResult> {
  return post<ReversePaymentAllocationResult>(`/finance/payment-allocations/${encodeURIComponent(paymentAllocationId)}/reversal`, input);
}

export function cancelPayment(paymentId: string, input: CancelPaymentInput): Promise<PaymentDetail> {
  return post<PaymentDetail>(`/finance/payments/${encodeURIComponent(paymentId)}/cancellation`, input);
}

export function previewCustomerFundsAllocation(input: Omit<CustomerFundsAllocationInput, 'portfolioAllocationDeduplicationKey'>): Promise<CustomerFundsAllocationPreview> {
  return post<CustomerFundsAllocationPreview>('/finance/customer-funds/allocation-preview', input);
}

export function allocateCustomerFunds(input: CustomerFundsAllocationInput): Promise<CustomerFundsAllocationPreview> {
  return post<CustomerFundsAllocationPreview>('/finance/customer-funds/allocations', input);
}

export function getCustomerAccountStatement(customerId: string, currencyCode: FinanceCurrency, signal?: AbortSignal): Promise<CustomerAccountStatement> {
  return request<CustomerAccountStatement>(`/finance/customers/${encodeURIComponent(customerId)}/account-statement${queryString({ currencyCode })}`, signal);
}

export async function downloadCustomerAccountStatement(customerId: string, currencyCode: FinanceCurrency): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetchApi(`/finance/customers/${encodeURIComponent(customerId)}/account-statement/pdf${queryString({ currencyCode })}`, { method: 'GET' });
  if (!response.ok) throw new FinanceApiError('CUSTOMER_ACCOUNT_STATEMENT_PDF_FAILED', 'No se pudo generar el PDF del estado de cuenta.');
  const disposition = response.headers.get('content-disposition') ?? '';
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `estado-cuenta-${customerId}-${currencyCode}.pdf`;
  return { blob: await response.blob(), fileName };
}

export function sendCustomerAccountStatement(customerId: string, input: { currencyCode: FinanceCurrency; to?: string; cc?: string }): Promise<{ ok: true; sentTo: string; cc: string | null; emailId: string | null }> {
  return post(`/finance/customers/${encodeURIComponent(customerId)}/account-statement/email`, input);
}

export function formatFinanceMoney(value: string, currency: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return `${currency} ${value}`;
  const whole = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = match[3] ? `.${match[3]}` : '';
  return `${currency} ${match[1]}${whole}${fraction}`;
}

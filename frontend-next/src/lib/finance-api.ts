import { fetchApi } from '@/lib/api-client';
import { contractReservationApprovePath, contractReservationEvidencePath, contractReservationPendingPath, contractReservationRejectPath, invoicePendingPaymentDetailPath, invoicePendingPaymentPrecheckPath } from '@/lib/contract-reservation-review';
import type { FinancePaymentMethod } from '@/lib/finance-payment-methods';

export type AccountReceivableStatus =
  | 'OPEN'
  | 'PARTIALLY_SETTLED'
  | 'SETTLED'
  | 'CANCELLED';

export type FinanceCurrency = 'CRC' | 'USD';

export type CommercialObligationStatus =
  | 'OPEN'
  | 'PARTIALLY_SETTLED'
  | 'SETTLED'
  | 'CANCELLED';

export type ContractCommercialObligation = {
  id: string;
  currencyCode: FinanceCurrency;
  originalAmount: string;
  outstandingAmount: string;
  status: CommercialObligationStatus;
  dueDate: string | null;
  settledAt: string | null;
};

export type ContractCommercialObligationResult = {
  contractId: string;
  commercialObligation: ContractCommercialObligation | null;
  payable: boolean;
};

export type ContractObligationGroup = {
  groupKey: string;
  customerId: string;
  debtor: {
    displayName: string;
    identificationType: string | null;
    identificationNumber: string | null;
  };
  currencyCode: FinanceCurrency;
  totalOriginalAmount: string;
  totalPaidAmount: string;
  totalOutstandingAmount: string;
  counts: {
    total: number;
    open: number;
    partiallySettled: number;
    settled: number;
    cancelled: number;
    overdue: number;
  };
};

export type ContractObligationGroupsPage = {
  items: ContractObligationGroup[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ContractObligationTravelContext = {
  source: string;
  destination: string | null;
  travelPackageId: string | null;
  internalTripId: string | null;
  travelType: string | null;
};

export type ContractObligationPortfolioItem = {
  contractId: string;
  contractNumber: string;
  travelLabel: string | null;
  travelContext: ContractObligationTravelContext;
  startDate: string | null;
  endDate: string | null;
  currencyCode: FinanceCurrency;
  originalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  dueDate: string | null;
  status: CommercialObligationStatus;
  isOverdue: boolean;
  settledAt: string | null;
  paymentCount: number;
};

export type ContractObligationGroupContractsPage = {
  groupKey: string;
  items: ContractObligationPortfolioItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ContractPaymentPurpose =
  | 'CONTRACT_RESERVATION'
  | 'CONTRACT_PAYMENT'
  | 'CONTRACT_INSTALLMENT';

export type ContractPaymentStatus =
  | 'PENDING_VERIFICATION'
  | 'RECEIVED'
  | 'PARTIALLY_ALLOCATED'
  | 'FULLY_ALLOCATED'
  | 'REJECTED'
  | 'CANCELLED';

export type ContractPaymentHistoryItem = {
  id: string;
  receiptNumber: string | null;
  purpose: ContractPaymentPurpose;
  status: ContractPaymentStatus;
  receivedAmount: string;
  availableAmount: string;
  currencyCode: FinanceCurrency;
  paymentMethod: string;
  receivedAt: string;
  externalReference: string | null;
  description: string | null;
  commercialAllocation: {
    id: string;
    amount: string;
    status: 'ACTIVE' | 'REVERSED';
    allocatedAt: string;
    reversedAt: string | null;
    reversalReason: string | null;
  } | null;
  receiptAvailable: boolean;
  fiscalDocument: {
    id: string;
    internalNumber: string;
    fiscalNumber: string | null;
    documentTypeCode: string;
    lifecycleStatus: string;
    providerStatus: string;
    taxAuthorityStatus: string;
    issuedAt: string | null;
  } | null;
};

export type ContractPaymentsPage = {
  items: ContractPaymentHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type RegisterContractInstallmentInput = {
  registrationDeduplicationKey: string;
  amount: string;
  receivedAt: string;
  paymentMethod: FinancePaymentMethod;
  externalReference?: string;
  description?: string;
};

export type RegisterContractInstallmentResult = {
  payment: {
    id: string;
    receiptNumber: string;
    amount: string;
    currencyCode: FinanceCurrency;
    paymentMethod: FinancePaymentMethod;
    status: PaymentStatus;
  };
  obligation: {
    id: string;
    outstandingAmount: string;
    status: CommercialObligationStatus;
  };
};

export type ContractReservationEvidence = {
  id: string;
  originalFileName: string;
  mimeType: string;
  size: number;
};

export type ContractReservationPayment = {
  reviewKind?: 'CONTRACT';
  id: string;
  customerId: string | null;
  contractId: string;
  currencyCode: string;
  receivedAmount: string;
  availableAmount: string;
  receivedAt: string;
  paymentMethod: string;
  externalReference: string | null;
  description: string | null;
  purpose: 'CONTRACT_RESERVATION';
  status: 'PENDING_VERIFICATION';
  receiptNumber: null;
  evidence: ContractReservationEvidence[];
  contract: {
    id: string;
    contractNumber: string;
    status: string;
    destination: string;
    clientId: string;
    client: { id: string; fullName: string; idNumber: string; email: string; phone: string | null };
    travelPackage: { id: string; name: string; departureDate: string; returnDate: string } | null;
    internalTrip: { id: string; name: string; departureDate: string; returnDate: string } | null;
  };
};

export type ContractReservationEvidenceAccess = ContractReservationEvidence & { url: string };

export type InvoicePendingPaymentTarget = {
  accountReceivableId: string;
  intendedAmount: string;
  billingDocumentId: string | null;
  fiscalNumber: string | null;
  reference: string | null;
  issuedAt: string | null;
  currentOriginalAmount: string | null;
  currentOutstandingAmount: string | null;
  currentCurrencyCode: string | null;
  currentStatus: AccountReceivableStatus | null;
};

export type InvoicePendingPaymentReview = {
  id: string;
  reviewKind: 'INVOICES';
  customerId: string | null;
  customer: { id: string | null; fullName: string; idNumber: string | null; email: string | null; phone: string | null };
  currencyCode: string;
  receivedAmount: string;
  availableAmount: string;
  receivedAt: string;
  paymentMethod: string;
  externalReference: string | null;
  description: string | null;
  status: 'PENDING_VERIFICATION';
  receiptNumber: null;
  reviewer: { reviewedAt: string | null; reviewedByUserId: string | null; reviewedByName: string | null; rejectionReason: string | null };
  allocationProposal: { kind: 'INVOICES'; targets: Array<{ targetType: 'ACCOUNT_RECEIVABLE'; targetId: string; intendedAmount: string }> } | null;
  targets: InvoicePendingPaymentTarget[];
  /** Optional until the review read exposes PaymentEvidence metadata. */
  evidence?: ContractReservationEvidence[];
};

export type PendingPaymentReviewItem = ContractReservationPayment | InvoicePendingPaymentReview;

export type InvoicePendingPaymentPrecheck = {
  ok: true;
  paymentId: string;
  status: 'PENDING_VERIFICATION';
  customerId: string | null;
  currencyCode: string;
  amount: string;
  allocationProposal: NonNullable<InvoicePendingPaymentReview['allocationProposal']>;
  targets: InvoicePendingPaymentTarget[];
};

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
  appliedAmount: string;
  availableAmount: string;
  canCancel: boolean;
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
  paymentMethod: FinancePaymentMethod;
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
export type RegisterPaymentAndApplyResult = { payment: { id: string; receiptNumber: string; receivedAmount: string; availableAmount: string; status: PaymentStatus }; allocation: { accountReceivableId: string; sourceNumber: string | null; amount: string; outstandingAmount: string; status: AccountReceivableStatus } };
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
  charges: Array<{ id: string; sourceType: 'ACCOUNT_RECEIVABLE' | 'CONTRACT_OBLIGATION'; sourceId: string; reference: string; description: string; recognizedAt: string; dueDate: string | null; originalAmount: string; allocatedAmount: string; outstandingAmount: string; status: AccountReceivableStatus | CommercialObligationStatus; allocations: Array<{ receiptNumber: string; amount: string; allocatedAt: string; status: 'ACTIVE' | 'REVERSED'; statusLabel: string; purpose?: string; purposeLabel?: string; reversedAt?: string | null; reversalReason?: string | null }> }>;
  payments: Array<{ id: string; receiptNumber: string; receivedAt: string; receivedAmount: string; availableAmount: string; paymentMethod: string; paymentMethodLabel: string; purpose: string; purposeLabel: string; status: PaymentStatus; allocations: Array<{ sourceType: 'ACCOUNT_RECEIVABLE' | 'CONTRACT_OBLIGATION'; reference: string; amount: string; allocatedAt: string; status: 'ACTIVE' | 'REVERSED'; statusLabel: string; reversedAt: string | null; reversalReason: string | null }> }>;
};

export type CustomerFinancialSummary = {
  customerId: string;
  baseCurrencyCode: FinanceCurrency;
  consolidated: {
    totalContracted: string;
    totalInvoiced: string;
    totalPaid: string;
    outstanding: string;
    available: string;
  } | null;
  currencies: Array<{
    currencyCode: FinanceCurrency;
    totalContracted: string;
    totalInvoiced: string;
    totalPaid: string;
    outstanding: string;
    available: string;
  }>;
  exchangeRateContext: {
    source: 'MANUAL' | 'BCCR';
    effectiveDate: string;
    status: 'AVAILABLE' | 'MISSING' | 'NOT_REQUIRED';
  } | null;
};

export type CustomerElectronicInvoiceFinancialStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED' | 'NOT_APPLICABLE';

export type CustomerElectronicInvoice = {
  billingDocumentId: string;
  fiscalNumber: string | null;
  documentType: string;
  issuedAt: string | null;
  sourceType: string | null;
  sourceId: string | null;
  sourceNumber: string | null;
  internalNumber: string;
  currencyCode: FinanceCurrency;
  total: string;
  taxAuthorityStatus: 'ACCEPTED';
  financialStatus: CustomerElectronicInvoiceFinancialStatus;
  financialOutstanding: string | null;
  financialDetail: { type: 'ACCOUNT_RECEIVABLE'; accountReceivableId: string } | { type: 'CONTRACT'; contractId: string } | null;
};

export type CustomerElectronicInvoicesPage = {
  invoices: CustomerElectronicInvoice[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CustomerInvoicePaymentTarget = {
  accountReceivableId: string;
  billingDocumentId: string;
  fiscalNumber: string | null;
  reference: string;
  issuedAt: string | null;
  currencyCode: FinanceCurrency;
  originalAmount: string;
  appliedAmount: string;
  outstandingAmount: string;
  financialStatus: 'PENDING' | 'PARTIALLY_PAID';
};

export type ReportedInvoicePaymentInput = {
  currencyCode: FinanceCurrency;
  amount: string;
  paymentMethod?: FinancePaymentMethod;
  paymentDate?: string;
  reference?: string;
  payerName?: string;
  notes?: string;
  targets: Array<{ accountReceivableId: string; intendedAmount: string }>;
};

export type ReportedInvoicePaymentResult = {
  paymentId: string;
  status: 'PENDING_VERIFICATION';
  receiptNumber: null;
  currencyCode: FinanceCurrency;
  amount: string;
  availableAmount: string;
  allocationProposal: { kind: 'INVOICES'; targets: Array<{ targetType: 'ACCOUNT_RECEIVABLE'; targetId: string; intendedAmount: string }> };
};

export type PendingPaymentEvidence = {
  id: string;
  paymentId: string;
  originalFileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  extractionMetadata?: {
    destinationValidation?: PaymentDestinationValidation;
  };
};

export type PaymentDestinationValidation = {
  status: 'MATCHED' | 'UNMATCHED' | 'UNKNOWN' | 'AMBIGUOUS';
  reason: 'NOT_REGISTERED' | 'INACTIVE' | 'AMBIGUOUS' | 'NO_IDENTIFIER' | null;
  matchedAccount: {
    id: string;
    bankName: string;
    maskedAccountNumber: string | null;
    maskedSinpeNumber: string | null;
    currencyCode?: string | null;
  } | null;
  bankNameMatches: boolean | null;
  evaluatedAt?: string;
  overrideAccepted?: boolean;
  overrideAcceptedByUserId?: string | null;
  overrideAcceptedByName?: string | null;
  overrideAcceptedAt?: string | null;
  overrideReason?: string | null;
};

export type CustomerPaymentSettlementPreview = {
  status: 'AVAILABLE' | 'MISSING';
  receivedCurrencyCode: FinanceCurrency;
  receivedAmount: string;
  settlementCurrencyCode: FinanceCurrency;
  settlementAmount: string | null;
  exchangeRate: string | null;
  exchangeRateSource: 'MANUAL' | 'BCCR' | null;
  exchangeRateEffectiveDate: string | null;
};

export type FinancePaymentEvidenceExtraction = {
  extractedData: {
    amount?: number;
    currency?: string;
    date?: string;
    reference?: string;
    originBank?: string;
    destinationBank?: string;
    destinationAccount?: string;
    payerName?: string;
    paymentCode?: string;
    notes?: string;
    confidence?: number;
  };
  destinationValidation: PaymentDestinationValidation;
  warnings: string[];
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
  PAYMENT_RECEIPT_EMAIL_INVALID: 'El cliente no tiene un correo válido. Indique un destinatario.',
  PAYMENT_RECEIPT_CC_INVALID: 'El correo CC no es válido.',
  PAYMENT_RECEIPT_EMAIL_FAILED: 'No se pudo enviar el recibo.',
  FINANCE_OPERATION_FAILED: 'No se pudo completar la consulta financiera.',
  CONTRACT_RESERVATION_PAYMENT_NOT_FOUND: 'El pago de reserva ya no está disponible.',
  CONTRACT_RESERVATION_REVIEW_ALREADY_DECIDED: 'Este pago de reserva ya fue revisado.',
  CONTRACT_RESERVATION_REVIEW_CONFLICT: 'El pago cambió mientras se procesaba. Actualice la lista.',
  CONTRACT_RESERVATION_REVIEW_STATE_CONFLICT: 'El pago tiene un estado de revisión incompatible.',
  CONTRACT_RESERVATION_PENDING_STATE_INVALID: 'El pago pendiente ya no tiene un estado válido para revisión.',
  CONTRACT_RESERVATION_EVIDENCE_NOT_FOUND: 'El comprobante ya no está disponible.',
  CONTRACT_RESERVATION_CAPACITY_UNAVAILABLE: 'Ya no hay capacidad suficiente para aprobar esta reserva.',
  CONTRACT_INSTALLMENT_PAYMENT_METHOD_INVALID: 'Método de pago inválido.',
  CONTRACT_INSTALLMENT_AMOUNT_INVALID: 'El monto del abono no es válido.',
  CONTRACT_INSTALLMENT_AMOUNT_EXCEEDS_OUTSTANDING: 'El abono no puede superar el saldo pendiente.',
  CONTRACT_INSTALLMENT_CONTRACT_STATE_CONFLICT: 'El contrato no permite registrar abonos en su estado actual.',
  CONTRACT_INSTALLMENT_OBLIGATION_NOT_FOUND: 'No se encontró una obligación financiera para este contrato.',
  CONTRACT_INSTALLMENT_OBLIGATION_STATE_CONFLICT: 'La obligación financiera ya no admite abonos.',
  CONTRACT_INSTALLMENT_CUSTOMER_MISMATCH: 'La obligación financiera no coincide con el cliente del contrato.',
  CONTRACT_INSTALLMENT_CURRENCY_MISMATCH: 'La moneda de la obligación no coincide con el contrato.',
  CONTRACT_INSTALLMENT_CONFLICT: 'El abono no pudo registrarse por un conflicto financiero.',
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

async function upload<T>(path: string, file: File, fields?: Record<string, string>): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);
  for (const [key, value] of Object.entries(fields ?? {})) formData.append(key, value);
  const response = await fetchApi(path, { method: 'POST', body: formData });
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

export function listContractObligationGroups(
  params: PageParams,
  signal?: AbortSignal,
): Promise<ContractObligationGroupsPage> {
  return request<ContractObligationGroupsPage>(
    `/finance/contract-obligation-groups${queryString(params)}`,
    signal,
  );
}

export function listContractObligationGroupContracts(
  groupKey: string,
  params: PageParams,
  signal?: AbortSignal,
): Promise<ContractObligationGroupContractsPage> {
  return request<ContractObligationGroupContractsPage>(
    `/finance/contract-obligation-groups/${encodeURIComponent(groupKey)}/contracts${queryString(params)}`,
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

export function getContractCommercialObligation(
  contractId: string,
  signal?: AbortSignal,
): Promise<ContractCommercialObligationResult> {
  return request<ContractCommercialObligationResult>(
    `/finance/contracts/${encodeURIComponent(contractId)}/commercial-obligation`,
    signal,
  );
}

export function listContractPayments(
  contractId: string,
  params: PageParams,
  signal?: AbortSignal,
): Promise<ContractPaymentsPage> {
  return request<ContractPaymentsPage>(
    `/finance/contracts/${encodeURIComponent(contractId)}/payments${queryString(params)}`,
    signal,
  );
}

export function registerContractInstallment(
  contractId: string,
  input: RegisterContractInstallmentInput,
): Promise<RegisterContractInstallmentResult> {
  return post<RegisterContractInstallmentResult>(
    `/finance/contracts/${encodeURIComponent(contractId)}/installments`,
    input,
  );
}

export async function downloadPaymentReceipt(paymentId: string): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetchApi(`/finance/payments/${encodeURIComponent(paymentId)}/receipt`, { method: 'GET' });
  if (!response.ok) throw new FinanceApiError('PAYMENT_RECEIPT_PDF_FAILED', 'No se pudo generar el PDF del recibo.');
  const disposition = response.headers.get('content-disposition') ?? '';
  return { blob: await response.blob(), fileName: /filename="([^"]+)"/.exec(disposition)?.[1] ?? `recibo-${paymentId}.pdf` };
}

export function sendPaymentReceipt(paymentId: string, input: { to?: string; cc?: string }): Promise<{ ok: true; sentTo: string; cc: string | null; emailId: string | null }> {
  return post(`/finance/payments/${encodeURIComponent(paymentId)}/receipt/email`, input);
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

export function registerPaymentAndApply(accountReceivableId: string, input: RegisterPaymentInput): Promise<RegisterPaymentAndApplyResult> {
  return post<RegisterPaymentAndApplyResult>(`/finance/account-receivables/${encodeURIComponent(accountReceivableId)}/payments`, input);
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

export function getCustomerFinancialSummary(customerId: string, signal?: AbortSignal): Promise<CustomerFinancialSummary> {
  return request<CustomerFinancialSummary>(`/finance/customers/${encodeURIComponent(customerId)}/financial-summary`, signal);
}

export function listCustomerElectronicInvoices(customerId: string, params: PageParams = {}, signal?: AbortSignal): Promise<CustomerElectronicInvoicesPage> {
  return request<CustomerElectronicInvoicesPage>(`/finance/customers/${encodeURIComponent(customerId)}/electronic-invoices${queryString(params)}`, signal);
}

export function listCustomerInvoicePaymentTargets(customerId: string, currencyCode: FinanceCurrency, signal?: AbortSignal): Promise<{ targets: CustomerInvoicePaymentTarget[] }> {
  return request<{ targets: CustomerInvoicePaymentTarget[] }>(`/finance/customers/${encodeURIComponent(customerId)}/payment-targets/invoices${queryString({ currencyCode })}`, signal);
}

export function getCustomerPaymentSettlementPreview(
  customerId: string,
  input: { receivedCurrencyCode: FinanceCurrency; settlementCurrencyCode: FinanceCurrency; receivedAmount: string },
  signal?: AbortSignal,
): Promise<CustomerPaymentSettlementPreview> {
  return request<CustomerPaymentSettlementPreview>(
    `/finance/customers/${encodeURIComponent(customerId)}/payment-settlement-preview${queryString(input)}`,
    signal,
  );
}

export function submitReportedInvoicePayment(customerId: string, input: ReportedInvoicePaymentInput): Promise<ReportedInvoicePaymentResult> {
  return post<ReportedInvoicePaymentResult>(`/finance/customers/${encodeURIComponent(customerId)}/reported-payments/invoices`, input);
}

export function extractReportedInvoicePaymentEvidence(customerId: string, file: File): Promise<FinancePaymentEvidenceExtraction> {
  return upload<FinancePaymentEvidenceExtraction>(`/finance/customers/${encodeURIComponent(customerId)}/reported-payments/invoices/evidence/extract`, file);
}

export function attachReportedInvoicePaymentEvidence(
  customerId: string,
  paymentId: string,
  file: File,
  extractionMetadata?: Pick<FinancePaymentEvidenceExtraction['extractedData'], 'destinationAccount' | 'destinationBank' | 'reference' | 'paymentCode' | 'confidence'>,
): Promise<PendingPaymentEvidence> {
  return upload<PendingPaymentEvidence>(
    `/finance/customers/${encodeURIComponent(customerId)}/reported-payments/${encodeURIComponent(paymentId)}/evidence`,
    file,
    extractionMetadata ? { extractionMetadata: JSON.stringify(extractionMetadata) } : undefined,
  );
}

export function acceptReportedInvoicePaymentDestinationOverride(
  customerId: string,
  paymentId: string,
  evidenceId: string,
  input: { reason?: string } = {},
): Promise<PaymentDestinationValidation> {
  return post<PaymentDestinationValidation>(
    `/finance/customers/${encodeURIComponent(customerId)}/reported-payments/${encodeURIComponent(paymentId)}/evidence/${encodeURIComponent(evidenceId)}/destination-override`,
    input,
  );
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

export function listPendingContractReservationPayments(limit = 100, signal?: AbortSignal): Promise<{ payments: PendingPaymentReviewItem[] }> {
  return request<{ payments: PendingPaymentReviewItem[] }>(`${contractReservationPendingPath()}${queryString({ limit })}`, signal);
}

export function getInvoicePendingPaymentReviewDetail(paymentId: string, signal?: AbortSignal): Promise<InvoicePendingPaymentReview> {
  return request<InvoicePendingPaymentReview>(invoicePendingPaymentDetailPath(paymentId), signal);
}

export function precheckInvoicePendingPaymentApproval(paymentId: string): Promise<InvoicePendingPaymentPrecheck> {
  return post<InvoicePendingPaymentPrecheck>(invoicePendingPaymentPrecheckPath(paymentId), {});
}

export function approveContractReservationPayment(paymentId: string): Promise<{ ok: true; paymentId: string; status: 'RECEIVED' | 'PARTIALLY_ALLOCATED' | 'FULLY_ALLOCATED'; receiptNumber: string | null }> {
  return post(contractReservationApprovePath(paymentId), {});
}

export function rejectContractReservationPayment(paymentId: string, reason: string): Promise<{ ok: true; paymentId: string; status: 'REJECTED' }> {
  return post(contractReservationRejectPath(paymentId), { reason });
}

export function getContractReservationEvidence(paymentId: string, evidenceId: string, signal?: AbortSignal): Promise<ContractReservationEvidenceAccess> {
  return request<ContractReservationEvidenceAccess>(contractReservationEvidencePath(paymentId, evidenceId), signal);
}

export function getReportedInvoicePaymentEvidence(customerId: string, paymentId: string, evidenceId: string, signal?: AbortSignal): Promise<ContractReservationEvidenceAccess> {
  return request<ContractReservationEvidenceAccess>(`/finance/customers/${encodeURIComponent(customerId)}/reported-payments/${encodeURIComponent(paymentId)}/evidence/${encodeURIComponent(evidenceId)}`, signal);
}

export function formatFinanceMoney(value: string, currency: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return `${currency} ${value}`;
  const whole = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = match[3] ? `.${match[3]}` : '';
  return `${currency} ${match[1]}${whole}${fraction}`;
}

/** Presentation-only, Decimal-string rounding for Customer Profile amounts. */

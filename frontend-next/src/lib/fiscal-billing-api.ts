import { fetchApi } from '@/lib/api-client';

export type FiscalBillingErrorDetails = Record<string, unknown>;

export class FiscalBillingApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: FiscalBillingErrorDetails,
    public readonly backendMessage?: string,
  ) {
    super(message);
    this.name = 'FiscalBillingApiError';
  }
}

export type ExistingPrimaryDocumentSummary = {
  id: string;
  internalNumber: string;
  lifecycleStatus: string;
  documentTypeCode: string;
};

export type EligibleSalesOrderAction = 'START' | 'RESUME' | 'VIEW';

export type EligibleSalesOrder = {
  id: string;
  orderNumber: string;
  status: string;
  sourceType: string;
  customerName: string;
  customerEmail: string | null;
  currency: string;
  commercialSubtotal: string;
  totalVat: string;
  total: string;
  createdAt: string;
  existingPrimaryDocument: (ExistingPrimaryDocumentSummary & {
    sourceId: string | null;
  }) | null;
  fiscalStatus: {
    lifecycleStatus: string;
    providerStatus: string;
    taxAuthorityStatus: string;
  } | null;
  action: EligibleSalesOrderAction;
};

export type EligibleSalesOrdersPage = {
  salesOrders: EligibleSalesOrder[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type FiscalBillingIssue = {
  code: string;
  blocking: boolean;
  lineId?: string;
  details?: string[];
};

export type LineFiscalReadiness = {
  status: 'READY' | 'MISSING' | 'INACTIVE' | 'INVALID';
  issues: string[];
  profile: {
    cabysCode: string;
    unitOfMeasureCode: string;
    taxCode: string | null;
    taxRateCode: string | null;
    taxPercentage: string | null;
  } | null;
};

export type FiscalPreparationLine = {
  id: string;
  additionalServiceCatalogId: string | null;
  serviceCode: string;
  serviceName: string;
  description: string;
  serviceDetailsVersion: number | null;
  serviceDetails: unknown;
  commercialNotes: string | null;
  subtotal: string;
  vatPercentage: string;
  vatAmount: string;
  total: string;
  participants: unknown;
  fiscalReadiness: LineFiscalReadiness;
};

export type FiscalIssuerChoice = {
  id: string;
  displayName: string;
  legalName: string;
  identificationTypeCode: string;
  identificationNumber: string;
  economicActivities: Array<{
    economicActivityCode: string;
    description: string | null;
    isPrimary: boolean;
    displayOrder: number;
  }>;
};

export type FiscalPreparation = {
  source: {
    id: string;
    number: string;
    sourceType: string;
    status: string;
  };
  eligible: true;
  customer: {
    name: string;
    email: string | null;
    receiverIdentificationTypeCode: '01' | '02' | '03' | '04' | null;
    receiverIdentificationNumber: string | null;
    receiverFiscalIdentityComplete: boolean;
    receiverFiscalIdentityStatus: 'COMPLETE' | 'INCOMPLETE' | 'UNSUPPORTED';
  };
  currency: string;
  paymentCondition: {
    type: string | null;
    termValue: number | null;
    termUnit: string | null;
  };
  commercialObservations: string | null;
  totals: {
    commercialSubtotal: string;
    commercialVat: string;
    commercialTotal: string;
    calculatedSubtotal: string;
    calculatedVat: string;
    calculatedTotal: string;
  };
  lines: FiscalPreparationLine[];
  billingConfiguration:
    | {
        found: true;
        billingEnabled: boolean;
        electronicProviderEnabled: boolean;
        countryCode: string;
        schemaVersion: string;
      }
    | {
        found: false;
        billingEnabled: false;
        electronicProviderEnabled: false;
      };
  issuerChoices: FiscalIssuerChoice[];
  documentTypeChoices: Array<{ code: string; label: string }>;
  existingPrimaryDocument: ExistingPrimaryDocumentSummary | null;
  issues: FiscalBillingIssue[];
  canCreateDraft: boolean;
  nextAction: 'CREATE' | 'RESUME' | 'VIEW';
};

export type CreateBillingDraftInput = {
  fiscalIssuerId: string;
  documentTypeCode: '01' | '04';
  receiverIdentificationTypeCode?: '01' | '02' | '03' | '04';
  receiverIdentificationNumber?: string;
  paymentMethodCodes: string[];
};

export type BillingDocumentWorkspaceTaxExemption = {
  id: string; documentTypeCode: string; documentNumber: string;
  legalArticle: string | null; legalSection: string | null;
  issuingInstitutionCode: string | null; issuingInstitutionName: string | null;
  otherInstitutionDescription: string | null; issueDate: string;
  exemptedPercentage: string; exemptedAmount: string;
};
export type BillingDocumentWorkspaceTax = {
  id: string; taxOrder: number; taxCode: string; rateCode: string;
  ratePercentage: string; taxableBase: string; taxAmount: string;
  calculationFactor: string | null; netTaxAmount: string;
  exemption: BillingDocumentWorkspaceTaxExemption | null;
};
export type BillingDocumentWorkspaceLine = {
  id: string; lineNumber: number; cabysCode: string | null; itemCode: string | null;
  description: string; quantity: string; unitOfMeasureCode: string; unitPrice: string;
  grossAmount: string; discountAmount: string; discountCode: string | null;
  discountReason: string | null; taxableBase: string; taxAmount: string;
  exoneratedTaxAmount: string; netTaxAmount: string; lineSubtotal: string;
  lineTotal: string; taxes: BillingDocumentWorkspaceTax[];
};
export type BillingDocumentWorkspace = {
  id: string; billingMode: string; internalNumber: string; documentTypeCode: string;
  sourceType: string | null; sourceId: string | null; sourceNumber: string | null; sourceRole: string;
  schemaVersion: string; countryCode: string; currencyCode: string; exchangeRate: string | null;
  fiscalEmissionAt: string | null; fiscalIssueDate: string | null; dueDate: string | null;
  confirmedAt: string | null; submittedAt: string | null; issuedAt: string | null;
  createdAt: string; updatedAt: string; paymentConditionCode: string | null; creditTermDays: number | null;
  lifecycleStatus: string; providerStatus: string; taxAuthorityStatus: string; artifactStatus: string;
  fiscalNumber: string | null; allocatedSequenceNumber: string | null; haciendaKey: string | null;
  haciendaRejectionDetail: string | null; providerEnvironment: string | null;
  providerDocumentId: string | null; providerLastErrorCode: string | null; providerLastErrorAt: string | null;
  issuerName: string; issuerIdentificationType: string; issuerIdentification: string;
  issuerEconomicActivityCode: string | null; issuerEstablishmentCode: string | null; issuerTerminalCode: string | null;
  issuerEmail: string | null; issuerPhone: string | null; issuerAddressSnapshot: unknown;
  receiverName: string | null; receiverIdentificationType: string | null; receiverIdentification: string | null;
  receiverEconomicActivityCode: string | null; receiverEmail: string | null; receiverPhone: string | null; receiverAddressSnapshot: unknown;
  grossSubtotal: string; discountTotal: string; taxableTotal: string; exemptTotal: string;
  exoneratedTotal: string; grossTaxTotal: string; exoneratedTaxTotal: string; netTaxTotal: string; total: string;
  paymentMethods: Array<{ id: string; paymentMethodOrder: number; paymentMethodCode: string; description: string | null; declaredAmount: string | null }>;
  references: Array<{ id: string; referenceOrder: number; referencedBillingDocumentId: string | null; externalDocumentKey: string | null; externalDocumentNumber: string | null; referencedDocumentTypeCode: string; reasonCode: string; reasonDescription: string | null; referenceDate: string }>;
  lines: BillingDocumentWorkspaceLine[];
  readiness: { receiverFiscalIdentityMissing: boolean; exchangeRateMissing: boolean };
};

export type AcceptedBillingInvoice = {
  billingDocumentId: string;
  internalNumber: string;
  fiscalNumber: string;
  documentTypeCode: string;
  lifecycleStatus: 'SUBMITTED';
  taxAuthorityStatus: 'ACCEPTED';
  issuedDate: string;
  currencyCode: string;
  issuer: {
    name: string;
    identificationType: string;
    identificationNumber: string;
    email: string | null;
    phone: string | null;
  };
  paymentCondition: {
    code: string | null;
    creditTermDays: number | null;
    dueDate: string | null;
  };
  receiver: {
    name: string | null;
    identificationType: string | null;
    identificationNumber: string | null;
    email: string | null;
  };
  salesOrder: {
    id: string;
    number: string | null;
  } | null;
  lines: Array<{
    lineNumber: number;
    description: string;
    quantity: string;
    unitOfMeasureCode: string;
    unitPrice: string;
    subtotal: string;
    taxableBase: string;
    taxes: Array<{
      taxCode: string;
      rateCode: string;
      ratePercentage: string;
      taxableBase: string;
      taxAmount: string;
      netTaxAmount: string;
    }>;
    lineTotal: string;
  }>;
  totals: {
    subtotal: string;
    totalTax: string;
    total: string;
  };
};

export type FiscalArtifactType =
  | 'SIGNED_FISCAL_XML'
  | 'TAX_AUTHORITY_RESPONSE_XML'
  | 'INTERNAL_PDF';

export type FiscalArtifactListItem = {
  artifactType: FiscalArtifactType;
  version: number;
  status: 'PENDING' | 'AVAILABLE' | 'FAILED';
  mimeType?: string | null;
  byteSize?: string | null;
  retrievedAt?: string | null;
  storedAt?: string | null;
  terminalErrorCode?: string | null;
  failedAt?: string | null;
  downloadAvailable: boolean;
};

export type AcceptedInvoicePdfArtifact = {
  artifactType: 'INTERNAL_PDF';
  version: number;
  status: 'AVAILABLE';
  mimeType: 'application/pdf';
  byteSize: string;
  storedAt: string;
};

export type ManualInvoiceEmailResendInput = {
  to: string;
  cc?: string[];
};

export type ManualInvoiceEmailResendResult = {
  queued: true;
  requestId: string;
};

export type FiscalArtifactDownload = {
  blob: Blob;
  filename: string;
  mimeType: string;
};

export type BillingDocumentFiscalAllocationResult = {
  billingDocumentId: string;
  sequenceId: string;
  allocatedSequenceNumber: string;
  providerBase: string;
  fiscalNumber: string;
  issuanceIdempotencyKey: string;
  outboxEventId: string;
  outboxDeduplicationKey: string;
  lifecycleStatus: string;
  providerStatus: string;
  newlyAllocated: boolean;
};

const ERROR_MESSAGES: Record<string, string> = {
  SALES_ORDER_NOT_FOUND: 'La orden de venta no fue encontrada.',
  SALES_ORDER_SOURCE_NOT_ELIGIBLE: 'La orden no proviene de un origen elegible para facturación fiscal.',
  SALES_ORDER_STATUS_NOT_ELIGIBLE: 'El estado actual de la orden no permite preparar un documento fiscal.',
  SALES_ORDER_HAS_NO_LINES: 'La orden no contiene líneas para facturar.',
  SALES_ORDER_LINE_SOURCE_IDENTITY_MISSING: 'Una línea no conserva la identidad de su servicio de catálogo.',
  SALES_ORDER_LINE_FISCAL_PROFILE_MISSING: 'Una línea no tiene un perfil fiscal configurado.',
  SALES_ORDER_LINE_FISCAL_PROFILE_INACTIVE: 'Una línea tiene un perfil fiscal inactivo.',
  SALES_ORDER_LINE_FISCAL_PROFILE_INVALID: 'Una línea tiene una configuración fiscal incompleta o inválida.',
  SALES_ORDER_LINE_TAX_MISMATCH: 'El impuesto de una línea no coincide con su perfil fiscal.',
  SALES_ORDER_TOTALS_MISMATCH: 'Los totales de la orden no coinciden con la suma de sus líneas.',
  BILLING_CONFIGURATION_NOT_FOUND: 'No existe configuración de facturación para la empresa.',
  BILLING_NOT_ENABLED: 'La facturación electrónica no está habilitada.',
  FISCAL_ISSUER_NOT_FOUND: 'El emisor fiscal seleccionado no fue encontrado.',
  FISCAL_ISSUER_NOT_ACTIVE: 'El emisor fiscal seleccionado no está activo.',
  FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_CONFIGURED: 'Ningún emisor activo tiene una actividad económica principal configurada.',
  RECEIVER_FISCAL_IDENTITY_INCOMPLETE: 'La identidad fiscal del receptor deberá completarse antes de emitir una factura electrónica.',
  BILLING_RECEIVER_IDENTIFICATION_INVALID: 'La identificación fiscal del receptor no es válida.',
  BILLING_PAYMENT_METHOD_INVALID: 'Seleccione entre uno y cuatro métodos de pago válidos.',
  BILLING_DRAFT_CONFLICT: 'No fue posible crear el borrador porque existe un documento en conflicto.',
  BILLING_DRAFT_ALREADY_ADVANCED: 'El documento fiscal existente ya avanzó y solo puede consultarse.',
  BILLING_DOCUMENT_NOT_FOUND: 'El documento fiscal no fue encontrado.',
  BILLING_DOCUMENT_INVOICE_NOT_AVAILABLE: 'La factura aceptada todavía no está disponible.',
  BILLING_DOCUMENT_INVOICE_PDF_CONFLICT: 'El PDF persistido está en conflicto y no puede descargarse de forma segura.',
  BILLING_DOCUMENT_INVOICE_PDF_GENERATION_FAILED: 'No se pudo generar el PDF de la factura.',
  FISCAL_INVOICE_MANUAL_RESEND_RECIPIENT_INVALID: 'Ingrese un correo destinatario válido.',
  FISCAL_INVOICE_MANUAL_RESEND_CC_INVALID: 'Revise los correos incluidos en copia.',
  BILLING_DOCUMENT_NOT_ELIGIBLE_FOR_ISSUANCE: 'El documento no es elegible para solicitar emisión electrónica.',
  BILLING_DOCUMENT_FISCAL_READINESS_FAILED: 'El documento todavía tiene requisitos fiscales pendientes.',
  BILLING_DOCUMENT_UNSUPPORTED_FISCAL_CURRENCY: 'La moneda del documento no es compatible con la emisión fiscal.',
  BILLING_DOCUMENT_OFFICIAL_RATE_MISMATCH: 'No fue posible confirmar el tipo de cambio oficial requerido.',
  BILLING_DOCUMENT_FISCAL_EMISSION_CONFLICT: 'La identidad temporal de la emisión fiscal está en conflicto.',
  BILLING_DOCUMENT_SEQUENCE_NOT_CONFIGURED: 'No existe una secuencia fiscal configurada para este documento.',
  BILLING_DOCUMENT_SEQUENCE_EXHAUSTED: 'La secuencia fiscal disponible está agotada.',
  BILLING_DOCUMENT_ALLOCATION_STATE_CONFLICT: 'El estado de asignación fiscal está en conflicto.',
  BILLING_DOCUMENT_CONCURRENT_ALLOCATION_CONFLICT: 'Otra solicitud modificó la asignación fiscal simultáneamente.',
  BILLING_DOCUMENT_OUTBOX_CONFLICT: 'No fue posible registrar de forma segura la solicitud de envío.',
  BILLING_DOCUMENT_PROVIDER_ATTEMPT_IDENTITY_CONFLICT: 'La identidad del intento de envío está en conflicto.',
  BILLING_DOCUMENT_PROVIDER_REQUEST_HASH_CONFLICT: 'La solicitud fiscal persistida está en conflicto.',
  BILLING_DOCUMENT_PROVIDER_ATTEMPT_STATE_CORRUPT: 'El estado persistido del intento de envío no es válido.',
  BILLING_DOCUMENT_PROVIDER_ATTEMPT_CONCURRENT_CONFLICT: 'El intento de envío cambió simultáneamente.',
  BILLING_DOCUMENT_PROVIDER_ATTEMPT_PERSISTENCE_FAILED: 'No fue posible guardar el intento de envío.',
  BILLING_DOCUMENT_SUBMISSION_OUTCOME_CONFLICT: 'El resultado del envío fiscal está en conflicto.',
  BILLING_DOCUMENT_SUBMISSION_READ_FAILED: 'No fue posible leer el documento fiscal de forma segura.',
  FISCAL_ARTIFACT_INVALID_REQUEST: 'La solicitud del documento no es válida.',
  FISCAL_ARTIFACT_NOT_FOUND: 'El documento solicitado no fue encontrado.',
  FISCAL_ARTIFACT_NOT_AVAILABLE: 'El documento todavía no está disponible.',
  FISCAL_ARTIFACT_UNAVAILABLE: 'El documento no pudo estar disponible.',
  FISCAL_ARTIFACT_INTEGRITY_FAILURE: 'No fue posible verificar el documento almacenado.',
  FISCAL_ARTIFACT_DOWNLOAD_FAILED: 'No se pudo descargar el documento.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetchApi(path, { method: 'GET', signal });
  if (response.ok) return response.json() as Promise<T>;

  const payload: unknown = await response.json().catch(() => null);
  const record = isRecord(payload) ? payload : {};
  const code = typeof record.code === 'string' ? record.code : 'FISCAL_BILLING_REQUEST_FAILED';
  const backendMessage = typeof record.message === 'string' ? record.message : undefined;
  const message = ERROR_MESSAGES[code] ?? 'No se pudo completar la consulta de facturación fiscal.';
  const details = isRecord(record.details) ? record.details : undefined;
  throw new FiscalBillingApiError(code, message, details, backendMessage);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetchApi(path, { method: 'POST', body: JSON.stringify(body) });
  if (response.ok) return response.json() as Promise<T>;
  const payload: unknown = await response.json().catch(() => null);
  const record = isRecord(payload) ? payload : {};
  const code = typeof record.code === 'string' ? record.code : 'FISCAL_BILLING_REQUEST_FAILED';
  throw new FiscalBillingApiError(code, ERROR_MESSAGES[code] ?? 'No se pudo crear el borrador fiscal.');
}

async function postWithoutBody<T>(path: string): Promise<T> {
  const response = await fetchApi(path, { method: 'POST' });
  if (response.ok) return response.json() as Promise<T>;
  const payload: unknown = await response.json().catch(() => null);
  const record = isRecord(payload) ? payload : {};
  const code = typeof record.code === 'string' ? record.code : 'FISCAL_BILLING_REQUEST_FAILED';
  throw new FiscalBillingApiError(
    code,
    ERROR_MESSAGES[code] ?? 'No se pudo solicitar la emisión electrónica.',
  );
}

async function artifactError(response: Response): Promise<FiscalBillingApiError> {
  const payload: unknown = await response.json().catch(() => null);
  const record = isRecord(payload) ? payload : {};
  const code = typeof record.code === 'string' ? record.code : 'FISCAL_BILLING_REQUEST_FAILED';
  return new FiscalBillingApiError(
    code,
    ERROR_MESSAGES[code] ?? 'No se pudo completar la operación con el documento.',
  );
}

function validRouteId(value: string): boolean {
  return value.length >= 1 && value.length <= 200 && value.trim() === value && /^[A-Za-z0-9_-]+$/.test(value);
}

export function getEligibleSalesOrders(
  page: number,
  pageSize: number,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return request<EligibleSalesOrdersPage>(`/fiscal-billing/sales-orders/eligible?${query}`, signal);
}

export function getFiscalPreparation(salesOrderId: string, signal?: AbortSignal) {
  return request<FiscalPreparation>(
    `/fiscal-billing/sales-orders/${encodeURIComponent(salesOrderId)}/preparation`,
    signal,
  );
}

export function createOrResumeBillingDraft(salesOrderId: string, input: CreateBillingDraftInput) {
  return post<BillingDocumentWorkspace>(`/fiscal-billing/sales-orders/${encodeURIComponent(salesOrderId)}/draft`, input);
}

export function getBillingDocumentWorkspace(billingDocumentId: string, signal?: AbortSignal) {
  return request<BillingDocumentWorkspace>(`/fiscal-billing/documents/${encodeURIComponent(billingDocumentId)}/workspace`, signal);
}

export function getAcceptedBillingInvoice(billingDocumentId: string, signal?: AbortSignal) {
  if (!validRouteId(billingDocumentId)) {
    return Promise.reject(new FiscalBillingApiError(
      'BILLING_DOCUMENT_NOT_FOUND',
      ERROR_MESSAGES.BILLING_DOCUMENT_NOT_FOUND,
    ));
  }
  return request<AcceptedBillingInvoice>(
    `/fiscal-billing/invoices/${encodeURIComponent(billingDocumentId)}`,
    signal,
  );
}

export function generateAcceptedInvoicePdf(billingDocumentId: string) {
  if (!validRouteId(billingDocumentId)) {
    return Promise.reject(new FiscalBillingApiError(
      'BILLING_DOCUMENT_NOT_FOUND',
      ERROR_MESSAGES.BILLING_DOCUMENT_NOT_FOUND,
    ));
  }
  return postWithoutBody<AcceptedInvoicePdfArtifact>(
    `/fiscal-billing/invoices/${encodeURIComponent(billingDocumentId)}/pdf`,
  );
}

export async function requestAcceptedInvoiceEmailResend(
  billingDocumentId: string,
  input: ManualInvoiceEmailResendInput,
): Promise<ManualInvoiceEmailResendResult> {
  if (!validRouteId(billingDocumentId)) {
    throw new FiscalBillingApiError(
      'BILLING_DOCUMENT_NOT_FOUND',
      ERROR_MESSAGES.BILLING_DOCUMENT_NOT_FOUND,
    );
  }
  const response = await fetchApi(
    `/fiscal-billing/invoices/${encodeURIComponent(billingDocumentId)}/email`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  if (response.ok) return response.json() as Promise<ManualInvoiceEmailResendResult>;
  const payload: unknown = await response.json().catch(() => null);
  const record = isRecord(payload) ? payload : {};
  const code = typeof record.code === 'string' ? record.code : 'FISCAL_BILLING_REQUEST_FAILED';
  throw new FiscalBillingApiError(
    code,
    ERROR_MESSAGES[code] ?? 'No se pudo programar el reenvío de la factura.',
  );
}

export function listFiscalArtifacts(billingDocumentId: string, signal?: AbortSignal) {
  if (!validRouteId(billingDocumentId)) {
    return Promise.reject(new FiscalBillingApiError(
      'BILLING_DOCUMENT_NOT_FOUND',
      ERROR_MESSAGES.BILLING_DOCUMENT_NOT_FOUND,
    ));
  }
  return request<FiscalArtifactListItem[]>(
    `/fiscal-billing/documents/${encodeURIComponent(billingDocumentId)}/artifacts`,
    signal,
  );
}

export async function downloadFiscalArtifact(
  billingDocumentId: string,
  artifactType: FiscalArtifactType,
  version: number,
): Promise<FiscalArtifactDownload> {
  if (
    !validRouteId(billingDocumentId) ||
    !Number.isSafeInteger(version) ||
    version < 1
  ) {
    throw new FiscalBillingApiError(
      'FISCAL_ARTIFACT_INVALID_REQUEST',
      ERROR_MESSAGES.FISCAL_ARTIFACT_INVALID_REQUEST,
    );
  }
  const response = await fetchApi(
    `/fiscal-billing/documents/${encodeURIComponent(billingDocumentId)}/artifacts/${encodeURIComponent(artifactType)}/versions/${version}/download`,
    { method: 'GET' },
  );
  if (!response.ok) throw await artifactError(response);
  const mimeType = response.headers.get('content-type')?.split(';', 1)[0]?.trim() || 'application/octet-stream';
  const disposition = response.headers.get('content-disposition') ?? '';
  const matchedFilename = /filename="?([^";]+)"?/i.exec(disposition)?.[1]?.trim();
  const filename = matchedFilename && !/[\\/\u0000-\u001f\u007f]/.test(matchedFilename)
    ? matchedFilename
    : fallbackArtifactFilename(artifactType, version);
  return { blob: await response.blob(), filename, mimeType };
}

function fallbackArtifactFilename(artifactType: FiscalArtifactType, version: number): string {
  if (artifactType === 'INTERNAL_PDF') return `fiscal-invoice-v${version}.pdf`;
  if (artifactType === 'SIGNED_FISCAL_XML') return `signed-fiscal-document-v${version}.xml`;
  return `tax-authority-response-v${version}.xml`;
}

export function requestBillingDocumentElectronicIssuance(billingDocumentId: string) {
  if (!validRouteId(billingDocumentId)) {
    return Promise.reject(new FiscalBillingApiError(
      'BILLING_DOCUMENT_NOT_FOUND',
      ERROR_MESSAGES.BILLING_DOCUMENT_NOT_FOUND,
    ));
  }
  return postWithoutBody<BillingDocumentFiscalAllocationResult>(
    `/fiscal-billing/documents/${encodeURIComponent(billingDocumentId)}/request-electronic-issuance`,
  );
}

export function fiscalBillingErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? 'No se pudo completar la operación fiscal.';
}

export function fiscalBillingIssueMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? 'Se requiere revisar la configuración fiscal.';
}

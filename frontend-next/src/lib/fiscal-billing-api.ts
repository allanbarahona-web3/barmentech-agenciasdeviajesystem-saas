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
    receiverFiscalIdentityComplete: boolean;
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
  FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_CONFIGURED: 'Ningún emisor activo tiene una actividad económica principal configurada.',
  RECEIVER_FISCAL_IDENTITY_INCOMPLETE: 'La identidad fiscal del receptor deberá completarse antes de emitir una factura electrónica.',
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

export function fiscalBillingIssueMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? 'Se requiere revisar la configuración fiscal.';
}

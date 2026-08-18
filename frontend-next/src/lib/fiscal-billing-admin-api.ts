import { fetchApi } from '@/lib/api-client';

export type TenantBillingConfiguration = {
  id: string | null;
  billingEnabled: boolean;
  externalRegistrationEnabled: boolean;
  electronicIssuanceEnabled: boolean;
  countryCode: string;
  defaultCurrencyCode: string;
  fiscalTimezone: string;
  fiscalSchemaVersion: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TenantBillingConfigurationResponse = {
  configured: boolean;
  configuration: TenantBillingConfiguration;
};

export type UpdateTenantBillingConfiguration = Pick<
  TenantBillingConfiguration,
  | 'billingEnabled'
  | 'externalRegistrationEnabled'
  | 'electronicIssuanceEnabled'
  | 'countryCode'
  | 'defaultCurrencyCode'
  | 'fiscalTimezone'
  | 'fiscalSchemaVersion'
>;

export type FiscalBillingAdminErrorDetails = Record<string, unknown>;

export class FiscalBillingAdminApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: FiscalBillingAdminErrorDetails,
  ) {
    super(message);
    this.name = 'FiscalBillingAdminApiError';
  }
}

const SAFE_MESSAGES: Record<string, string> = {
  BILLING_CONFIGURATION_INVALID_COUNTRY:
    'La emisión electrónica solo está disponible para el paquete fiscal de Costa Rica.',
  BILLING_CONFIGURATION_INVALID_SCHEMA:
    'La emisión electrónica requiere la versión fiscal 4.4.',
  FISCAL_ISSUER_NOT_FOUND: 'No se encontró el emisor fiscal solicitado.',
  FISCAL_ISSUER_ACTIVATION_INCOMPLETE:
    'El emisor no tiene todos los datos requeridos para activarse.',
  FISCAL_ISSUER_ACTIVATION_CONFLICT:
    'No fue posible cambiar el emisor activo. Actualice la lista e intente nuevamente.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validationMessage(
  value: unknown,
  fallback = 'Revise los valores de la configuración fiscal e intente nuevamente.',
): string | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return null;
  }
  const messages = value as string[];
  if (messages.some((message) => message.includes('defaultCurrencyCode'))) {
    return 'La moneda debe contener exactamente tres letras mayúsculas.';
  }
  if (messages.some((message) => message.includes('fiscalTimezone'))) {
    return 'La zona horaria fiscal es obligatoria y debe tener como máximo 100 caracteres.';
  }
  if (messages.some((message) => message.includes('countryCode'))) {
    return 'El país fiscal debe contener exactamente dos letras mayúsculas.';
  }
  if (messages.some((message) => message.includes('fiscalSchemaVersion'))) {
    return 'La versión fiscal es obligatoria y debe tener como máximo 20 caracteres.';
  }
  return fallback;
}

async function parseResponse(
  response: Response,
): Promise<TenantBillingConfigurationResponse> {
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return payload as TenantBillingConfigurationResponse;

  const record = isRecord(payload) ? payload : {};
  const code =
    typeof record.code === 'string'
      ? record.code
      : 'FISCAL_BILLING_ADMIN_REQUEST_FAILED';
  const message =
    SAFE_MESSAGES[code] ??
    validationMessage(record.message) ??
    'No se pudo completar la solicitud de configuración fiscal.';
  const details = isRecord(record.details) ? record.details : undefined;
  throw new FiscalBillingAdminApiError(code, message, details);
}

export async function getTenantBillingConfiguration(signal?: AbortSignal) {
  const response = await fetchApi('/admin/fiscal-billing/configuration', {
    method: 'GET',
    signal,
  });
  return parseResponse(response);
}

export async function updateTenantBillingConfiguration(
  input: UpdateTenantBillingConfiguration,
) {
  const response = await fetchApi('/admin/fiscal-billing/configuration', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return parseResponse(response);
}

export type FiscalIssuer = {
  id: string; displayName: string; isActive: boolean; legalName: string;
  identificationTypeCode: string; identificationNumber: string;
  commercialName: string | null; countryCode: string; email: string;
  phoneCountryCode: string | null; phoneNumber: string | null;
  provinceCode: string; cantonCode: string; districtCode: string;
  neighborhoodCode: string | null; otherAddressDetails: string;
  defaultCurrencyCode: string | null; establishmentCode: string | null;
  terminalCode: string | null; createdAt: string; updatedAt: string;
};

export type FiscalIssuerInput = Omit<
  FiscalIssuer,
  'id' | 'isActive' | 'createdAt' | 'updatedAt' | 'neighborhoodCode'
> & {
  neighborhoodCode?: string | null;
};
export type FiscalIssuerUpdateInput = Partial<FiscalIssuerInput>;

async function parseIssuerResponse<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return payload as T;
  const record = isRecord(payload) ? payload : {};
  const code = typeof record.code === 'string' ? record.code : 'FISCAL_ISSUER_REQUEST_FAILED';
  const details = isRecord(record.details) ? record.details : undefined;
  const message =
    SAFE_MESSAGES[code] ??
    validationMessage(
      record.message,
      'Revise los datos del emisor fiscal e intente nuevamente.',
    ) ??
    'No se pudo completar la solicitud del emisor fiscal.';
  throw new FiscalBillingAdminApiError(code, message, details);
}

export async function listFiscalIssuers(signal?: AbortSignal) {
  return parseIssuerResponse<FiscalIssuer[]>(await fetchApi('/admin/fiscal-billing/issuers', { method: 'GET', signal }));
}
export async function getFiscalIssuer(id: string, signal?: AbortSignal) {
  return parseIssuerResponse<FiscalIssuer>(await fetchApi(`/admin/fiscal-billing/issuers/${encodeURIComponent(id)}`, { method: 'GET', signal }));
}
export async function createFiscalIssuer(input: FiscalIssuerInput) {
  return parseIssuerResponse<FiscalIssuer>(await fetchApi('/admin/fiscal-billing/issuers', { method: 'POST', body: JSON.stringify(input) }));
}
export async function updateFiscalIssuer(id: string, input: FiscalIssuerUpdateInput) {
  return parseIssuerResponse<FiscalIssuer>(await fetchApi(`/admin/fiscal-billing/issuers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }));
}
export async function updateFiscalIssuerStatus(id: string, isActive: boolean) {
  return parseIssuerResponse<FiscalIssuer>(await fetchApi(`/admin/fiscal-billing/issuers/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }));
}

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
  FISCAL_ISSUER_IDENTIFICATION_INVALID:
    'El número de identificación no corresponde al tipo seleccionado.',
  HACIENDA_ACTIVITY_LOOKUP_UNAVAILABLE:
    'No fue posible consultar las actividades en Hacienda. El servicio no está disponible en este momento. Puede reintentar más tarde.',
  HACIENDA_ACTIVITY_LOOKUP_TIMEOUT:
    'Hacienda tardó demasiado en responder. Intente nuevamente.',
  HACIENDA_ACTIVITY_LOOKUP_RATE_LIMITED:
    'Hacienda limitó temporalmente las consultas. Espere unos minutos e intente nuevamente.',
  HACIENDA_ACTIVITY_LOOKUP_INVALID_RESPONSE:
    'Hacienda respondió con información que no pudo procesarse. Intente nuevamente más tarde.',
  HACIENDA_TAXPAYER_NOT_FOUND:
    'Hacienda no encontró un contribuyente con la identificación registrada en este emisor.',
  FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_FOUND:
    'La actividad asignada ya no existe o no está disponible.',
  FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_REGISTERED:
    'La actividad seleccionada no está registrada para este contribuyente en Hacienda.',
  FISCAL_ISSUER_ECONOMIC_ACTIVITY_INACTIVE:
    'La actividad seleccionada no está activa en Hacienda.',
  FISCAL_ISSUER_PRIMARY_ACTIVITY_REMOVAL_FORBIDDEN:
    'No puede eliminar la actividad principal. Seleccione otra actividad principal antes de eliminarla.',
  FISCAL_ISSUER_ECONOMIC_ACTIVITY_CONFLICT:
    'No fue posible completar el cambio porque la información fue modificada simultáneamente. Recargue e intente nuevamente.',
  PROVIDER_NUMBERING_CONFIGURATION_MISSING:
    'La integración con el proveedor de numeración no está configurada en el backend.',
  PROVIDER_NUMBERING_UNAVAILABLE:
    'El proveedor de numeración fiscal no está disponible. Intente nuevamente más tarde.',
  PROVIDER_NUMBERING_TIMEOUT:
    'El proveedor de numeración tardó demasiado en responder. Intente nuevamente.',
  PROVIDER_NUMBERING_RATE_LIMITED:
    'El proveedor limitó temporalmente las solicitudes. Espere unos minutos e intente nuevamente.',
  PROVIDER_NUMBERING_INVALID_RESPONSE:
    'El proveedor devolvió información de numeración que no pudo validarse.',
  PROVIDER_NUMBERING_ISSUER_NOT_FOUND:
    'El proveedor no encontró el emisor fiscal configurado.',
  PROVIDER_NUMBERING_ISSUER_NOT_READY:
    'El emisor fiscal no tiene los datos requeridos para configurar la numeración.',
  PROVIDER_NUMBERING_VERIFICATION_MISMATCH:
    'No fue posible verificar que el proveedor esté en modo integrador.',
  PROVIDER_NUMBERING_CONFIGURATION_CONFLICT:
    'El proveedor rechazó la configuración de numeración solicitada.',
  FISCAL_NUMBER_SEQUENCE_ISSUER_NOT_READY:
    'El emisor debe estar activo y tener identificación, establecimiento y terminal válidos para administrar secuencias.',
  FISCAL_NUMBER_SEQUENCE_DOCUMENT_TYPE_INVALID:
    'El tipo de documento no admite configuración de secuencia.',
  FISCAL_NUMBER_SEQUENCE_INVALID:
    'El próximo número debe ser un entero decimal entre 1 y 9999999999, sin ceros iniciales.',
  FISCAL_NUMBER_SEQUENCE_DECREASE:
    'La secuencia no puede reducirse. Ingrese el valor actual o uno mayor.',
  FISCAL_NUMBER_SEQUENCE_PROVIDER_NOT_VERIFIED:
    'No fue posible verificar que el proveedor esté en modo integrador. Configure y verifique el modo integrador antes de guardar la numeración.',
  FISCAL_NUMBER_SEQUENCE_CONFLICT:
    'La secuencia cambió mientras se realizaba la operación. Actualice la información e intente nuevamente.',
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

export type HaciendaEconomicActivity = {
  code: string;
  description: string;
  status?: string;
  active?: boolean;
  primary?: boolean;
};

export type AvailableEconomicActivities = {
  issuer: Pick<
    FiscalIssuer,
    'id' | 'identificationTypeCode' | 'identificationNumber'
  >;
  legalName?: string;
  taxSituation?: {
    status?: string;
    delinquent?: boolean;
    omission?: boolean;
    taxAdministration?: string;
  };
  activities: HaciendaEconomicActivity[];
};

export type FiscalIssuerEconomicActivity = {
  id: string;
  code: string;
  description: string | null;
  isPrimary: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

function economicActivitiesPath(issuerId: string) {
  return `/admin/fiscal-billing/issuers/${encodeURIComponent(issuerId)}/economic-activities`;
}

export async function getAvailableEconomicActivities(
  issuerId: string,
  signal?: AbortSignal,
) {
  return parseIssuerResponse<AvailableEconomicActivities>(
    await fetchApi(`${economicActivitiesPath(issuerId)}/available`, {
      method: 'GET',
      signal,
    }),
  );
}

export async function listIssuerEconomicActivities(
  issuerId: string,
  signal?: AbortSignal,
) {
  return parseIssuerResponse<FiscalIssuerEconomicActivity[]>(
    await fetchApi(economicActivitiesPath(issuerId), { method: 'GET', signal }),
  );
}

export async function assignIssuerEconomicActivity(
  issuerId: string,
  code: string,
) {
  return parseIssuerResponse<FiscalIssuerEconomicActivity>(
    await fetchApi(economicActivitiesPath(issuerId), {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  );
}

export async function selectPrimaryIssuerEconomicActivity(
  issuerId: string,
  assignmentId: string,
) {
  return parseIssuerResponse<FiscalIssuerEconomicActivity>(
    await fetchApi(
      `${economicActivitiesPath(issuerId)}/${encodeURIComponent(assignmentId)}/primary`,
      { method: 'PATCH' },
    ),
  );
}

export async function deleteIssuerEconomicActivity(
  issuerId: string,
  assignmentId: string,
) {
  return parseIssuerResponse<null>(
    await fetchApi(
      `${economicActivitiesPath(issuerId)}/${encodeURIComponent(assignmentId)}`,
      { method: 'DELETE' },
    ),
  );
}

export type ProviderNumberingVerification = {
  issuerId: string;
  mode: 'integrator';
  branchCode: string;
  terminalCode: string;
  verificationDocumentTypeCode: '01';
  currentNumber: string;
  nextNumber: string;
  nextConsecutivo20: string;
  verified: true;
};

export type FiscalNumberSequence = {
  documentTypeCode: string;
  documentTypeName: string;
  configured: boolean;
  startingSequenceNumber: string | null;
  nextSequenceNumber: string | null;
  providerBasePreview: string | null;
  fullConsecutivePreview: string | null;
};

export type FiscalNumberSequencesResponse = {
  issuerId: string;
  establishmentCode: string;
  terminalCode: string;
  sequences: FiscalNumberSequence[];
};

function issuerNumberingPath(issuerId: string) {
  return `/admin/fiscal-billing/issuers/${encodeURIComponent(issuerId)}`;
}

export async function configureIssuerIntegratorMode(issuerId: string) {
  return parseIssuerResponse<ProviderNumberingVerification>(
    await fetchApi(
      `${issuerNumberingPath(issuerId)}/provider-numbering/integrator`,
      { method: 'POST' },
    ),
  );
}

export async function getFiscalNumberSequences(
  issuerId: string,
  signal?: AbortSignal,
) {
  return parseIssuerResponse<FiscalNumberSequencesResponse>(
    await fetchApi(`${issuerNumberingPath(issuerId)}/number-sequences`, {
      method: 'GET',
      signal,
    }),
  );
}

export async function setFiscalNumberSequence(
  issuerId: string,
  documentTypeCode: string,
  nextSequenceNumber: string,
) {
  return parseIssuerResponse<FiscalNumberSequence>(
    await fetchApi(
      `${issuerNumberingPath(issuerId)}/number-sequences/${encodeURIComponent(documentTypeCode)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ nextSequenceNumber }),
      },
    ),
  );
}

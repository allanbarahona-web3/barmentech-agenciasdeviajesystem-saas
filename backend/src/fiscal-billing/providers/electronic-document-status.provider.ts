export const ELECTRONIC_DOCUMENT_STATUS_PROVIDER = Symbol(
  "ELECTRONIC_DOCUMENT_STATUS_PROVIDER",
);

export interface ElectronicDocumentStatusLookupInput {
  readonly providerDocumentId: string;
  readonly expectedHaciendaKey: string;
  readonly expectedConsecutive: string;
  readonly expectedProviderEnvironment: "sandbox" | "production";
  readonly expectedFiscalIssueDate: string;
  readonly expectedDocumentType: "01" | "04";
}

export interface ElectronicDocumentStatusResult {
  readonly classification: "ELECTRONIC_DOCUMENT_STATUS";
  readonly providerDocumentId: string;
  readonly haciendaKey: string;
  readonly consecutive: string;
  readonly providerEnvironment: "sandbox" | "production";
  readonly providerStatus: string;
  readonly final: boolean;
  readonly finalDecision: "ACCEPTED" | "REJECTED" | null;
  readonly fiscalIssuedAt: string | null;
  readonly rejectionDetail: string | null;
}

export interface ElectronicDocumentStatusProvider {
  getDocumentStatus(
    input: ElectronicDocumentStatusLookupInput,
  ): Promise<ElectronicDocumentStatusResult>;
}

export type ElectronicDocumentStatusErrorCode =
  | "ELECTRONIC_DOCUMENT_STATUS_LOCAL_REQUEST_INVALID"
  | "ELECTRONIC_DOCUMENT_STATUS_CONFIGURATION_MISSING"
  | "ELECTRONIC_DOCUMENT_STATUS_AUTHENTICATION_FAILED"
  | "ELECTRONIC_DOCUMENT_STATUS_AUTHORIZATION_FAILED"
  | "ELECTRONIC_DOCUMENT_STATUS_NOT_FOUND"
  | "ELECTRONIC_DOCUMENT_STATUS_RATE_LIMITED"
  | "ELECTRONIC_DOCUMENT_STATUS_PROVIDER_UNAVAILABLE"
  | "ELECTRONIC_DOCUMENT_STATUS_TIMEOUT"
  | "ELECTRONIC_DOCUMENT_STATUS_INVALID_PROVIDER_RESPONSE"
  | "ELECTRONIC_DOCUMENT_STATUS_LOOKUP_REJECTED";

const MESSAGES: Record<ElectronicDocumentStatusErrorCode, string> = {
  ELECTRONIC_DOCUMENT_STATUS_LOCAL_REQUEST_INVALID:
    "La consulta del estado fiscal no es válida.",
  ELECTRONIC_DOCUMENT_STATUS_CONFIGURATION_MISSING:
    "La configuración del proveedor fiscal no está disponible.",
  ELECTRONIC_DOCUMENT_STATUS_AUTHENTICATION_FAILED:
    "La autenticación con el proveedor fiscal falló.",
  ELECTRONIC_DOCUMENT_STATUS_AUTHORIZATION_FAILED:
    "La cuenta no está autorizada para consultar el documento fiscal.",
  ELECTRONIC_DOCUMENT_STATUS_NOT_FOUND:
    "El documento fiscal no existe en la cuenta del proveedor.",
  ELECTRONIC_DOCUMENT_STATUS_RATE_LIMITED:
    "El proveedor fiscal limitó temporalmente las consultas.",
  ELECTRONIC_DOCUMENT_STATUS_PROVIDER_UNAVAILABLE:
    "El proveedor fiscal no está disponible.",
  ELECTRONIC_DOCUMENT_STATUS_TIMEOUT:
    "El proveedor fiscal no respondió dentro del plazo.",
  ELECTRONIC_DOCUMENT_STATUS_INVALID_PROVIDER_RESPONSE:
    "La respuesta de estado del proveedor fiscal no pudo validarse.",
  ELECTRONIC_DOCUMENT_STATUS_LOOKUP_REJECTED:
    "El proveedor rechazó la consulta del estado fiscal.",
};

export class ElectronicDocumentStatusError extends Error {
  constructor(
    readonly code: ElectronicDocumentStatusErrorCode,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(MESSAGES[code]);
    this.name = "ElectronicDocumentStatusError";
  }
}

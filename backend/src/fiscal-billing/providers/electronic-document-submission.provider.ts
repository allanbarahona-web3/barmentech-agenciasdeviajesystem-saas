export const ELECTRONIC_DOCUMENT_SUBMISSION_PROVIDER = Symbol("ELECTRONIC_DOCUMENT_SUBMISSION_PROVIDER");

export interface PreparedElectronicDocumentSubmission {
  readonly endpoint: "/documents/factura" | "/documents/tiquete";
  readonly canonicalBody: string;
  readonly requestHash: string;
  readonly idempotencyKey: string;
  readonly metadata: {
    readonly billingDocumentId: string;
    readonly tenantId: string;
    readonly documentTypeCode: "01" | "04";
    readonly fiscalNumber: string;
    readonly fiscalIssueDate: string;
  };
}

export type ElectronicDocumentStatus = {
  providerStatus: string;
  final: boolean;
  accepted: boolean;
  rejected: boolean;
};

export interface ElectronicDocumentSubmissionAcknowledgement {
  classification: "ACKNOWLEDGED_PROVIDER_SUBMISSION";
  providerDocumentId: string;
  haciendaKey: string;
  consecutive: string;
  status: ElectronicDocumentStatus;
  providerEnvironment: "sandbox" | "production";
  estimatedReadyAt: string | null;
}

export interface ElectronicDocumentSubmissionProvider {
  submitElectronicDocument(prepared: PreparedElectronicDocumentSubmission): Promise<ElectronicDocumentSubmissionAcknowledgement>;
}

export type ElectronicDocumentSubmissionErrorCode =
  | "ELECTRONIC_SUBMISSION_LOCAL_REQUEST_INVALID"
  | "ELECTRONIC_SUBMISSION_CONFIGURATION_MISSING"
  | "ELECTRONIC_SUBMISSION_INVALID"
  | "ELECTRONIC_SUBMISSION_AUTHENTICATION_FAILED"
  | "ELECTRONIC_SUBMISSION_AUTHORIZATION_FAILED"
  | "ELECTRONIC_SUBMISSION_ISSUER_NOT_READY"
  | "ELECTRONIC_SUBMISSION_IDEMPOTENCY_CONFLICT"
  | "ELECTRONIC_SUBMISSION_IDEMPOTENCY_IN_PROGRESS"
  | "ELECTRONIC_SUBMISSION_CONFLICT"
  | "ELECTRONIC_SUBMISSION_PAYLOAD_TOO_LARGE"
  | "ELECTRONIC_SUBMISSION_FISCAL_RULE_REJECTED"
  | "ELECTRONIC_SUBMISSION_RATE_LIMITED"
  | "ELECTRONIC_SUBMISSION_PROVIDER_UNAVAILABLE"
  | "ELECTRONIC_SUBMISSION_TIMEOUT"
  | "ELECTRONIC_SUBMISSION_INVALID_PROVIDER_RESPONSE";

export type ElectronicSubmissionOutcome = "DEFINITE_REJECTION" | "CONFIGURATION_FAILURE" | "RETRY_SAME_REQUEST" | "UNKNOWN_REQUIRES_RECONCILIATION";

const MESSAGES: Record<ElectronicDocumentSubmissionErrorCode, string> = {
  ELECTRONIC_SUBMISSION_LOCAL_REQUEST_INVALID: "La solicitud fiscal preparada no es válida.",
  ELECTRONIC_SUBMISSION_CONFIGURATION_MISSING: "La configuración del proveedor fiscal no está disponible.",
  ELECTRONIC_SUBMISSION_INVALID: "El proveedor rechazó la solicitud fiscal.",
  ELECTRONIC_SUBMISSION_AUTHENTICATION_FAILED: "La autenticación con el proveedor fiscal falló.",
  ELECTRONIC_SUBMISSION_AUTHORIZATION_FAILED: "La cuenta no está autorizada para emitir el documento fiscal.",
  ELECTRONIC_SUBMISSION_ISSUER_NOT_READY: "El emisor fiscal no está disponible en el proveedor.",
  ELECTRONIC_SUBMISSION_IDEMPOTENCY_CONFLICT: "La identidad de emisión fiscal está en conflicto.",
  ELECTRONIC_SUBMISSION_IDEMPOTENCY_IN_PROGRESS: "La misma emisión fiscal continúa en proceso.",
  ELECTRONIC_SUBMISSION_CONFLICT: "La emisión fiscal presenta un conflicto en el proveedor.",
  ELECTRONIC_SUBMISSION_PAYLOAD_TOO_LARGE: "La solicitud fiscal excede el tamaño permitido.",
  ELECTRONIC_SUBMISSION_FISCAL_RULE_REJECTED: "El proveedor rechazó una regla fiscal de la solicitud.",
  ELECTRONIC_SUBMISSION_RATE_LIMITED: "El proveedor fiscal limitó temporalmente las solicitudes.",
  ELECTRONIC_SUBMISSION_PROVIDER_UNAVAILABLE: "El proveedor fiscal no está disponible.",
  ELECTRONIC_SUBMISSION_TIMEOUT: "El proveedor fiscal no respondió dentro del plazo.",
  ELECTRONIC_SUBMISSION_INVALID_PROVIDER_RESPONSE: "La respuesta del proveedor fiscal no pudo validarse.",
};

export class ElectronicDocumentSubmissionError extends Error {
  constructor(readonly code: ElectronicDocumentSubmissionErrorCode, readonly outcome: ElectronicSubmissionOutcome, readonly retryAfterSeconds: number | null = null) {
    super(MESSAGES[code]);
    this.name = "ElectronicDocumentSubmissionError";
  }
}

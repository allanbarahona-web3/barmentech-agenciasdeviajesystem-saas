export const FISCAL_ARTIFACT_RETRIEVAL_PORT = Symbol('FISCAL_ARTIFACT_RETRIEVAL_PORT');

export type FiscalArtifactRetrievalType = 'SIGNED_FISCAL_XML' | 'TAX_AUTHORITY_RESPONSE_XML';
export type FiscalArtifactProviderEnvironment = 'sandbox' | 'production';

export interface FiscalArtifactRetrievalInput {
  readonly providerDocumentId: string;
  readonly artifactType: FiscalArtifactRetrievalType;
  readonly providerEnvironment: FiscalArtifactProviderEnvironment;
}

export interface FiscalArtifactRetrievalResult {
  readonly bytes: Buffer;
  readonly normalizedMimeType: 'application/xml' | 'text/xml';
  readonly retrievedAt: Date;
  readonly sourceEtag: string | null;
}

export interface FiscalArtifactRetrievalPort {
  retrieveFiscalArtifact(input: FiscalArtifactRetrievalInput): Promise<FiscalArtifactRetrievalResult>;
}

export type FiscalArtifactRetrievalErrorCode =
  | 'FISCAL_ARTIFACT_RETRIEVAL_LOCAL_REQUEST_INVALID'
  | 'FISCAL_ARTIFACT_RETRIEVAL_CONFIGURATION_MISSING'
  | 'FISCAL_ARTIFACT_RETRIEVAL_AUTHENTICATION_FAILED'
  | 'FISCAL_ARTIFACT_RETRIEVAL_ACCESS_FORBIDDEN'
  | 'FISCAL_ARTIFACT_RETRIEVAL_NOT_FOUND'
  | 'FISCAL_ARTIFACT_RETRIEVAL_REJECTED'
  | 'FISCAL_ARTIFACT_RETRIEVAL_RATE_LIMITED'
  | 'FISCAL_ARTIFACT_RETRIEVAL_PROVIDER_UNAVAILABLE'
  | 'FISCAL_ARTIFACT_RETRIEVAL_TIMEOUT'
  | 'FISCAL_ARTIFACT_RETRIEVAL_INVALID_PROVIDER_RESPONSE'
  | 'FISCAL_ARTIFACT_RETRIEVAL_RESPONSE_TOO_LARGE';

const MESSAGES: Record<FiscalArtifactRetrievalErrorCode, string> = {
  FISCAL_ARTIFACT_RETRIEVAL_LOCAL_REQUEST_INVALID: 'La solicitud de artefacto fiscal no es válida.',
  FISCAL_ARTIFACT_RETRIEVAL_CONFIGURATION_MISSING: 'La configuración del proveedor fiscal no está disponible.',
  FISCAL_ARTIFACT_RETRIEVAL_AUTHENTICATION_FAILED: 'La autenticación con el proveedor fiscal falló.',
  FISCAL_ARTIFACT_RETRIEVAL_ACCESS_FORBIDDEN: 'La cuenta no puede recuperar el artefacto fiscal.',
  FISCAL_ARTIFACT_RETRIEVAL_NOT_FOUND: 'El documento fiscal no existe en la cuenta del proveedor.',
  FISCAL_ARTIFACT_RETRIEVAL_REJECTED: 'El proveedor rechazó la recuperación del artefacto fiscal.',
  FISCAL_ARTIFACT_RETRIEVAL_RATE_LIMITED: 'El proveedor fiscal limitó temporalmente la recuperación.',
  FISCAL_ARTIFACT_RETRIEVAL_PROVIDER_UNAVAILABLE: 'El proveedor fiscal no está disponible.',
  FISCAL_ARTIFACT_RETRIEVAL_TIMEOUT: 'El proveedor fiscal no respondió dentro del plazo.',
  FISCAL_ARTIFACT_RETRIEVAL_INVALID_PROVIDER_RESPONSE: 'La respuesta de artefacto del proveedor no pudo validarse.',
  FISCAL_ARTIFACT_RETRIEVAL_RESPONSE_TOO_LARGE: 'El artefacto del proveedor excede el tamaño permitido.',
};

export class FiscalArtifactRetrievalError extends Error {
  constructor(
    readonly code: FiscalArtifactRetrievalErrorCode,
    readonly retryable: boolean,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(MESSAGES[code]);
    this.name = 'FiscalArtifactRetrievalError';
  }
}

export type OfficialExchangeRateProviderErrorCode =
  | "BCCR_EXCHANGE_RATE_CONFIGURATION_MISSING"
  | "BCCR_EXCHANGE_RATE_REQUEST_INVALID"
  | "BCCR_EXCHANGE_RATE_AUTHENTICATION_FAILED"
  | "BCCR_EXCHANGE_RATE_UNAVAILABLE"
  | "BCCR_EXCHANGE_RATE_TIMEOUT"
  | "BCCR_EXCHANGE_RATE_RATE_LIMITED"
  | "BCCR_EXCHANGE_RATE_INVALID_RESPONSE";

const SAFE_MESSAGES: Record<OfficialExchangeRateProviderErrorCode, string> = {
  BCCR_EXCHANGE_RATE_CONFIGURATION_MISSING:
    "La configuración del servicio oficial de tipos de cambio está incompleta.",
  BCCR_EXCHANGE_RATE_REQUEST_INVALID:
    "La consulta del tipo de cambio oficial no es válida.",
  BCCR_EXCHANGE_RATE_AUTHENTICATION_FAILED:
    "No fue posible autenticar el acceso al servicio oficial de tipos de cambio.",
  BCCR_EXCHANGE_RATE_UNAVAILABLE:
    "El servicio oficial de tipos de cambio no está disponible.",
  BCCR_EXCHANGE_RATE_TIMEOUT:
    "El servicio oficial de tipos de cambio excedió el tiempo de espera.",
  BCCR_EXCHANGE_RATE_RATE_LIMITED:
    "El servicio oficial de tipos de cambio limitó temporalmente las consultas.",
  BCCR_EXCHANGE_RATE_INVALID_RESPONSE:
    "El servicio oficial de tipos de cambio devolvió una respuesta inválida.",
};

export class OfficialExchangeRateProviderError extends Error {
  constructor(readonly code: OfficialExchangeRateProviderErrorCode) {
    super(SAFE_MESSAGES[code]);
    this.name = "OfficialExchangeRateProviderError";
  }
}

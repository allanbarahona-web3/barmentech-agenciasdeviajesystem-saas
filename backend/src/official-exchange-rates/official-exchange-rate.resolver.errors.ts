export type OfficialExchangeRateResolverErrorCode =
  | "OFFICIAL_EXCHANGE_RATE_REQUEST_INVALID"
  | "OFFICIAL_EXCHANGE_RATE_NOT_AVAILABLE"
  | "OFFICIAL_EXCHANGE_RATE_PROVIDER_MISMATCH"
  | "OFFICIAL_EXCHANGE_RATE_CONFLICT"
  | "OFFICIAL_EXCHANGE_RATE_PERSISTENCE_FAILED";

const SAFE_MESSAGES: Record<OfficialExchangeRateResolverErrorCode, string> = {
  OFFICIAL_EXCHANGE_RATE_REQUEST_INVALID:
    "La solicitud del tipo de cambio oficial no es válida.",
  OFFICIAL_EXCHANGE_RATE_NOT_AVAILABLE:
    "No existe un tipo de cambio oficial para la fecha solicitada.",
  OFFICIAL_EXCHANGE_RATE_PROVIDER_MISMATCH:
    "El proveedor devolvió un tipo de cambio oficial que no coincide con la solicitud.",
  OFFICIAL_EXCHANGE_RATE_CONFLICT:
    "El tipo de cambio oficial ya fue registrado con información diferente.",
  OFFICIAL_EXCHANGE_RATE_PERSISTENCE_FAILED:
    "No fue posible guardar el tipo de cambio oficial.",
};

export class OfficialExchangeRateResolverError extends Error {
  constructor(readonly code: OfficialExchangeRateResolverErrorCode) {
    super(SAFE_MESSAGES[code]);
    this.name = "OfficialExchangeRateResolverError";
  }
}

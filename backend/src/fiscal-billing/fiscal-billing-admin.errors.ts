import { HttpException, HttpStatus } from "@nestjs/common";

export type FiscalBillingAdminErrorCode =
  | "BILLING_CONFIGURATION_INVALID_COUNTRY"
  | "BILLING_CONFIGURATION_INVALID_SCHEMA"
  | "FISCAL_ISSUER_NOT_FOUND"
  | "FISCAL_ISSUER_ACTIVATION_INCOMPLETE"
  | "FISCAL_ISSUER_ACTIVATION_CONFLICT"
  | "HACIENDA_ACTIVITY_LOOKUP_UNAVAILABLE"
  | "HACIENDA_ACTIVITY_LOOKUP_TIMEOUT"
  | "HACIENDA_ACTIVITY_LOOKUP_RATE_LIMITED"
  | "HACIENDA_ACTIVITY_LOOKUP_INVALID_RESPONSE"
  | "HACIENDA_TAXPAYER_NOT_FOUND";

const STATUS_BY_CODE: Record<FiscalBillingAdminErrorCode, HttpStatus> = {
  BILLING_CONFIGURATION_INVALID_COUNTRY: HttpStatus.UNPROCESSABLE_ENTITY,
  BILLING_CONFIGURATION_INVALID_SCHEMA: HttpStatus.UNPROCESSABLE_ENTITY,
  FISCAL_ISSUER_NOT_FOUND: HttpStatus.NOT_FOUND,
  FISCAL_ISSUER_ACTIVATION_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  FISCAL_ISSUER_ACTIVATION_CONFLICT: HttpStatus.CONFLICT,
  HACIENDA_ACTIVITY_LOOKUP_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  HACIENDA_ACTIVITY_LOOKUP_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  HACIENDA_ACTIVITY_LOOKUP_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  HACIENDA_ACTIVITY_LOOKUP_INVALID_RESPONSE: HttpStatus.BAD_GATEWAY,
  HACIENDA_TAXPAYER_NOT_FOUND: HttpStatus.NOT_FOUND,
};

const MESSAGE_BY_CODE: Partial<Record<FiscalBillingAdminErrorCode, string>> = {
  HACIENDA_ACTIVITY_LOOKUP_UNAVAILABLE:
    "No fue posible consultar las actividades económicas porque el servicio de Hacienda no está disponible. Intente nuevamente más tarde.",
  HACIENDA_ACTIVITY_LOOKUP_TIMEOUT:
    "La consulta a Hacienda tardó demasiado. Intente nuevamente.",
  HACIENDA_ACTIVITY_LOOKUP_RATE_LIMITED:
    "Hacienda limitó temporalmente las consultas. Intente nuevamente en unos minutos.",
  HACIENDA_ACTIVITY_LOOKUP_INVALID_RESPONSE:
    "Hacienda devolvió información que no pudo validarse.",
  HACIENDA_TAXPAYER_NOT_FOUND:
    "Hacienda no encontró un contribuyente con la identificación registrada para este emisor.",
};

export function fiscalBillingAdminError(
  code: FiscalBillingAdminErrorCode,
  details?: Record<string, unknown>,
): HttpException {
  const status = STATUS_BY_CODE[code];
  return new HttpException(
    {
      statusCode: status,
      error: code,
      code,
      ...(MESSAGE_BY_CODE[code] ? { message: MESSAGE_BY_CODE[code] } : {}),
      ...(details ? { details } : {}),
    },
    status,
  );
}

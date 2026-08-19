import { HttpException, HttpStatus } from "@nestjs/common";

export type FiscalBillingAdminErrorCode =
  | "BILLING_CONFIGURATION_INVALID_COUNTRY"
  | "BILLING_CONFIGURATION_INVALID_SCHEMA"
  | "FISCAL_ISSUER_NOT_FOUND"
  | "FISCAL_ISSUER_ACTIVATION_INCOMPLETE"
  | "FISCAL_ISSUER_ACTIVATION_CONFLICT"
  | "FISCAL_ISSUER_IDENTIFICATION_INVALID"
  | "HACIENDA_ACTIVITY_LOOKUP_UNAVAILABLE"
  | "HACIENDA_ACTIVITY_LOOKUP_TIMEOUT"
  | "HACIENDA_ACTIVITY_LOOKUP_RATE_LIMITED"
  | "HACIENDA_ACTIVITY_LOOKUP_INVALID_RESPONSE"
  | "HACIENDA_TAXPAYER_NOT_FOUND"
  | "FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_FOUND"
  | "FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_REGISTERED"
  | "FISCAL_ISSUER_ECONOMIC_ACTIVITY_INACTIVE"
  | "FISCAL_ISSUER_PRIMARY_ACTIVITY_REMOVAL_FORBIDDEN"
  | "FISCAL_ISSUER_ECONOMIC_ACTIVITY_CONFLICT";

const STATUS_BY_CODE: Record<FiscalBillingAdminErrorCode, HttpStatus> = {
  BILLING_CONFIGURATION_INVALID_COUNTRY: HttpStatus.UNPROCESSABLE_ENTITY,
  BILLING_CONFIGURATION_INVALID_SCHEMA: HttpStatus.UNPROCESSABLE_ENTITY,
  FISCAL_ISSUER_NOT_FOUND: HttpStatus.NOT_FOUND,
  FISCAL_ISSUER_ACTIVATION_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  FISCAL_ISSUER_ACTIVATION_CONFLICT: HttpStatus.CONFLICT,
  FISCAL_ISSUER_IDENTIFICATION_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  HACIENDA_ACTIVITY_LOOKUP_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  HACIENDA_ACTIVITY_LOOKUP_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  HACIENDA_ACTIVITY_LOOKUP_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  HACIENDA_ACTIVITY_LOOKUP_INVALID_RESPONSE: HttpStatus.BAD_GATEWAY,
  HACIENDA_TAXPAYER_NOT_FOUND: HttpStatus.NOT_FOUND,
  FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_FOUND: HttpStatus.NOT_FOUND,
  FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_REGISTERED: HttpStatus.UNPROCESSABLE_ENTITY,
  FISCAL_ISSUER_ECONOMIC_ACTIVITY_INACTIVE: HttpStatus.UNPROCESSABLE_ENTITY,
  FISCAL_ISSUER_PRIMARY_ACTIVITY_REMOVAL_FORBIDDEN: HttpStatus.CONFLICT,
  FISCAL_ISSUER_ECONOMIC_ACTIVITY_CONFLICT: HttpStatus.CONFLICT,
};

const MESSAGE_BY_CODE: Partial<Record<FiscalBillingAdminErrorCode, string>> = {
  FISCAL_ISSUER_IDENTIFICATION_INVALID:
    "El número de identificación no corresponde al tipo seleccionado.",
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
  FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_REGISTERED:
    "La actividad económica solicitada no está registrada en Hacienda para este emisor.",
  FISCAL_ISSUER_ECONOMIC_ACTIVITY_INACTIVE:
    "La actividad económica solicitada figura como inactiva en Hacienda.",
  FISCAL_ISSUER_PRIMARY_ACTIVITY_REMOVAL_FORBIDDEN:
    "Debe marcar otra actividad como principal antes de eliminar la actividad principal actual.",
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

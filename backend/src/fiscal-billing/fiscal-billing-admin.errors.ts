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
  | "FISCAL_ISSUER_ECONOMIC_ACTIVITY_CONFLICT"
  | "PROVIDER_NUMBERING_CONFIGURATION_MISSING"
  | "PROVIDER_NUMBERING_UNAVAILABLE"
  | "PROVIDER_NUMBERING_TIMEOUT"
  | "PROVIDER_NUMBERING_RATE_LIMITED"
  | "PROVIDER_NUMBERING_INVALID_RESPONSE"
  | "PROVIDER_NUMBERING_ISSUER_NOT_FOUND"
  | "PROVIDER_NUMBERING_ISSUER_NOT_READY"
  | "PROVIDER_NUMBERING_VERIFICATION_MISMATCH"
  | "PROVIDER_NUMBERING_CONFIGURATION_CONFLICT"
  | "FISCAL_NUMBER_SEQUENCE_ISSUER_NOT_READY"
  | "FISCAL_NUMBER_SEQUENCE_DOCUMENT_TYPE_INVALID"
  | "FISCAL_NUMBER_SEQUENCE_INVALID"
  | "FISCAL_NUMBER_SEQUENCE_DECREASE"
  | "FISCAL_NUMBER_SEQUENCE_PROVIDER_NOT_VERIFIED"
  | "FISCAL_NUMBER_SEQUENCE_CONFLICT";

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
  PROVIDER_NUMBERING_CONFIGURATION_MISSING: HttpStatus.SERVICE_UNAVAILABLE,
  PROVIDER_NUMBERING_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  PROVIDER_NUMBERING_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  PROVIDER_NUMBERING_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  PROVIDER_NUMBERING_INVALID_RESPONSE: HttpStatus.BAD_GATEWAY,
  PROVIDER_NUMBERING_ISSUER_NOT_FOUND: HttpStatus.NOT_FOUND,
  PROVIDER_NUMBERING_ISSUER_NOT_READY: HttpStatus.UNPROCESSABLE_ENTITY,
  PROVIDER_NUMBERING_VERIFICATION_MISMATCH: HttpStatus.CONFLICT,
  PROVIDER_NUMBERING_CONFIGURATION_CONFLICT: HttpStatus.CONFLICT,
  FISCAL_NUMBER_SEQUENCE_ISSUER_NOT_READY: HttpStatus.UNPROCESSABLE_ENTITY,
  FISCAL_NUMBER_SEQUENCE_DOCUMENT_TYPE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  FISCAL_NUMBER_SEQUENCE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  FISCAL_NUMBER_SEQUENCE_DECREASE: HttpStatus.CONFLICT,
  FISCAL_NUMBER_SEQUENCE_PROVIDER_NOT_VERIFIED: HttpStatus.CONFLICT,
  FISCAL_NUMBER_SEQUENCE_CONFLICT: HttpStatus.CONFLICT,
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
  PROVIDER_NUMBERING_CONFIGURATION_MISSING:
    "La integración de numeración fiscal no está configurada.",
  PROVIDER_NUMBERING_UNAVAILABLE:
    "El proveedor de numeración fiscal no está disponible. Intente nuevamente más tarde.",
  PROVIDER_NUMBERING_TIMEOUT:
    "La configuración del proveedor tardó demasiado. Intente nuevamente.",
  PROVIDER_NUMBERING_RATE_LIMITED:
    "El proveedor limitó temporalmente las solicitudes. Intente nuevamente más tarde.",
  PROVIDER_NUMBERING_INVALID_RESPONSE:
    "El proveedor devolvió una respuesta de numeración que no pudo validarse.",
  PROVIDER_NUMBERING_ISSUER_NOT_FOUND:
    "El proveedor no encontró el emisor fiscal configurado.",
  PROVIDER_NUMBERING_ISSUER_NOT_READY:
    "El emisor fiscal no tiene los datos requeridos para configurar la numeración.",
  PROVIDER_NUMBERING_VERIFICATION_MISMATCH:
    "No fue posible verificar la configuración de numeración del emisor.",
  PROVIDER_NUMBERING_CONFIGURATION_CONFLICT:
    "El proveedor rechazó la configuración de numeración solicitada.",
  FISCAL_NUMBER_SEQUENCE_ISSUER_NOT_READY:
    "El emisor fiscal no está listo para administrar secuencias.",
  FISCAL_NUMBER_SEQUENCE_DOCUMENT_TYPE_INVALID:
    "El tipo de documento no admite configuración de secuencia.",
  FISCAL_NUMBER_SEQUENCE_INVALID:
    "El próximo consecutivo debe ser un entero decimal entre 1 y 9999999999.",
  FISCAL_NUMBER_SEQUENCE_DECREASE:
    "El próximo consecutivo no puede ser menor que el valor configurado.",
  FISCAL_NUMBER_SEQUENCE_PROVIDER_NOT_VERIFIED:
    "El proveedor no confirmó el modo integrador para este emisor.",
  FISCAL_NUMBER_SEQUENCE_CONFLICT:
    "La secuencia fiscal cambió concurrentemente. Consulte su estado e intente nuevamente.",
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

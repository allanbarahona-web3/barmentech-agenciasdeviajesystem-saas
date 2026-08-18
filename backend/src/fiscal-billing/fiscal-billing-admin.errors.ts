import { HttpException, HttpStatus } from "@nestjs/common";

export type FiscalBillingAdminErrorCode =
  | "BILLING_CONFIGURATION_INVALID_COUNTRY"
  | "BILLING_CONFIGURATION_INVALID_SCHEMA"
  | "FISCAL_ISSUER_NOT_FOUND"
  | "FISCAL_ISSUER_ACTIVATION_INCOMPLETE"
  | "FISCAL_ISSUER_ACTIVATION_CONFLICT";

const STATUS_BY_CODE: Record<FiscalBillingAdminErrorCode, HttpStatus> = {
  BILLING_CONFIGURATION_INVALID_COUNTRY: HttpStatus.UNPROCESSABLE_ENTITY,
  BILLING_CONFIGURATION_INVALID_SCHEMA: HttpStatus.UNPROCESSABLE_ENTITY,
  FISCAL_ISSUER_NOT_FOUND: HttpStatus.NOT_FOUND,
  FISCAL_ISSUER_ACTIVATION_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  FISCAL_ISSUER_ACTIVATION_CONFLICT: HttpStatus.CONFLICT,
};

export function fiscalBillingAdminError(
  code: FiscalBillingAdminErrorCode,
  details?: Record<string, unknown>,
): HttpException {
  const status = STATUS_BY_CODE[code];
  return new HttpException(
    { statusCode: status, error: code, code, ...(details ? { details } : {}) },
    status,
  );
}

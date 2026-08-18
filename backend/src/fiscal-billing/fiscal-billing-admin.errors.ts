import { HttpException, HttpStatus } from "@nestjs/common";

export type FiscalBillingAdminErrorCode =
  | "BILLING_CONFIGURATION_INVALID_COUNTRY"
  | "BILLING_CONFIGURATION_INVALID_SCHEMA";

export function fiscalBillingAdminError(
  code: FiscalBillingAdminErrorCode,
): HttpException {
  return new HttpException(
    { statusCode: HttpStatus.UNPROCESSABLE_ENTITY, error: code, code },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

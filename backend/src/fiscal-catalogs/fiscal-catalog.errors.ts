import { HttpException, HttpStatus } from "@nestjs/common";
import { CabysProviderError, CabysProviderErrorCode } from "./cabys-catalog.provider";

export type FiscalCatalogErrorCode = CabysProviderErrorCode | "TENANT_REQUIRED" | "UNSUPPORTED_COUNTRY" | "FISCAL_CATALOG_NOT_READY" | "FISCAL_CATALOG_ENTRY_NOT_FOUND" | "CABYS_NOT_FOUND";

export function fiscalCatalogError(code: FiscalCatalogErrorCode, status: HttpStatus): HttpException {
  return new HttpException({ statusCode: status, error: code, code }, status);
}

export function mapProviderError(error: unknown): HttpException {
  if (!(error instanceof CabysProviderError)) return fiscalCatalogError("CABYS_PROVIDER_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
  const status = error.code === "CABYS_PROVIDER_RATE_LIMITED" ? HttpStatus.TOO_MANY_REQUESTS : error.code === "CABYS_PROVIDER_INVALID_RESPONSE" ? HttpStatus.BAD_GATEWAY : HttpStatus.SERVICE_UNAVAILABLE;
  return fiscalCatalogError(error.code, status);
}

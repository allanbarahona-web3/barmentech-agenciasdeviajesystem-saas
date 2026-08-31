import { HttpException, HttpStatus } from "@nestjs/common";

export type TerritorialCatalogErrorCode = "TERRITORIAL_CATALOG_NOT_READY" | "TERRITORIAL_SUBDIVISION_NOT_FOUND";

const STATUS: Record<TerritorialCatalogErrorCode, HttpStatus> = {
  TERRITORIAL_CATALOG_NOT_READY: HttpStatus.SERVICE_UNAVAILABLE,
  TERRITORIAL_SUBDIVISION_NOT_FOUND: HttpStatus.NOT_FOUND,
};

export function territorialCatalogError(code: TerritorialCatalogErrorCode): HttpException {
  const status = STATUS[code];
  return new HttpException({ statusCode: status, error: code, code }, status);
}

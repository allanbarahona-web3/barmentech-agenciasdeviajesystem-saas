import { HttpException, HttpStatus } from '@nestjs/common';

export type FiscalArtifactReadErrorCode =
  | 'FISCAL_ARTIFACT_NOT_FOUND'
  | 'FISCAL_ARTIFACT_INVALID_REQUEST'
  | 'FISCAL_ARTIFACT_NOT_AVAILABLE'
  | 'FISCAL_ARTIFACT_UNAVAILABLE'
  | 'FISCAL_ARTIFACT_INTEGRITY_FAILURE'
  | 'FISCAL_ARTIFACT_DOWNLOAD_FAILED';

const statuses: Record<FiscalArtifactReadErrorCode, HttpStatus> = {
  FISCAL_ARTIFACT_NOT_FOUND: HttpStatus.NOT_FOUND,
  FISCAL_ARTIFACT_INVALID_REQUEST: HttpStatus.BAD_REQUEST,
  FISCAL_ARTIFACT_NOT_AVAILABLE: HttpStatus.CONFLICT,
  FISCAL_ARTIFACT_UNAVAILABLE: HttpStatus.CONFLICT,
  FISCAL_ARTIFACT_INTEGRITY_FAILURE: HttpStatus.CONFLICT,
  FISCAL_ARTIFACT_DOWNLOAD_FAILED: HttpStatus.SERVICE_UNAVAILABLE,
};

export function fiscalArtifactReadError(code: FiscalArtifactReadErrorCode): HttpException {
  const status = statuses[code];
  return new HttpException({ statusCode: status, error: code, code }, status);
}

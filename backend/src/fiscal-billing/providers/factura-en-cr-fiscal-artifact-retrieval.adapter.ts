import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FiscalArtifactRetrievalError,
  type FiscalArtifactRetrievalErrorCode,
  type FiscalArtifactRetrievalInput,
  type FiscalArtifactRetrievalPort,
  type FiscalArtifactRetrievalResult,
} from './fiscal-artifact-retrieval.provider';

const DEFAULT_BASE_URL = 'https://api.facturaencr.com/v2/efactura';
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_RETRY_AFTER_SECONDS = 86_400;

@Injectable()
export class FacturaEnCrFiscalArtifactRetrievalAdapter implements FiscalArtifactRetrievalPort {
  constructor(private readonly config: ConfigService) {}

  async retrieveFiscalArtifact(input: FiscalArtifactRetrievalInput): Promise<FiscalArtifactRetrievalResult> {
    validateInput(input);
    const configuration = this.configuration();
    const url = new URL(configuration.baseUrl.toString());
    const suffix = input.artifactType === 'SIGNED_FISCAL_XML' ? '/xml' : '/xml-respuesta';
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/documents/${encodeURIComponent(input.providerDocumentId)}${suffix}`;
    url.search = '';
    url.hash = '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), configuration.timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': configuration.apiKey,
          'X-API-Secret': configuration.apiSecret,
          Accept: 'application/xml, text/xml',
        },
        signal: controller.signal,
      });
      if (response.status < 200 || response.status >= 300) classifyHttpError(response.status, response.headers);
      const normalizedMimeType = normalizeMimeType(response.headers.get('content-type'));
      const bytes = await readBoundedBytes(response);
      if (bytes.length === 0) invalidResponse();
      return {
        bytes,
        normalizedMimeType,
        retrievedAt: new Date(),
        sourceEtag: normalizeEtag(response.headers.get('etag')),
      };
    } catch (error) {
      if (error instanceof FiscalArtifactRetrievalError) throw error;
      if (controller.signal.aborted || (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))) {
        throw safeError('FISCAL_ARTIFACT_RETRIEVAL_TIMEOUT', true);
      }
      throw safeError('FISCAL_ARTIFACT_RETRIEVAL_PROVIDER_UNAVAILABLE', true);
    } finally {
      clearTimeout(timer);
    }
  }

  private configuration() {
    const rawApiKey = this.config.get<unknown>('FACTURA_EN_CR_API_KEY', '');
    const rawApiSecret = this.config.get<unknown>('FACTURA_EN_CR_API_SECRET', '');
    const rawTimeout = this.config.get<unknown>('FACTURA_EN_CR_TIMEOUT_MS', String(DEFAULT_TIMEOUT_MS));
    const rawBaseUrl = this.config.get<unknown>('FACTURA_EN_CR_BASE_URL', DEFAULT_BASE_URL);
    if (typeof rawApiKey !== 'string' || typeof rawApiSecret !== 'string' || typeof rawTimeout !== 'string' || typeof rawBaseUrl !== 'string') configurationMissing();
    const apiKey = rawApiKey.trim();
    const apiSecret = rawApiSecret.trim();
    if (!apiKey || !apiSecret || !/^\d+$/.test(rawTimeout)) configurationMissing();
    const timeoutMs = Number(rawTimeout);
    if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) configurationMissing();
    let baseUrl: URL;
    try { baseUrl = new URL(rawBaseUrl.trim()); } catch { configurationMissing(); }
    if (baseUrl!.protocol !== 'https:' || !baseUrl!.hostname || baseUrl!.username || baseUrl!.password || baseUrl!.search || baseUrl!.hash) configurationMissing();
    baseUrl!.pathname = baseUrl!.pathname.replace(/\/+$/, '');
    return { apiKey, apiSecret, timeoutMs, baseUrl: baseUrl! };
  }
}

function validateInput(input: FiscalArtifactRetrievalInput): void {
  if (!record(input)) localInvalid();
  const value = input as unknown as Record<string, unknown>;
  if (
    typeof value.providerDocumentId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,255}$/.test(value.providerDocumentId) ||
    (value.artifactType !== 'SIGNED_FISCAL_XML' && value.artifactType !== 'TAX_AUTHORITY_RESPONSE_XML') ||
    (value.providerEnvironment !== 'sandbox' && value.providerEnvironment !== 'production')
  ) localInvalid();
}

async function readBoundedBytes(response: Response): Promise<Buffer> {
  const declared = response.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) responseTooLarge();
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        responseTooLarge();
      }
      chunks.push(part.value);
    }
  } catch (error) {
    if (error instanceof FiscalArtifactRetrievalError) throw error;
    throw safeError('FISCAL_ARTIFACT_RETRIEVAL_PROVIDER_UNAVAILABLE', true);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
}

function normalizeMimeType(value: string | null): 'application/xml' | 'text/xml' {
  if (!value) invalidResponse();
  const match = /^(application\/xml|text\/xml)(?:\s*;\s*charset\s*=\s*(?:[A-Za-z0-9._-]+|"[A-Za-z0-9._-]+"))?\s*$/i.exec(value!);
  if (!match) invalidResponse();
  return match![1].toLowerCase() as 'application/xml' | 'text/xml';
}

function normalizeEtag(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^"|"$/g, '');
  return /^[A-Za-z0-9._-]{1,255}$/.test(normalized) ? normalized : null;
}

function classifyHttpError(status: number, headers: Headers): never {
  if (status === 400) throw safeError('FISCAL_ARTIFACT_RETRIEVAL_REJECTED', false);
  if (status === 401) throw safeError('FISCAL_ARTIFACT_RETRIEVAL_AUTHENTICATION_FAILED', false);
  if (status === 403) throw safeError('FISCAL_ARTIFACT_RETRIEVAL_ACCESS_FORBIDDEN', false);
  if (status === 404) throw safeError('FISCAL_ARTIFACT_RETRIEVAL_NOT_FOUND', false);
  if (status === 429) throw safeError('FISCAL_ARTIFACT_RETRIEVAL_RATE_LIMITED', true, retryAfter(headers));
  if ([500, 502, 503, 504].includes(status)) throw safeError('FISCAL_ARTIFACT_RETRIEVAL_PROVIDER_UNAVAILABLE', true);
  if (status >= 400 && status < 500) throw safeError('FISCAL_ARTIFACT_RETRIEVAL_REJECTED', false);
  throw safeError('FISCAL_ARTIFACT_RETRIEVAL_PROVIDER_UNAVAILABLE', true);
}

function retryAfter(headers: Headers): number | null {
  const value = headers.get('retry-after');
  if (!value || !/^\d+$/.test(value)) return null;
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds > 0 && seconds <= MAX_RETRY_AFTER_SECONDS ? seconds : null;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function localInvalid(): never { throw safeError('FISCAL_ARTIFACT_RETRIEVAL_LOCAL_REQUEST_INVALID', false); }
function configurationMissing(): never { throw safeError('FISCAL_ARTIFACT_RETRIEVAL_CONFIGURATION_MISSING', false); }
function invalidResponse(): never { throw safeError('FISCAL_ARTIFACT_RETRIEVAL_INVALID_PROVIDER_RESPONSE', false); }
function responseTooLarge(): never { throw safeError('FISCAL_ARTIFACT_RETRIEVAL_RESPONSE_TOO_LARGE', false); }
function safeError(code: FiscalArtifactRetrievalErrorCode, retryable: boolean, retryAfterSeconds: number | null = null) { return new FiscalArtifactRetrievalError(code, retryable, retryAfterSeconds); }

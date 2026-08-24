import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ElectronicDocumentStatusError,
  type ElectronicDocumentStatusErrorCode,
  type ElectronicDocumentStatusLookupInput,
  type ElectronicDocumentStatusProvider,
  type ElectronicDocumentStatusResult,
} from "./electronic-document-status.provider";

const DEFAULT_BASE_URL = "https://api.facturaencr.com/v2/efactura";
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_RETRY_AFTER_SECONDS = 86_400;

@Injectable()
export class FacturaEnCrDocumentStatusAdapter
  implements ElectronicDocumentStatusProvider
{
  constructor(private readonly config: ConfigService) {}

  async getDocumentStatus(
    input: ElectronicDocumentStatusLookupInput,
  ): Promise<ElectronicDocumentStatusResult> {
    validateInput(input);
    const configuration = this.configuration();
    const url = new URL(configuration.baseUrl.toString());
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/documents/${encodeURIComponent(input.providerDocumentId)}`;
    url.search = "";
    url.hash = "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), configuration.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-API-Key": configuration.apiKey,
          "X-API-Secret": configuration.apiSecret,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      if (response.status === 200) {
        return normalizeResponse(await readBoundedBody(response), input);
      }
      if (response.status >= 200 && response.status < 300) invalidResponse();
      classifyHttpError(response.status, response.headers);
    } catch (error) {
      if (error instanceof ElectronicDocumentStatusError) throw error;
      if (
        controller.signal.aborted ||
        (error instanceof Error &&
          (error.name === "AbortError" || error.name === "TimeoutError"))
      ) {
        throw safeError("ELECTRONIC_DOCUMENT_STATUS_TIMEOUT");
      }
      throw safeError("ELECTRONIC_DOCUMENT_STATUS_PROVIDER_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }
  }

  private configuration() {
    const rawApiKey = this.config.get<unknown>("FACTURA_EN_CR_API_KEY", "");
    const rawApiSecret = this.config.get<unknown>("FACTURA_EN_CR_API_SECRET", "");
    const rawTimeout = this.config.get<unknown>(
      "FACTURA_EN_CR_TIMEOUT_MS",
      String(DEFAULT_TIMEOUT_MS),
    );
    const rawBaseUrl = this.config.get<unknown>(
      "FACTURA_EN_CR_BASE_URL",
      DEFAULT_BASE_URL,
    );
    if (
      typeof rawApiKey !== "string" ||
      typeof rawApiSecret !== "string" ||
      typeof rawTimeout !== "string" ||
      typeof rawBaseUrl !== "string"
    ) configurationMissing();
    const apiKey = rawApiKey.trim();
    const apiSecret = rawApiSecret.trim();
    if (!apiKey || !apiSecret || !/^\d+$/.test(rawTimeout)) configurationMissing();
    const timeoutMs = Number(rawTimeout);
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < MIN_TIMEOUT_MS ||
      timeoutMs > MAX_TIMEOUT_MS
    ) configurationMissing();
    let baseUrl: URL;
    try {
      baseUrl = new URL(rawBaseUrl.trim());
    } catch {
      configurationMissing();
    }
    if (
      baseUrl!.protocol !== "https:" ||
      !baseUrl!.hostname ||
      baseUrl!.username ||
      baseUrl!.password ||
      baseUrl!.search ||
      baseUrl!.hash
    ) configurationMissing();
    baseUrl!.pathname = baseUrl!.pathname.replace(/\/+$/, "");
    return { apiKey, apiSecret, timeoutMs, baseUrl: baseUrl! };
  }
}

function validateInput(input: ElectronicDocumentStatusLookupInput): void {
  if (!record(input)) localInvalid();
  const candidate = input as unknown as Record<string, unknown>;
  const providerDocumentId = candidate.providerDocumentId;
  const expectedHaciendaKey = candidate.expectedHaciendaKey;
  const expectedConsecutive = candidate.expectedConsecutive;
  const expectedProviderEnvironment = candidate.expectedProviderEnvironment;
  const expectedFiscalIssueDate = candidate.expectedFiscalIssueDate;
  const expectedDocumentType = candidate.expectedDocumentType;
  if (
    typeof providerDocumentId !== "string" ||
    typeof expectedHaciendaKey !== "string" ||
    typeof expectedConsecutive !== "string" ||
    typeof expectedProviderEnvironment !== "string" ||
    typeof expectedFiscalIssueDate !== "string" ||
    typeof expectedDocumentType !== "string" ||
    !/^[A-Za-z0-9_-]{1,255}$/.test(providerDocumentId) ||
    !/^\d{50}$/.test(expectedHaciendaKey) ||
    !/^\d{20}$/.test(expectedConsecutive) ||
    (expectedProviderEnvironment !== "sandbox" &&
      expectedProviderEnvironment !== "production") ||
    (expectedDocumentType !== "01" && expectedDocumentType !== "04") ||
    !canonicalDate(expectedFiscalIssueDate) ||
    expectedConsecutive.slice(8, 10) !== expectedDocumentType ||
    !validHaciendaKey(
      expectedHaciendaKey,
      expectedConsecutive,
      expectedFiscalIssueDate,
    )
  ) localInvalid();
}

async function readBoundedBody(response: Response): Promise<string> {
  const declared = response.headers.get("content-length");
  if (
    declared &&
    (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)
  ) invalidResponse();
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let result = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        invalidResponse();
      }
      result += decoder.decode(part.value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } catch (error) {
    if (error instanceof ElectronicDocumentStatusError) throw error;
    invalidResponse();
  }
}

function normalizeResponse(
  text: string,
  input: ElectronicDocumentStatusLookupInput,
): ElectronicDocumentStatusResult {
  let value: unknown;
  try {
    if (!text.trim()) invalidResponse();
    value = JSON.parse(text);
  } catch (error) {
    if (error instanceof ElectronicDocumentStatusError) throw error;
    invalidResponse();
  }
  if (!record(value) || value.error !== undefined) invalidResponse();
  const providerDocumentId = patterned(value.documentId, /^[A-Za-z0-9_-]{1,255}$/);
  const haciendaKey = patterned(value.clave, /^\d{50}$/);
  const consecutive = patterned(value.consecutivo, /^\d{20}$/);
  const providerStatus = patterned(value.status, /^[a-z][a-z0-9_]{0,63}$/);
  const documentType = patterned(value.documentType, /^\d{2}$/);
  if (
    (value.environment !== "sandbox" && value.environment !== "production") ||
    providerDocumentId !== input.providerDocumentId ||
    haciendaKey !== input.expectedHaciendaKey ||
    consecutive !== input.expectedConsecutive ||
    value.environment !== input.expectedProviderEnvironment ||
    documentType !== input.expectedDocumentType ||
    consecutive.slice(8, 10) !== documentType ||
    !validHaciendaKey(haciendaKey, consecutive, input.expectedFiscalIssueDate)
  ) invalidResponse();

  let fiscalIssuedAt: string | null = null;
  if (value.issueDate !== undefined && value.issueDate !== null) {
    fiscalIssuedAt = patterned(value.issueDate, /^.{1,64}$/);
    if (
      !rfc3339(fiscalIssuedAt) ||
      costaRicaDate(fiscalIssuedAt) !== input.expectedFiscalIssueDate
    ) invalidResponse();
  }
  const rejected = providerStatus === "rejected";
  let rejectionDetail: string | null = null;
  if (value.haciendaMessage !== undefined && value.haciendaMessage !== null) {
    if (!rejected || typeof value.haciendaMessage !== "string") invalidResponse();
    rejectionDetail = value.haciendaMessage.trim();
    if (
      !rejectionDetail ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(rejectionDetail)
    ) invalidResponse();
  }
  const accepted = providerStatus === "accepted";
  return {
    classification: "ELECTRONIC_DOCUMENT_STATUS",
    providerDocumentId,
    haciendaKey,
    consecutive,
    providerEnvironment: value.environment,
    providerStatus,
    final: accepted || rejected,
    finalDecision: accepted ? "ACCEPTED" : rejected ? "REJECTED" : null,
    fiscalIssuedAt,
    rejectionDetail,
  };
}

function classifyHttpError(status: number, headers: Headers): never {
  if (status === 401) throw safeError("ELECTRONIC_DOCUMENT_STATUS_AUTHENTICATION_FAILED");
  if (status === 403) throw safeError("ELECTRONIC_DOCUMENT_STATUS_AUTHORIZATION_FAILED");
  if (status === 404) throw safeError("ELECTRONIC_DOCUMENT_STATUS_NOT_FOUND");
  if (status === 429) {
    throw safeError("ELECTRONIC_DOCUMENT_STATUS_RATE_LIMITED", retryAfter(headers));
  }
  if ([500, 502, 503, 504].includes(status)) {
    throw safeError("ELECTRONIC_DOCUMENT_STATUS_PROVIDER_UNAVAILABLE");
  }
  if (status >= 400 && status < 500) {
    throw safeError("ELECTRONIC_DOCUMENT_STATUS_LOOKUP_REJECTED");
  }
  throw safeError("ELECTRONIC_DOCUMENT_STATUS_PROVIDER_UNAVAILABLE");
}

function retryAfter(headers: Headers): number | null {
  const value = headers.get("retry-after");
  if (!value || !/^\d+$/.test(value)) return null;
  const seconds = Number(value);
  return Number.isInteger(seconds) &&
    seconds > 0 &&
    seconds <= MAX_RETRY_AFTER_SECONDS
    ? seconds
    : null;
}

function rfc3339(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  return !!match &&
    validDate(+match[1], +match[2], +match[3]) &&
    +match[4] <= 23 &&
    +match[5] <= 59 &&
    +match[6] <= 59 &&
    +(match[7] ?? 0) <= 23 &&
    +(match[8] ?? 0) <= 59 &&
    Number.isFinite(new Date(value).getTime());
}

function costaRicaDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function validHaciendaKey(key: string, consecutive: string, date: string) {
  return key.startsWith("506") &&
    key.slice(21, 41) === consecutive &&
    /^[1-3]$/.test(key[41]) &&
    key.slice(3, 9) === `${date.slice(8, 10)}${date.slice(5, 7)}${date.slice(2, 4)}`;
}

function canonicalDate(value: unknown): value is string {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return !!match && validDate(+match[1], +match[2], +match[3]);
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function patterned(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) invalidResponse();
  return value as string;
}

function localInvalid(): never {
  throw safeError("ELECTRONIC_DOCUMENT_STATUS_LOCAL_REQUEST_INVALID");
}

function configurationMissing(): never {
  throw safeError("ELECTRONIC_DOCUMENT_STATUS_CONFIGURATION_MISSING");
}

function invalidResponse(): never {
  throw safeError("ELECTRONIC_DOCUMENT_STATUS_INVALID_PROVIDER_RESPONSE");
}

function safeError(
  code: ElectronicDocumentStatusErrorCode,
  retryAfterSeconds: number | null = null,
) {
  return new ElectronicDocumentStatusError(code, retryAfterSeconds);
}

import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ElectronicDocumentSubmissionError, type ElectronicDocumentSubmissionAcknowledgement, type ElectronicDocumentSubmissionErrorCode, type ElectronicDocumentSubmissionProvider, type ElectronicSubmissionOutcome, type PreparedElectronicDocumentSubmission } from "./electronic-document-submission.provider";

const DEFAULT_BASE_URL = "https://api.facturaencr.com/v2/efactura";
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_RETRY_AFTER_SECONDS = 86_400;

@Injectable()
export class FacturaEnCrElectronicSubmissionAdapter implements ElectronicDocumentSubmissionProvider {
  constructor(private readonly config: ConfigService) {}

  async submitElectronicDocument(prepared: PreparedElectronicDocumentSubmission): Promise<ElectronicDocumentSubmissionAcknowledgement> {
    validatePrepared(prepared);
    const actualHash = createHash("sha256").update(prepared.canonicalBody, "utf8").digest("hex");
    if (actualHash !== prepared.requestHash) localInvalid();
    const configuration = this.configuration();
    const url = new URL(configuration.baseUrl.toString());
    url.pathname = `${url.pathname.replace(/\/+$/, "")}${prepared.endpoint}`;
    url.search = ""; url.hash = "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), configuration.timeoutMs);
    let dispatched = false;
    try {
      dispatched = true;
      const response = await fetch(url, {
        method: "POST",
        headers: { "X-API-Key": configuration.apiKey, "X-API-Secret": configuration.apiSecret,
          "Content-Type": "application/json", Accept: "application/json", "Idempotency-Key": prepared.idempotencyKey },
        body: prepared.canonicalBody,
        signal: controller.signal,
      });
      if (response.status === 202) {
        let text: string; try { text = await readBoundedBody(response); } catch { invalidResponse("UNKNOWN_REQUIRES_RECONCILIATION"); }
        return normalizeAcknowledgement(text!, prepared);
      }
      if (response.status >= 200 && response.status < 300) invalidResponse("UNKNOWN_REQUIRES_RECONCILIATION");
      let conflictBody = "";
      if (response.status === 409) {
        try { conflictBody = await readBoundedBody(response); }
        catch { throw safeError("ELECTRONIC_SUBMISSION_CONFLICT", "DEFINITE_REJECTION"); }
      }
      classifyHttpError(response.status, conflictBody, response.headers);
    } catch (error) {
      if (error instanceof ElectronicDocumentSubmissionError) throw error;
      if (controller.signal.aborted || error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
        throw safeError("ELECTRONIC_SUBMISSION_TIMEOUT", dispatched ? "UNKNOWN_REQUIRES_RECONCILIATION" : "RETRY_SAME_REQUEST");
      }
      throw safeError("ELECTRONIC_SUBMISSION_PROVIDER_UNAVAILABLE", dispatched ? "UNKNOWN_REQUIRES_RECONCILIATION" : "RETRY_SAME_REQUEST");
    } finally { clearTimeout(timer); }
  }

  private configuration() {
    const rawApiKey = this.config.get<unknown>("FACTURA_EN_CR_API_KEY", "");
    const rawApiSecret = this.config.get<unknown>("FACTURA_EN_CR_API_SECRET", "");
    const rawTimeout = this.config.get<unknown>("FACTURA_EN_CR_TIMEOUT_MS", String(DEFAULT_TIMEOUT_MS));
    const rawBaseUrl = this.config.get<unknown>("FACTURA_EN_CR_BASE_URL", DEFAULT_BASE_URL);
    if (typeof rawApiKey !== "string" || typeof rawApiSecret !== "string" || typeof rawTimeout !== "string" || typeof rawBaseUrl !== "string") configurationMissing();
    const apiKey = rawApiKey.trim(), apiSecret = rawApiSecret.trim();
    if (!apiKey || !apiSecret || !/^\d+$/.test(rawTimeout)) configurationMissing();
    const timeoutMs = Number(rawTimeout);
    if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) configurationMissing();
    let baseUrl: URL;
    try { baseUrl = new URL(rawBaseUrl.trim()); }
    catch { configurationMissing(); }
    if (baseUrl!.protocol !== "https:" || !baseUrl.hostname || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) configurationMissing();
    baseUrl!.pathname = baseUrl!.pathname.replace(/\/+$/, "");
    return { apiKey, apiSecret, timeoutMs, baseUrl: baseUrl! };
  }
}

function validatePrepared(p: PreparedElectronicDocumentSubmission): void {
  if (!p || (p.endpoint !== "/documents/factura" && p.endpoint !== "/documents/tiquete") ||
    typeof p.canonicalBody !== "string" || !p.canonicalBody || !/^[a-f0-9]{64}$/.test(p.requestHash) ||
    typeof p.idempotencyKey !== "string" || !p.idempotencyKey || p.idempotencyKey.length > 100 ||
    !p.metadata || !/^(01|04)$/.test(p.metadata.documentTypeCode) || !/^\d{20}$/.test(p.metadata.fiscalNumber) || !canonicalDate(p.metadata.fiscalIssueDate) ||
    p.metadata.fiscalNumber.slice(8, 10) !== p.metadata.documentTypeCode ||
    (p.metadata.documentTypeCode === "01" ? p.endpoint !== "/documents/factura" : p.endpoint !== "/documents/tiquete")) localInvalid();
}

async function readBoundedBody(response: Response): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) invalidResponse("UNKNOWN_REQUIRES_RECONCILIATION");
  if (!response.body) return "";
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0, result = "";
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); invalidResponse("UNKNOWN_REQUIRES_RECONCILIATION"); }
      result += decoder.decode(part.value, { stream: true }); }
    result += decoder.decode(); return result;
  } catch (error) { if (error instanceof ElectronicDocumentSubmissionError) throw error; invalidResponse("UNKNOWN_REQUIRES_RECONCILIATION"); }
}

function normalizeAcknowledgement(text: string, prepared: PreparedElectronicDocumentSubmission): ElectronicDocumentSubmissionAcknowledgement {
  let value: unknown; try { if (!text.trim()) invalidResponse("UNKNOWN_REQUIRES_RECONCILIATION"); value = JSON.parse(text); } catch (error) { if (error instanceof ElectronicDocumentSubmissionError) throw error; invalidResponse("UNKNOWN_REQUIRES_RECONCILIATION"); }
  if (!record(value)) invalidResponse("UNKNOWN_REQUIRES_RECONCILIATION");
  if (value.error !== undefined) invalidResponse("UNKNOWN_REQUIRES_RECONCILIATION");
  const documentId = bounded(value.documentId, 255), key = patterned(value.clave, /^\d{50}$/), consecutive = patterned(value.consecutivo, /^\d{20}$/), status = patterned(value.status, /^[a-z][a-z0-9_]{0,63}$/);
  if ((value.environment !== "sandbox" && value.environment !== "production") || consecutive !== prepared.metadata.fiscalNumber ||
    consecutive.slice(8, 10) !== prepared.metadata.documentTypeCode || !validHaciendaKey(key, consecutive, prepared.metadata.fiscalIssueDate)) invalidResponse("UNKNOWN_REQUIRES_RECONCILIATION");
  let estimatedReadyAt: string | null = null;
  if (value.estimatedReadyAt !== undefined && value.estimatedReadyAt !== null) { estimatedReadyAt = bounded(value.estimatedReadyAt, 64); if (!rfc3339(estimatedReadyAt)) invalidResponse("UNKNOWN_REQUIRES_RECONCILIATION"); }
  const final = status === "accepted" || status === "rejected";
  return { classification: "ACKNOWLEDGED_PROVIDER_SUBMISSION", providerDocumentId: documentId, haciendaKey: key,
    consecutive, status: { providerStatus: status, final, accepted: status === "accepted", rejected: status === "rejected" },
    providerEnvironment: value.environment, estimatedReadyAt };
}

function classifyHttpError(status: number, text: string, headers: Headers): never {
  if (status === 400) throw safeError("ELECTRONIC_SUBMISSION_INVALID", "DEFINITE_REJECTION");
  if (status === 401) throw safeError("ELECTRONIC_SUBMISSION_AUTHENTICATION_FAILED", "CONFIGURATION_FAILURE");
  if (status === 403) throw safeError("ELECTRONIC_SUBMISSION_AUTHORIZATION_FAILED", "CONFIGURATION_FAILURE");
  if (status === 404) throw safeError("ELECTRONIC_SUBMISSION_ISSUER_NOT_READY", "DEFINITE_REJECTION");
  if (status === 409) {
    const body = safeConflictBody(text);
    if (body?.error === "idempotency_conflict") throw safeError("ELECTRONIC_SUBMISSION_IDEMPOTENCY_CONFLICT", "DEFINITE_REJECTION");
    if (body?.error === "idempotency_in_progress") throw safeError("ELECTRONIC_SUBMISSION_IDEMPOTENCY_IN_PROGRESS", "RETRY_SAME_REQUEST", safeSeconds(body.retryAfterSeconds, 3_600));
    throw safeError("ELECTRONIC_SUBMISSION_CONFLICT", "DEFINITE_REJECTION");
  }
  if (status === 413) throw safeError("ELECTRONIC_SUBMISSION_PAYLOAD_TOO_LARGE", "DEFINITE_REJECTION");
  if (status === 422) throw safeError("ELECTRONIC_SUBMISSION_FISCAL_RULE_REJECTED", "DEFINITE_REJECTION");
  if (status === 429) throw safeError("ELECTRONIC_SUBMISSION_RATE_LIMITED", "RETRY_SAME_REQUEST", retryAfter(headers));
  if ([500, 502, 503, 504].includes(status)) throw safeError("ELECTRONIC_SUBMISSION_PROVIDER_UNAVAILABLE", "UNKNOWN_REQUIRES_RECONCILIATION");
  throw safeError("ELECTRONIC_SUBMISSION_PROVIDER_UNAVAILABLE", "UNKNOWN_REQUIRES_RECONCILIATION");
}

function safeConflictBody(text: string): Record<string, unknown> | null { try { const value: unknown = JSON.parse(text); return record(value) && typeof value.error === "string" && value.error.length <= 100 ? value : null; } catch { return null; } }
function retryAfter(headers: Headers): number | null { const value = headers.get("retry-after"); return value && /^\d+$/.test(value) ? safeSeconds(Number(value), MAX_RETRY_AFTER_SECONDS) : null; }
function safeSeconds(value: unknown, max: number): number | null { return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0 && value <= max ? value : null; }
function rfc3339(value: string): boolean { const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);if(!match||!validDate(+match[1],+match[2],+match[3])||+match[4]>23||+match[5]>59||+match[6]>59||+(match[7]??0)>23||+(match[8]??0)>59)return false;return Number.isFinite(new Date(value).getTime()); }
function validHaciendaKey(key:string,consecutive:string,fiscalIssueDate:string){if(!key.startsWith("506")||key.slice(21,41)!==consecutive||!/^[1-3]$/.test(key[41]))return false;return key.slice(3,9)===`${fiscalIssueDate.slice(8,10)}${fiscalIssueDate.slice(5,7)}${fiscalIssueDate.slice(2,4)}`&&validDate(2000+Number(key.slice(7,9)),Number(key.slice(5,7)),Number(key.slice(3,5)));}
function canonicalDate(value:unknown):value is string{const match=typeof value==="string"?/^(\d{4})-(\d{2})-(\d{2})$/.exec(value):null;return !!match&&validDate(+match[1],+match[2],+match[3]);}
function validDate(year:number,month:number,day:number){const date=new Date(Date.UTC(year,month-1,day));return year>=1&&date.getUTCFullYear()===year&&date.getUTCMonth()+1===month&&date.getUTCDate()===day;}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function bounded(value: unknown, max: number): string { if (typeof value !== "string" || !value.trim() || value.length > max) invalidResponse("UNKNOWN_REQUIRES_RECONCILIATION"); return value as string; }
function patterned(value: unknown, pattern: RegExp): string { const text = bounded(value, 255); if (!pattern.test(text)) invalidResponse("UNKNOWN_REQUIRES_RECONCILIATION"); return text; }
function localInvalid(): never { throw safeError("ELECTRONIC_SUBMISSION_LOCAL_REQUEST_INVALID", "DEFINITE_REJECTION"); }
function configurationMissing(): never { throw safeError("ELECTRONIC_SUBMISSION_CONFIGURATION_MISSING", "CONFIGURATION_FAILURE"); }
function invalidResponse(outcome: ElectronicSubmissionOutcome): never { throw safeError("ELECTRONIC_SUBMISSION_INVALID_PROVIDER_RESPONSE", outcome); }
function safeError(code: ElectronicDocumentSubmissionErrorCode, outcome: ElectronicSubmissionOutcome, retryAfterSeconds: number | null = null) { return new ElectronicDocumentSubmissionError(code, outcome, retryAfterSeconds); }

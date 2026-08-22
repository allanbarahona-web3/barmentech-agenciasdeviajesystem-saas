import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OfficialExchangeRateProviderError } from "./official-exchange-rate.errors";
import type { OfficialExchangeRateProvider, OfficialExchangeRateRequest, OfficialExchangeRateResult, OfficialExchangeRateType } from "./official-exchange-rate.provider";

const DEFAULT_BASE_URL = "https://apim.bccr.fi.cr/SDDE/api/Bccr.GE.SDDE.Publico.Indicadores.API";
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;
const PROVIDER_MESSAGE_MAX_LENGTH = 1_000;
const DECIMAL_MARKER = "__bccr_sdde_exact_decimal__";
export const BCCR_MAX_DATE_RANGE_DAYS = 31;
export const BCCR_MAX_RESPONSE_BYTES = 256 * 1024;

type ValidatedRequest = OfficialExchangeRateRequest & { indicator: string; startDay: number; endDay: number };

@Injectable()
export class BccrOfficialExchangeRateAdapter implements OfficialExchangeRateProvider {
  constructor(private readonly config: ConfigService) {}

  async getObservations(request: OfficialExchangeRateRequest): Promise<OfficialExchangeRateResult> {
    const validated = validateRequest(request);
    const configuration = this.configuration();
    const url = buildUrl(validated, configuration.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), configuration.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${configuration.token}`, Accept: "application/json" },
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) fail("BCCR_EXCHANGE_RATE_AUTHENTICATION_FAILED");
      if (response.status === 429) fail("BCCR_EXCHANGE_RATE_RATE_LIMITED");
      if (!response.ok) fail("BCCR_EXCHANGE_RATE_UNAVAILABLE");
      const body = await readBoundedBody(response);
      return {
        sourceAuthority: "BCCR",
        countryCode: "CR",
        foreignCurrencyCode: "USD",
        localCurrencyCode: "CRC",
        rateType: request.rateType,
        sourceIndicatorCode: validated.indicator,
        observations: normalizeJson(body, validated),
      };
    } catch (error) {
      if (error instanceof OfficialExchangeRateProviderError) throw error;
      if (controller.signal.aborted || (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))) {
        fail("BCCR_EXCHANGE_RATE_TIMEOUT");
      }
      fail("BCCR_EXCHANGE_RATE_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }
  }

  private configuration() {
    const token = this.config.get<string>("BCCR_SDDE_API_TOKEN", "").trim();
    if (!token) configurationMissing();
    const rawTimeout = this.config.get<string>("BCCR_SDDE_TIMEOUT_MS", String(DEFAULT_TIMEOUT_MS));
    if (!/^\d+$/.test(rawTimeout)) configurationMissing();
    const timeoutMs = Number(rawTimeout);
    if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) configurationMissing();
    const rawBaseUrl = this.config.get<string>("BCCR_SDDE_BASE_URL", DEFAULT_BASE_URL).trim();
    let baseUrl: URL;
    try { baseUrl = new URL(rawBaseUrl); } catch { configurationMissing(); }
    if (baseUrl.protocol !== "https:") configurationMissing();
    return { baseUrl, token, timeoutMs };
  }
}

function buildUrl(request: ValidatedRequest, baseUrl: URL): URL {
  const url = new URL(baseUrl.toString());
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/indicadoresEconomicos/${request.indicator}/series`;
  url.search = new URLSearchParams({ fechaInicio: toSddeDate(request.startDate), fechaFin: toSddeDate(request.endDate), idioma: "ES" }).toString();
  url.hash = "";
  return url;
}

function validateRequest(request: OfficialExchangeRateRequest): ValidatedRequest {
  if (request.countryCode !== "CR" || request.foreignCurrencyCode !== "USD" || request.localCurrencyCode !== "CRC") requestInvalid();
  const indicator = indicatorFor(request.rateType);
  const startDay = parseDateOnly(request.startDate, requestInvalid);
  const endDay = parseDateOnly(request.endDate, requestInvalid);
  if (startDay > endDay || endDay - startDay >= BCCR_MAX_DATE_RANGE_DAYS) requestInvalid();
  return { ...request, indicator, startDay, endDay };
}

function indicatorFor(rateType: OfficialExchangeRateType): string {
  switch (rateType) {
    case "REFERENCE_BUY": return "317";
    case "REFERENCE_SELL": return "318";
    default: requestInvalid();
  }
}

function parseDateOnly(value: string, onInvalid: () => never): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) onInvalid();
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) onInvalid();
  return Math.trunc(timestamp / 86_400_000);
}

function toSddeDate(value: string): string { return value.replace(/-/g, "/"); }

async function readBoundedBody(response: Response): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > BCCR_MAX_RESPONSE_BYTES) invalidResponse();
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0; let result = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > BCCR_MAX_RESPONSE_BYTES) { await reader.cancel(); invalidResponse(); }
      result += decoder.decode(part.value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } catch (error) {
    if (error instanceof OfficialExchangeRateProviderError) throw error;
    invalidResponse();
  }
}

function normalizeJson(body: string, request: ValidatedRequest) {
  try {
    const root = parseWithExactDecimals(body);
    if (!isRecord(root) || typeof root.estado !== "boolean") invalidResponse();
    if (root.mensaje !== undefined && (typeof root.mensaje !== "string" || root.mensaje.length > PROVIDER_MESSAGE_MAX_LENGTH)) invalidResponse();
    if (root.estado !== true || !Array.isArray(root.datos)) invalidResponse();
    if (root.datos.length === 0) return [];
    const matching = root.datos.filter((entry) => isRecord(entry) && entry.codigoIndicador === request.indicator);
    if (matching.length !== 1) invalidResponse();
    const container = matching[0];
    if (!Array.isArray(container.series)) invalidResponse();
    const observations = [];
    const seen = new Set<string>();
    for (const entry of container.series) {
      if (!isRecord(entry) || typeof entry.fecha !== "string") invalidResponse();
      const day = parseDateOnly(entry.fecha, invalidResponse);
      if (day < request.startDay || day > request.endDay || seen.has(entry.fecha)) invalidResponse();
      seen.add(entry.fecha);
      if (entry.valorDatoPorPeriodo === null) continue;
      const value = exactDecimalValue(entry.valorDatoPorPeriodo);
      validateDecimal(value);
      observations.push({ effectiveDate: entry.fecha, value, sourceIndicatorCode: request.indicator, sourcePublishedAt: null as null });
    }
    return observations;
  } catch (error) {
    if (error instanceof OfficialExchangeRateProviderError) throw error;
    invalidResponse();
  }
}

function parseWithExactDecimals(body: string): unknown {
  if (!body.trim()) invalidResponse();
  let transformed = ""; let index = 0;
  while (index < body.length) {
    if (body[index] !== '"') { transformed += body[index++]; continue; }
    const end = jsonStringEnd(body, index);
    const token = body.slice(index, end);
    const decoded = JSON.parse(token) as unknown;
    if (decoded === DECIMAL_MARKER) invalidResponse();
    transformed += token;
    let cursor = end;
    while (/\s/.test(body[cursor] ?? "")) cursor++;
    if (decoded !== "valorDatoPorPeriodo" || body[cursor] !== ":") { index = end; continue; }
    transformed += body.slice(end, cursor + 1);
    cursor++;
    while (/\s/.test(body[cursor] ?? "")) transformed += body[cursor++];
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(body.slice(cursor));
    if (number) {
      transformed += `{"${DECIMAL_MARKER}":"${number[0]}"}`;
      index = cursor + number[0].length;
    } else index = cursor;
  }
  return JSON.parse(transformed) as unknown;
}

function jsonStringEnd(body: string, start: number): number {
  let escaped = false;
  for (let index = start + 1; index < body.length; index++) {
    const character = body[index];
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === '"') return index + 1;
  }
  invalidResponse();
}

function exactDecimalValue(value: unknown): string {
  if (!isRecord(value) || Object.keys(value).length !== 1 || typeof value[DECIMAL_MARKER] !== "string") invalidResponse();
  return value[DECIMAL_MARKER];
}

function validateDecimal(value: string): void {
  const match = /^((?:0|[1-9]\d*))(?:\.(\d+))?$/.exec(value);
  if (!match) invalidResponse();
  const significantFraction = match[2]?.replace(/0+$/, "") ?? "";
  if ((match[1] === "0" && !significantFraction) || match[1].length > 18 || significantFraction.length > 12) invalidResponse();
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function configurationMissing(): never { fail("BCCR_EXCHANGE_RATE_CONFIGURATION_MISSING"); }
function requestInvalid(): never { fail("BCCR_EXCHANGE_RATE_REQUEST_INVALID"); }
function invalidResponse(): never { fail("BCCR_EXCHANGE_RATE_INVALID_RESPONSE"); }
function fail(code: ConstructorParameters<typeof OfficialExchangeRateProviderError>[0]): never { throw new OfficialExchangeRateProviderError(code); }

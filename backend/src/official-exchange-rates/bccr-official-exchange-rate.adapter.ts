import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OfficialExchangeRateProviderError } from "./official-exchange-rate.errors";
import type {
  OfficialExchangeRateProvider,
  OfficialExchangeRateRequest,
  OfficialExchangeRateResult,
  OfficialExchangeRateType,
} from "./official-exchange-rate.provider";

const DEFAULT_BASE_URL =
  "https://gee.bccr.fi.cr/Indicadores/Suscripciones/WS/wsindicadoreseconomicos.asmx";
const OPERATION = "ObtenerIndicadoresEconomicosXML";
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;
export const BCCR_MAX_DATE_RANGE_DAYS = 31;
export const BCCR_MAX_RESPONSE_BYTES = 256 * 1024;

type ValidatedRequest = OfficialExchangeRateRequest & {
  indicator: string;
  startDay: number;
  endDay: number;
};

@Injectable()
export class BccrOfficialExchangeRateAdapter
  implements OfficialExchangeRateProvider
{
  constructor(private readonly config: ConfigService) {}

  async getObservations(
    request: OfficialExchangeRateRequest,
  ): Promise<OfficialExchangeRateResult> {
    const validated = validateRequest(request);
    const configuration = this.configuration();
    const url = buildUrl(validated, configuration);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), configuration.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/xml, text/xml" },
        signal: controller.signal,
      });
      if (response.status === 429) fail("BCCR_EXCHANGE_RATE_RATE_LIMITED");
      if (!response.ok) fail("BCCR_EXCHANGE_RATE_UNAVAILABLE");
      const xml = await readBoundedBody(response);
      return {
        sourceAuthority: "BCCR",
        countryCode: "CR",
        foreignCurrencyCode: "USD",
        localCurrencyCode: "CRC",
        rateType: request.rateType,
        sourceIndicatorCode: validated.indicator,
        observations: normalizeXml(xml, validated),
      };
    } catch (error) {
      if (error instanceof OfficialExchangeRateProviderError) throw error;
      if (
        controller.signal.aborted ||
        (error instanceof Error &&
          (error.name === "AbortError" || error.name === "TimeoutError"))
      ) {
        fail("BCCR_EXCHANGE_RATE_TIMEOUT");
      }
      fail("BCCR_EXCHANGE_RATE_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }
  }

  private configuration() {
    const subscriptionName = this.requiredSecret("BCCR_SUBSCRIPTION_NAME");
    const subscriptionEmail = this.requiredSecret("BCCR_SUBSCRIPTION_EMAIL");
    const subscriptionToken = this.requiredSecret("BCCR_SUBSCRIPTION_TOKEN");
    const rawTimeout = this.config.get<string>(
      "BCCR_INDICATORS_TIMEOUT_MS",
      String(DEFAULT_TIMEOUT_MS),
    );
    if (!/^\d+$/.test(rawTimeout)) configurationMissing();
    const timeoutMs = Number(rawTimeout);
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < MIN_TIMEOUT_MS ||
      timeoutMs > MAX_TIMEOUT_MS
    ) {
      configurationMissing();
    }
    const rawBaseUrl = this.config
      .get<string>("BCCR_INDICATORS_BASE_URL", DEFAULT_BASE_URL)
      .trim();
    let baseUrl: URL;
    try {
      baseUrl = new URL(rawBaseUrl);
    } catch {
      configurationMissing();
    }
    if (!["https:", "http:"].includes(baseUrl.protocol)) {
      configurationMissing();
    }
    return {
      baseUrl,
      subscriptionName,
      subscriptionEmail,
      subscriptionToken,
      timeoutMs,
    };
  }

  private requiredSecret(key: string): string {
    const value = this.config.get<string>(key, "").trim();
    if (!value) configurationMissing();
    return value;
  }
}

function buildUrl(
  request: ValidatedRequest,
  configuration: {
    baseUrl: URL;
    subscriptionName: string;
    subscriptionEmail: string;
    subscriptionToken: string;
  },
): URL {
  const url = new URL(configuration.baseUrl.toString());
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${OPERATION}`;
  url.search = new URLSearchParams({
    Indicador: request.indicator,
    FechaInicio: toBccrDate(request.startDate),
    FechaFinal: toBccrDate(request.endDate),
    Nombre: configuration.subscriptionName,
    SubNiveles: "N",
    CorreoElectronico: configuration.subscriptionEmail,
    Token: configuration.subscriptionToken,
  }).toString();
  url.hash = "";
  return url;
}

function validateRequest(request: OfficialExchangeRateRequest): ValidatedRequest {
  if (
    request.countryCode !== "CR" ||
    request.foreignCurrencyCode !== "USD" ||
    request.localCurrencyCode !== "CRC"
  ) {
    requestInvalid();
  }
  const indicator = indicatorFor(request.rateType);
  const startDay = parseDateOnly(request.startDate);
  const endDay = parseDateOnly(request.endDate);
  if (
    startDay > endDay ||
    endDay - startDay >= BCCR_MAX_DATE_RANGE_DAYS
  ) {
    requestInvalid();
  }
  return {
    ...request,
    indicator,
    startDay,
    endDay,
  };
}

function indicatorFor(rateType: OfficialExchangeRateType): string {
  switch (rateType) {
    case "REFERENCE_BUY":
      return "317";
    case "REFERENCE_SELL":
      return "318";
    default:
      requestInvalid();
  }
}

function parseDateOnly(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) requestInvalid();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    year < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    requestInvalid();
  }
  return Math.trunc(timestamp / 86_400_000);
}

function toBccrDate(value: string): string {
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

async function readBoundedBody(response: Response): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > BCCR_MAX_RESPONSE_BYTES) {
    invalidResponse();
  }
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
      if (size > BCCR_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        invalidResponse();
      }
      result += decoder.decode(part.value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } catch (error) {
    if (error instanceof OfficialExchangeRateProviderError) throw error;
    invalidResponse();
  }
}

function normalizeXml(xml: string, request: ValidatedRequest) {
  try {
    if (!xml.trim() || /<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(xml)) {
      invalidResponse();
    }
    const outer = xml
      .replace(/^\uFEFF/, "")
      .replace(/^\s*<\?xml[^?]*\?>\s*/i, "")
      .trim();
    const envelope = /^<string(?:\s+xmlns=(?:"[^"]*"|'[^']*'))?\s*>([\s\S]*)<\/string>$/.exec(outer);
    if (!envelope) invalidResponse();
    let dataset = envelope[1].trim();
    if (!dataset) return [];
    if (!dataset.startsWith("<")) dataset = decodeXmlText(dataset);
    dataset = dataset.replace(/^\s*<\?xml[^?]*\?>\s*/i, "").trim();
    if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[|<\?xml/i.test(dataset)) invalidResponse();

    const root = /^<((?:[A-Za-z_][\w.-]*:)?)Datos_de_INGC011_CAT_INDICADORECONOMIC((?:\s+xmlns(?::[A-Za-z_][\w.-]*)?=(?:"[^"]*"|'[^']*'))*)\s*(?:\/\s*>|>([\s\S]*)<\/\1Datos_de_INGC011_CAT_INDICADORECONOMIC\s*>)$/.exec(dataset);
    if (!root) invalidResponse();
    const prefix = root[1];
    if (prefix && !declaresPrefix(root[2], prefix.slice(0, -1))) {
      invalidResponse();
    }
    const content = root[3]?.trim() ?? "";
    if (!content) return [];
    const rowPattern = new RegExp(
      `<${prefix}INGC011_CAT_INDICADORECONOMIC\\s*>([\\s\\S]*?)<\\/${prefix}INGC011_CAT_INDICADORECONOMIC\\s*>`,
      "g",
    );
    const observations = [];
    const seen = new Set<string>();
    let consumed = "";
    let cursor = 0;
    for (const match of content.matchAll(rowPattern)) {
      const index = match.index!;
      consumed += content.slice(cursor, index);
      cursor = index + match[0].length;
      const fields = parseRow(match[1], prefix);
      if (fields.indicator !== request.indicator) invalidResponse();
      const effectiveDate = normalizeProviderDate(fields.date);
      const day = parseDateOnly(effectiveDate);
      if (day < request.startDay || day > request.endDay || seen.has(effectiveDate)) {
        invalidResponse();
      }
      seen.add(effectiveDate);
      observations.push({
        effectiveDate,
        value: normalizeDecimal(fields.value),
        sourceIndicatorCode: request.indicator,
        sourcePublishedAt: null as null,
      });
    }
    consumed += content.slice(cursor);
    if (consumed.trim() || observations.length === 0) invalidResponse();
    return observations;
  } catch (error) {
    if (error instanceof OfficialExchangeRateProviderError) throw error;
    invalidResponse();
  }
}

function declaresPrefix(attributes: string, prefix: string): boolean {
  const declarations = attributes.matchAll(
    /\s+xmlns:([A-Za-z_][\w.-]*)=(?:"[^"]+"|'[^']+')/g,
  );
  return [...declarations].some((declaration) => declaration[1] === prefix);
}

function parseRow(
  row: string,
  prefix: string,
): { indicator: string; date: string; value: string } {
  const names = ["COD_INDICADORINTERNO", "DES_FECHA", "NUM_VALOR"] as const;
  const values = new Map<string, string>();
  let remainder = row;
  for (const name of names) {
    const pattern = new RegExp(
      `<${prefix}${name}\\s*>([^<]*)<\\/${prefix}${name}\\s*>`,
    );
    const match = pattern.exec(remainder);
    if (!match || values.has(name)) invalidResponse();
    values.set(name, decodeXmlText(match[1]).trim());
    remainder = remainder.slice(0, match.index) + remainder.slice(match.index + match[0].length);
  }
  if (remainder.trim()) invalidResponse();
  return {
    indicator: values.get(names[0])!,
    date: values.get(names[1])!,
    value: values.get(names[2])!,
  };
}

function normalizeProviderDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.0+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(value.trim());
  if (!match) invalidResponse();
  const canonical = `${match[1]}-${match[2]}-${match[3]}`;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    invalidResponse();
  }
  return canonical;
}

function normalizeDecimal(value: string): string {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized) || /^0(?:\.0+)?$/.test(normalized)) {
    invalidResponse();
  }
  return normalized;
}

function decodeXmlText(value: string): string {
  if (/&(?:#|[A-Za-z])/.test(value.replace(/&(amp|lt|gt|quot|apos);/g, ""))) {
    invalidResponse();
  }
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function configurationMissing(): never {
  fail("BCCR_EXCHANGE_RATE_CONFIGURATION_MISSING");
}

function requestInvalid(): never {
  fail("BCCR_EXCHANGE_RATE_REQUEST_INVALID");
}

function invalidResponse(): never {
  fail("BCCR_EXCHANGE_RATE_INVALID_RESPONSE");
}

function fail(code: ConstructorParameters<typeof OfficialExchangeRateProviderError>[0]): never {
  throw new OfficialExchangeRateProviderError(code);
}

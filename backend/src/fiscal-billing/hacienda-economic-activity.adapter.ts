import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  HaciendaActivityLookupError,
  type HaciendaEconomicActivity,
  type HaciendaEconomicActivityProvider,
  type HaciendaTaxpayerActivities,
} from "./hacienda-economic-activity.provider";

const DEFAULT_URL = "https://api.hacienda.go.cr/fe/ae";
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;

@Injectable()
export class HaciendaEconomicActivityAdapter
  implements HaciendaEconomicActivityProvider
{
  constructor(private readonly config: ConfigService) {}

  async findByIdentification(
    identificationNumber: string,
  ): Promise<HaciendaTaxpayerActivities> {
    const url = new URL(
      this.config.get<string>("HACIENDA_ACTIVITY_LOOKUP_BASE_URL") ??
        DEFAULT_URL,
    );
    url.searchParams.set("identificacion", identificationNumber);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());
    let response: Response;
    try {
      response = await fetch(url, { method: "GET", signal: controller.signal });
    } catch (error) {
      if (isAbortError(error)) {
        throw new HaciendaActivityLookupError(
          "HACIENDA_ACTIVITY_LOOKUP_TIMEOUT",
        );
      }
      throw new HaciendaActivityLookupError(
        "HACIENDA_ACTIVITY_LOOKUP_UNAVAILABLE",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 404) {
      throw new HaciendaActivityLookupError("HACIENDA_TAXPAYER_NOT_FOUND");
    }
    if (response.status === 429) {
      throw new HaciendaActivityLookupError(
        "HACIENDA_ACTIVITY_LOOKUP_RATE_LIMITED",
      );
    }
    if (response.status >= 500) {
      throw new HaciendaActivityLookupError(
        "HACIENDA_ACTIVITY_LOOKUP_UNAVAILABLE",
      );
    }
    if (!response.ok) {
      throw new HaciendaActivityLookupError(
        "HACIENDA_ACTIVITY_LOOKUP_INVALID_RESPONSE",
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new HaciendaActivityLookupError(
        "HACIENDA_ACTIVITY_LOOKUP_INVALID_RESPONSE",
      );
    }
    return normalizeResponse(body);
  }

  private timeoutMs() {
    const configured = Number(
      this.config.get<string>("HACIENDA_ACTIVITY_LOOKUP_TIMEOUT_MS"),
    );
    if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
    return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, configured));
  }
}

function normalizeResponse(body: unknown): HaciendaTaxpayerActivities {
  if (!isRecord(body) || !Array.isArray(body.actividades)) invalidResponse();

  const activities = body.actividades.map(normalizeActivity);
  const deduplicated = new Map<string, HaciendaEconomicActivity>();
  for (const activity of activities) {
    if (!deduplicated.has(activity.code)) deduplicated.set(activity.code, activity);
  }

  const legalName = optionalTrimmedString(body.nombre);
  const taxSituation = normalizeSituation(body.situacion);
  return {
    ...(legalName ? { legalName } : {}),
    ...(taxSituation ? { taxSituation } : {}),
    activities: [...deduplicated.values()],
  };
}

function normalizeActivity(value: unknown): HaciendaEconomicActivity {
  if (!isRecord(value)) invalidResponse();
  const code = requiredTrimmedString(value.codigo);
  const description = requiredTrimmedString(value.descripcion);
  const status = optionalTrimmedString(value.estado);
  const active = optionalBoolean(value.activa ?? value.activo);
  const primary = providerPrimary(value);
  return {
    code,
    description,
    ...(status ? { status } : {}),
    ...(active !== undefined ? { active } : {}),
    ...(primary !== undefined ? { primary } : {}),
  };
}

function providerPrimary(value: Record<string, unknown>): boolean | undefined {
  const explicit = optionalBoolean(value.principal ?? value.esPrincipal);
  if (explicit !== undefined) return explicit;
  const type = optionalTrimmedString(value.tipo)?.toUpperCase();
  if (type === "P") return true;
  if (type === "S") return false;
  return undefined;
}

function normalizeSituation(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) invalidResponse();
  const status = optionalTrimmedString(value.estado);
  const delinquent = optionalBoolean(value.moroso);
  const omission = optionalBoolean(value.omiso);
  const taxAdministration = optionalTrimmedString(
    value.administracionTributaria,
  );
  return {
    ...(status ? { status } : {}),
    ...(delinquent !== undefined ? { delinquent } : {}),
    ...(omission !== undefined ? { omission } : {}),
    ...(taxAdministration ? { taxAdministration } : {}),
  };
}

function requiredTrimmedString(value: unknown): string {
  const normalized = optionalTrimmedString(value);
  if (!normalized) invalidResponse();
  return normalized;
}

function optionalTrimmedString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") invalidResponse();
  const normalized = value.trim();
  return normalized || undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") invalidResponse();
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidResponse(): never {
  throw new HaciendaActivityLookupError(
    "HACIENDA_ACTIVITY_LOOKUP_INVALID_RESPONSE",
  );
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

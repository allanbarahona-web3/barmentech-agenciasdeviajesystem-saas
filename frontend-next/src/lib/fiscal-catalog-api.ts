import { authenticatedFetch, getStoredToken } from "@/lib/auth-api";
import { resolveApiBase } from "@/lib/runtime-config";

export interface FiscalCatalogCabysItem {
  code: string;
  description: string;
  referenceTaxPercentage: string;
  persisted: boolean;
  source: "LOCAL" | "FACTURA_EN_CR";
}

export interface FiscalCatalogCodeItem {
  code: string;
  name: string;
}

export interface FiscalCatalogRateItem extends FiscalCatalogCodeItem {
  percentage: string;
}

export interface FiscalCatalogCabysSearchResponse {
  items: FiscalCatalogCabysItem[];
  meta: {
    query: string;
    top: number;
    mode: "LIVE" | "LOCAL_FALLBACK";
    degraded: boolean;
  };
}

interface FiscalCatalogListResponse<T> {
  items: T[];
  release: { version: string };
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    message?: unknown;
    code?: unknown;
    error?: unknown;
  } | null;
  const code = typeof payload?.code === "string"
    ? payload.code
    : typeof payload?.error === "string"
      ? payload.error
      : "";
  const knownMessages: Record<string, string> = {
    CABYS_NOT_FOUND: "El código CABYS seleccionado no fue encontrado.",
    CABYS_PROVIDER_TIMEOUT: "El proveedor CABYS tardó demasiado en responder.",
    CABYS_PROVIDER_UNAVAILABLE: "El proveedor CABYS no está disponible en este momento.",
    CABYS_PROVIDER_RATE_LIMITED: "El proveedor CABYS alcanzó temporalmente su límite de consultas.",
    CABYS_PROVIDER_INVALID_RESPONSE: "El proveedor CABYS devolvió una respuesta inválida.",
    FISCAL_CATALOG_NOT_READY: "Los catálogos fiscales globales no están disponibles.",
    FISCAL_CATALOG_ENTRY_NOT_FOUND: "La selección fiscal ya no está activa. Elija una opción vigente.",
    UNSUPPORTED_COUNTRY: "El país fiscal configurado no es compatible.",
  };
  if (knownMessages[code]) return knownMessages[code];
  if (Array.isArray(payload?.message)) return payload.message.join(", ");
  return typeof payload?.message === "string" && payload.message.trim()
    ? payload.message
    : fallback;
}

async function getFiscalCatalogResponse<T>(path: string, fallback: string): Promise<T> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  if (!apiBase) throw new Error("No hay API configurada.");
  const response = await authenticatedFetch(`${apiBase}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(await errorMessage(response, fallback));
  return response.json() as Promise<T>;
}

export function searchFiscalCatalogCabys(query: string): Promise<FiscalCatalogCabysSearchResponse> {
  const params = new URLSearchParams({ q: query, top: "20" });
  return getFiscalCatalogResponse(
    `/fiscal-catalogs/cabys/search?${params.toString()}`,
    "No se pudo buscar en el catálogo CABYS.",
  );
}

export async function confirmFiscalCatalogCabys(code: string): Promise<FiscalCatalogCabysItem> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  if (!apiBase) throw new Error("No hay API configurada.");
  const response = await authenticatedFetch(`${apiBase}/fiscal-catalogs/cabys/confirm`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw new Error(await errorMessage(response, "No se pudo confirmar el código CABYS."));
  return response.json() as Promise<FiscalCatalogCabysItem>;
}

export function getFiscalCatalogCabys(code: string): Promise<FiscalCatalogCabysItem> {
  return getFiscalCatalogResponse(
    `/fiscal-catalogs/cabys/${encodeURIComponent(code)}`,
    "No se pudo cargar el código CABYS.",
  );
}

export async function getFiscalCatalogUnits(): Promise<FiscalCatalogCodeItem[]> {
  return (await getFiscalCatalogResponse<FiscalCatalogListResponse<FiscalCatalogCodeItem>>(
    "/fiscal-catalogs/units",
    "No se pudieron cargar las unidades de medida.",
  )).items;
}

export async function getFiscalCatalogTaxes(): Promise<FiscalCatalogCodeItem[]> {
  return (await getFiscalCatalogResponse<FiscalCatalogListResponse<FiscalCatalogCodeItem>>(
    "/fiscal-catalogs/taxes",
    "No se pudieron cargar los impuestos.",
  )).items;
}

export async function getFiscalCatalogTaxRates(taxCode: string): Promise<FiscalCatalogRateItem[]> {
  return (await getFiscalCatalogResponse<FiscalCatalogListResponse<FiscalCatalogRateItem>>(
    `/fiscal-catalogs/taxes/${encodeURIComponent(taxCode)}/rates`,
    "No se pudieron cargar las tarifas fiscales.",
  )).items;
}

import { authenticatedFetch, getStoredToken } from "@/lib/auth-api";
import { resolveApiBase } from "@/lib/runtime-config";

export type AdditionalServiceMarginType = "FIXED" | "PERCENTAGE";

export interface AdditionalServiceCatalogPricingConfiguration {
  id: string;
  marginType: AdditionalServiceMarginType;
  marginValue: string;
  taxPercentage: string;
  isActive: boolean;
}

export interface AdditionalServiceFiscalProfile {
  id: string;
  cabysCode: string;
  unitOfMeasureCode: string;
  taxCode: string | null;
  taxRateCode: string | null;
  taxPercentage: string | null;
  isActive: boolean;
}

export type AdditionalServiceFiscalReadinessStatus =
  | "ABSENT"
  | "INACTIVE"
  | "READY"
  | "INVALID";

export interface AdditionalServiceFiscalReadiness {
  status: AdditionalServiceFiscalReadinessStatus;
  isReady: boolean;
  issues: string[];
}

export interface AdditionalServiceAdminCatalogItem {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  pricingConfiguration: AdditionalServiceCatalogPricingConfiguration | null;
  fiscalProfile: AdditionalServiceFiscalProfile | null;
  fiscalReadiness: AdditionalServiceFiscalReadiness;
}

export interface CreateAdditionalServiceFiscalProfileInput {
  additionalServiceCatalogId: string;
  cabysCode: string;
  unitOfMeasureCode: string;
  taxCode: string;
  taxRateCode: string;
  isActive?: boolean;
}

export interface UpdateAdditionalServiceFiscalProfileInput {
  cabysCode?: string;
  unitOfMeasureCode?: string;
  taxCode?: string;
  taxRateCode?: string;
}

export interface UpdateAdditionalServiceFiscalProfileStatusInput {
  isActive: boolean;
}

export interface CreateAdditionalServicePricingConfigurationInput {
  additionalServiceCatalogId: string;
  marginType: AdditionalServiceMarginType;
  marginValue: number;
  isActive: boolean;
}

export interface UpdateAdditionalServicePricingConfigurationInput {
  marginType: AdditionalServiceMarginType;
  marginValue: number;
}

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

interface FiscalCatalogListResponse<T> {
  items: T[];
  release: { version: string };
}

interface FiscalCatalogCabysSearchResponse {
  items: FiscalCatalogCabysItem[];
  meta: { query: string; top: number; mode: "LIVE" | "LOCAL_FALLBACK"; degraded: boolean };
}

export interface AdditionalServiceSupplier {
  id: string;
  tenantId: string;
  name: string;
  website: string | null;
  supplierType: string | null;
  supplierCategory: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAdditionalServiceSupplierInput {
  name: string;
  website?: string | null;
  supplierType?: string;
  supplierCategory?: string;
  notes?: string;
  isActive?: boolean;
}

export type UpdateAdditionalServiceSupplierInput =
  Partial<CreateAdditionalServiceSupplierInput>;

const readErrorMessage = async (
  response: Response,
  fallback: string,
): Promise<string> => {
  const payload = await response.json().catch(() => null);
  const message =
    payload && typeof payload === "object"
      ? (payload as { message?: unknown }).message
      : undefined;
  const code = payload && typeof payload === "object"
    ? (payload as { code?: unknown; error?: unknown }).code ?? (payload as { error?: unknown }).error
    : undefined;
  const knownMessages: Record<string, string> = {
    CABYS_NOT_FOUND: "El código CABYS seleccionado no fue encontrado.",
    CABYS_PROVIDER_TIMEOUT: "El proveedor CABYS tardó demasiado en responder.",
    CABYS_PROVIDER_UNAVAILABLE: "El proveedor CABYS no está disponible en este momento.",
    CABYS_PROVIDER_RATE_LIMITED: "El proveedor CABYS alcanzó temporalmente su límite de consultas.",
    CABYS_PROVIDER_INVALID_RESPONSE: "El proveedor CABYS devolvió una respuesta inválida.",
    FISCAL_CATALOG_NOT_READY: "Los catálogos fiscales globales no están disponibles.",
    FISCAL_CATALOG_ENTRY_NOT_FOUND: "La selección fiscal ya no está activa. Elija una opción vigente.",
    UNSUPPORTED_COUNTRY: "El país fiscal configurado no es compatible.",
    ADDITIONAL_SERVICE_NOT_FISCALLY_READY: "Active y complete el perfil fiscal antes de configurar el precio.",
  };

  if (typeof code === "string" && knownMessages[code]) return knownMessages[code];

  if (Array.isArray(message)) {
    return message.join(", ");
  }

  return typeof message === "string" && message.trim()
    ? message
    : fallback;
};

export async function getAdditionalServiceAdminCatalog(): Promise<
  AdditionalServiceAdminCatalogItem[]
> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  const response = await authenticatedFetch(
    `${apiBase}/additional-services/catalog`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        "No se pudo cargar la configuración de precios.",
      ),
    );
  }

  return response.json();
}

async function getFiscalCatalogResponse<T>(path: string, fallback: string): Promise<T> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  if (!apiBase) throw new Error("No hay API configurada.");
  const response = await authenticatedFetch(`${apiBase}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, fallback));
  return response.json();
}

export function searchFiscalCatalogCabys(query: string): Promise<FiscalCatalogCabysSearchResponse> {
  const params = new URLSearchParams({ q: query, top: "20" });
  return getFiscalCatalogResponse(`/fiscal-catalogs/cabys/search?${params.toString()}`, "No se pudo buscar en el catálogo CABYS.");
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
  if (!response.ok) throw new Error(await readErrorMessage(response, "No se pudo confirmar el código CABYS."));
  return response.json();
}

export function getFiscalCatalogCabys(code: string): Promise<FiscalCatalogCabysItem> {
  return getFiscalCatalogResponse(`/fiscal-catalogs/cabys/${encodeURIComponent(code)}`, "No se pudo cargar el código CABYS.");
}

export async function getFiscalCatalogUnits(): Promise<FiscalCatalogCodeItem[]> {
  return (await getFiscalCatalogResponse<FiscalCatalogListResponse<FiscalCatalogCodeItem>>("/fiscal-catalogs/units", "No se pudieron cargar las unidades de medida.")).items;
}

export async function getFiscalCatalogTaxes(): Promise<FiscalCatalogCodeItem[]> {
  return (await getFiscalCatalogResponse<FiscalCatalogListResponse<FiscalCatalogCodeItem>>("/fiscal-catalogs/taxes", "No se pudieron cargar los impuestos.")).items;
}

export async function getFiscalCatalogTaxRates(taxCode: string): Promise<FiscalCatalogRateItem[]> {
  return (await getFiscalCatalogResponse<FiscalCatalogListResponse<FiscalCatalogRateItem>>(`/fiscal-catalogs/taxes/${encodeURIComponent(taxCode)}/rates`, "No se pudieron cargar las tarifas fiscales.")).items;
}

async function sendPricingConfigurationRequest(
  path: string,
  method: "POST" | "PATCH",
  body: object,
): Promise<AdditionalServiceCatalogPricingConfiguration> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  const response = await authenticatedFetch(`${apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        "No se pudo guardar la configuración de precios.",
      ),
    );
  }

  return response.json();
}

export function createAdditionalServicePricingConfiguration(
  input: CreateAdditionalServicePricingConfigurationInput,
): Promise<AdditionalServiceCatalogPricingConfiguration> {
  return sendPricingConfigurationRequest(
    "/additional-services/pricing-configurations",
    "POST",
    input,
  );
}

export function updateAdditionalServicePricingConfiguration(
  configurationId: string,
  input: UpdateAdditionalServicePricingConfigurationInput,
): Promise<AdditionalServiceCatalogPricingConfiguration> {
  return sendPricingConfigurationRequest(
    `/additional-services/pricing-configurations/${encodeURIComponent(
      configurationId,
    )}`,
    "PATCH",
    input,
  );
}

export function updateAdditionalServicePricingConfigurationStatus(
  configurationId: string,
  isActive: boolean,
): Promise<AdditionalServiceCatalogPricingConfiguration> {
  return sendPricingConfigurationRequest(
    `/additional-services/pricing-configurations/${encodeURIComponent(
      configurationId,
    )}/status`,
    "PATCH",
    { isActive },
  );
}

async function sendFiscalProfileRequest(
  path: string,
  method: "POST" | "PATCH",
  body: object,
): Promise<AdditionalServiceFiscalProfile> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  const response = await authenticatedFetch(`${apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        "No se pudo guardar el perfil fiscal.",
      ),
    );
  }

  return response.json();
}

export function createAdditionalServiceFiscalProfile(
  input: CreateAdditionalServiceFiscalProfileInput,
): Promise<AdditionalServiceFiscalProfile> {
  return sendFiscalProfileRequest(
    "/additional-services/fiscal-profiles",
    "POST",
    input,
  );
}

export function updateAdditionalServiceFiscalProfile(
  profileId: string,
  input: UpdateAdditionalServiceFiscalProfileInput,
): Promise<AdditionalServiceFiscalProfile> {
  return sendFiscalProfileRequest(
    `/additional-services/fiscal-profiles/${encodeURIComponent(profileId)}`,
    "PATCH",
    input,
  );
}

export function updateAdditionalServiceFiscalProfileStatus(
  profileId: string,
  input: UpdateAdditionalServiceFiscalProfileStatusInput,
): Promise<AdditionalServiceFiscalProfile> {
  return sendFiscalProfileRequest(
    `/additional-services/fiscal-profiles/${encodeURIComponent(profileId)}/status`,
    "PATCH",
    input,
  );
}

export interface AdditionalServiceSupplierListFilters {
  activeOnly?: boolean;
  travelType?: "INTERNATIONAL" | "INTERNAL";
}

export interface RequestNewSupplierInput {
  supplierName: string;
  website?: string;
  notes?: string;
  travelType: "INTERNATIONAL" | "INTERNAL";
  additionalService: string;
  orderId?: string;
}

export async function getAdditionalServiceSuppliers(
  filters: AdditionalServiceSupplierListFilters = {},
): Promise<AdditionalServiceSupplier[]> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  const query = new URLSearchParams();
  if (filters.activeOnly) {
    query.set("activeOnly", "true");
  }
  if (filters.travelType) {
    query.set("travelType", filters.travelType);
  }

  const queryString = query.toString();
  const response = await authenticatedFetch(
    `${apiBase}/additional-services/suppliers${
      queryString ? `?${queryString}` : ""
    }`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        "No se pudieron cargar los proveedores.",
      ),
    );
  }

  return response.json();
}

export async function requestNewAdditionalServiceSupplier(
  input: RequestNewSupplierInput,
): Promise<{ notificationQueued: boolean }> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  const response = await authenticatedFetch(
    `${apiBase}/additional-services/suppliers/requests`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        "No se pudo enviar la solicitud del proveedor.",
      ),
    );
  }

  return response.json();
}

async function sendSupplierRequest(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: object,
): Promise<AdditionalServiceSupplier> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  if (!apiBase) {
    throw new Error("No hay API configurada.");
  }

  const response = await authenticatedFetch(`${apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        "No se pudo completar la operación del proveedor.",
      ),
    );
  }

  return response.json();
}

export function createAdditionalServiceSupplier(
  input: CreateAdditionalServiceSupplierInput,
): Promise<AdditionalServiceSupplier> {
  return sendSupplierRequest(
    "/additional-services/suppliers",
    "POST",
    input,
  );
}

export function updateAdditionalServiceSupplier(
  supplierId: string,
  input: UpdateAdditionalServiceSupplierInput,
): Promise<AdditionalServiceSupplier> {
  return sendSupplierRequest(
    `/additional-services/suppliers/${encodeURIComponent(supplierId)}`,
    "PATCH",
    input,
  );
}

export function deleteAdditionalServiceSupplier(
  supplierId: string,
): Promise<AdditionalServiceSupplier> {
  return sendSupplierRequest(
    `/additional-services/suppliers/${encodeURIComponent(supplierId)}`,
    "DELETE",
  );
}

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
  taxCode?: string | null;
  taxRateCode?: string | null;
  taxPercentage?: string | null;
  isActive?: boolean;
}

export interface UpdateAdditionalServiceFiscalProfileInput {
  cabysCode?: string;
  unitOfMeasureCode?: string;
  taxCode?: string | null;
  taxRateCode?: string | null;
  taxPercentage?: string | null;
}

export interface UpdateAdditionalServiceFiscalProfileStatusInput {
  isActive: boolean;
}

export interface CreateAdditionalServicePricingConfigurationInput {
  additionalServiceCatalogId: string;
  marginType: AdditionalServiceMarginType;
  marginValue: number;
  taxPercentage: number;
  isActive: boolean;
}

export interface UpdateAdditionalServicePricingConfigurationInput {
  marginType: AdditionalServiceMarginType;
  marginValue: number;
  taxPercentage: number;
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

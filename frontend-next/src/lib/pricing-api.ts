import { apiGet, apiPost, fetchApi } from "@/lib/api-client";

export type PricingConfigurationStatus = "DRAFT" | "ARCHIVED";
export type PricingCalculationStatus = "DRAFT" | "APPROVED";

export type PricingConfigurationInput = {
  operationalCostsAmount: string;
  riskMarginPercent: string;
  targetProfitMarginPercent: string;
  salesCommissionPercent: string;
  bankCommissionPercent: string;
  applicableTaxPercent: string;
};

export type PricingActor = {
  userId: string;
  name: string;
};

export type PricingConfiguration = PricingConfigurationInput & {
  id: string;
  costingProjectId: string;
  status: PricingConfigurationStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: PricingActor;
  updatedBy: PricingActor | null;
};

export type PricingConfigurationContext = {
  configuration: PricingConfiguration;
  currentAuthoritativeCost: string;
  currency: string;
};

export type PricingCalculationVersion = PricingConfigurationInput & {
  id: string;
  pricingConfigurationId: string;
  costingProjectId: string;
  versionNumber: number;
  status: PricingCalculationStatus;
  policyVersion: "PRICING_V1";
  currency: string;
  stale: boolean;
  authoritativeCostAmount: string;
  riskBasis: string;
  targetProfitBasis: string;
  salesCommissionBasis: string;
  bankCommissionBasis: string;
  taxBasis: string;
  baseCostAmount: string;
  riskAmount: string;
  adjustedEconomicCostAmount: string;
  targetProfitAmount: string;
  salesCommissionAmount: string;
  bankCommissionAmount: string;
  preTaxSellingPrice: string;
  taxAmount: string;
  finalSellingPrice: string;
  estimatedAgencyProfitBeforeIncomeTax: string;
  createdAt: string;
  createdBy: PricingActor;
  approvedAt: string | null;
  approvedBy: PricingActor | null;
};

export type PricingCalculationHistoryPage = {
  versions: PricingCalculationVersion[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type TravelPricingPublication = {
  id: string;
  pricingCalculationVersionId: string;
  publishedPrice: string;
  currency: string;
  commercialFloorPrice: string;
  publishedAt: string;
  publishedBy: PricingActor;
};

export type TravelPricingPublicationContext = {
  sourceType: "TRAVEL_PACKAGE" | "INTERNAL_TRIP";
  travelName: string;
  currency: string;
  baseCurrency: string;
  currentCommercialPrice: string | null;
  commercialPriceStatus: "PENDING" | "LEGACY" | "PRICING_PUBLISHED";
  commercialFloorPrice: string | null;
  latestPublication: TravelPricingPublication | null;
};

export type TravelPricingPublicationResult = {
  sourceType: "TRAVEL_PACKAGE" | "INTERNAL_TRIP";
  travelName: string;
  currentCommercialPrice: string;
  commercialPriceStatus: "PRICING_PUBLISHED";
  currency: string;
  commercialFloorPrice: string;
  publication: TravelPricingPublication;
  idempotent: boolean;
};

export function getPricingConfiguration(costingProjectId: string) {
  return apiGet<PricingConfigurationContext>(`/pricing/projects/${encodeURIComponent(costingProjectId)}/configuration`);
}

export function updatePricingConfiguration(costingProjectId: string, input: PricingConfigurationInput) {
  return patch<PricingConfigurationContext>(`/pricing/projects/${encodeURIComponent(costingProjectId)}/configuration`, input);
}

export function calculatePricing(costingProjectId: string) {
  return apiPost<PricingCalculationVersion>(`/pricing/projects/${encodeURIComponent(costingProjectId)}/calculations`);
}

export function getLatestPricingCalculation(costingProjectId: string) {
  return getNullablePricingCalculation<PricingCalculationVersion>(`/pricing/projects/${encodeURIComponent(costingProjectId)}/calculations/latest`);
}

export function getLatestApprovedPricingCalculation(costingProjectId: string) {
  return getNullablePricingCalculation<PricingCalculationVersion>(`/pricing/projects/${encodeURIComponent(costingProjectId)}/calculations/approved`);
}

export function listPricingCalculationVersions(costingProjectId: string, page = 1, pageSize = 20) {
  return apiGet<PricingCalculationHistoryPage>(`/pricing/projects/${encodeURIComponent(costingProjectId)}/calculations`, { params: { page, pageSize } });
}

export function approvePricingCalculation(pricingCalculationVersionId: string) {
  return apiPost<PricingCalculationVersion>(`/pricing/calculations/${encodeURIComponent(pricingCalculationVersionId)}/approve`);
}

export function getTravelPricingPublicationContext(costingProjectId: string) {
  return apiGet<TravelPricingPublicationContext>(`/travel-pricing/projects/${encodeURIComponent(costingProjectId)}/publication`);
}

export function publishPricingCalculation(pricingCalculationVersionId: string) {
  return apiPost<TravelPricingPublicationResult>(`/travel-pricing/calculations/${encodeURIComponent(pricingCalculationVersionId)}/publish`);
}

async function getNullablePricingCalculation<T>(path: string): Promise<T | null> {
  const response = await fetchApi(path, { method: "GET" });
  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }
  if (response.status === 204) return null;

  const body = await response.text();
  return body.trim() ? JSON.parse(body) as T : null;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetchApi(path, { method: "PATCH", body: JSON.stringify(body) });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = typeof payload?.message === "string" ? payload.message : `API Error: ${response.statusText}`;
    throw new Error(message);
  }
  return response.json();
}

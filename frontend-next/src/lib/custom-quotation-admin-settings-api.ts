import { authenticatedFetch, getStoredToken } from "@/lib/auth-api";
import { resolveApiBase } from "@/lib/runtime-config";

export type TenantPricingPolicy = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  isDefaultForCustomQuotations: boolean;
  calculationPolicyVersion: string;
  operationalCostsAmountDefault: string;
  riskMarginPercent: string;
  targetProfitMarginPercent: string;
  salesCommissionPercent: string;
  bankCommissionPercent: string;
  applicableTaxPercent: string;
};

export type TenantPricingPolicyInput = {
  name: string;
  description?: string | null;
  active?: boolean;
  isDefaultForCustomQuotations?: boolean;
  operationalCostsAmountDefault?: string;
  riskMarginPercent?: string;
  targetProfitMarginPercent?: string;
  salesCommissionPercent?: string;
  bankCommissionPercent?: string;
  applicableTaxPercent?: string;
};

export type TenantFiscalClassification = {
  id: string;
  displayName: string;
  description: string | null;
  fiscalItemCategory: "SERVICE" | "MERCHANDISE";
  cabysCode: string;
  unitOfMeasureCode: string;
  taxCode: string;
  taxRateCode: string;
  taxPercentage: string;
  isActive: boolean;
  isDefaultForCustomQuotations: boolean;
};

export type TenantFiscalClassificationInput = {
  displayName: string;
  description?: string | null;
  fiscalItemCategory: "SERVICE" | "MERCHANDISE";
  cabysCode: string;
  unitOfMeasureCode: string;
  taxCode: string;
  taxRateCode: string;
};

type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const apiBase = () => resolveApiBase();
const headers = () => ({
  Authorization: `Bearer ${getStoredToken()}`,
  "Content-Type": "application/json",
});

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await authenticatedFetch(`${apiBase()}${path}`, {
    ...init,
    headers: { ...headers(), ...init.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message;
    throw new Error(message || "CUSTOM_QUOTATION_ADMIN_SETTINGS_REQUEST_FAILED");
  }
  return response.json() as Promise<T>;
}

export const listTenantPricingPolicies = () =>
  request<Page<TenantPricingPolicy>>(
    "/admin/pricing-policies?page=1&pageSize=25",
    { method: "GET" },
  );

export const createTenantPricingPolicy = (input: TenantPricingPolicyInput) =>
  request<TenantPricingPolicy>("/admin/pricing-policies", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updateTenantPricingPolicy = (
  policyId: string,
  input: TenantPricingPolicyInput,
) =>
  request<TenantPricingPolicy>(
    `/admin/pricing-policies/${encodeURIComponent(policyId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );

export const updateTenantPricingPolicyStatus = (
  policyId: string,
  active: boolean,
) =>
  request<TenantPricingPolicy>(
    `/admin/pricing-policies/${encodeURIComponent(policyId)}/status`,
    { method: "PATCH", body: JSON.stringify({ active }) },
  );

export const updateTenantPricingPolicyDefault = (
  policyId: string,
  isDefaultForCustomQuotations: boolean,
) =>
  request<TenantPricingPolicy>(
    `/admin/pricing-policies/${encodeURIComponent(policyId)}/default`,
    { method: "PATCH", body: JSON.stringify({ isDefaultForCustomQuotations }) },
  );

export const listTenantFiscalClassifications = () =>
  request<Page<TenantFiscalClassification>>(
    "/admin/fiscal-classifications?page=1&pageSize=25",
    { method: "GET" },
  );

export const createTenantFiscalClassification = (
  input: TenantFiscalClassificationInput,
) =>
  request<TenantFiscalClassification>("/admin/fiscal-classifications", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updateTenantFiscalClassification = (
  classificationId: string,
  input: TenantFiscalClassificationInput,
) =>
  request<TenantFiscalClassification>(
    `/admin/fiscal-classifications/${encodeURIComponent(classificationId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );

export const updateTenantFiscalClassificationStatus = (
  classificationId: string,
  isActive: boolean,
) =>
  request<TenantFiscalClassification>(
    `/admin/fiscal-classifications/${encodeURIComponent(classificationId)}/status`,
    { method: "PATCH", body: JSON.stringify({ isActive }) },
  );

export const updateTenantFiscalClassificationDefault = (
  classificationId: string,
  isDefaultForCustomQuotations: boolean,
) =>
  request<TenantFiscalClassification>(
    `/admin/fiscal-classifications/${encodeURIComponent(classificationId)}/default-for-custom-quotations`,
    { method: "PATCH", body: JSON.stringify({ isDefaultForCustomQuotations }) },
  );

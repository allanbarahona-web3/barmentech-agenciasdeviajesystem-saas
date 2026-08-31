import type {
  TenantBillingConfigurationRecord,
  TenantBillingConfigurationUpdate,
} from "./fiscal-billing-admin.types";

export const FISCAL_BILLING_ADMIN_REPOSITORY = Symbol(
  "FISCAL_BILLING_ADMIN_REPOSITORY",
);

export interface FiscalBillingAdminRepository {
  findConfiguration(
    tenantId: string,
  ): Promise<TenantBillingConfigurationRecord | null>;
  upsertConfiguration(
    tenantId: string,
    input: TenantBillingConfigurationUpdate,
  ): Promise<TenantBillingConfigurationRecord>;
}

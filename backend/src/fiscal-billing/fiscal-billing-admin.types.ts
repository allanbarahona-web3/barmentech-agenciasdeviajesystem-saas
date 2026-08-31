export interface TenantBillingConfigurationRecord {
  id: string;
  tenantId: string;
  billingEnabled: boolean;
  externalRegistrationEnabled: boolean;
  electronicIssuanceEnabled: boolean;
  countryCode: string;
  defaultCurrencyCode: string;
  fiscalTimezone: string;
  fiscalSchemaVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TenantBillingConfigurationUpdate = Partial<
  Pick<
    TenantBillingConfigurationRecord,
    | "billingEnabled"
    | "externalRegistrationEnabled"
    | "electronicIssuanceEnabled"
    | "countryCode"
    | "defaultCurrencyCode"
    | "fiscalTimezone"
    | "fiscalSchemaVersion"
  >
>;

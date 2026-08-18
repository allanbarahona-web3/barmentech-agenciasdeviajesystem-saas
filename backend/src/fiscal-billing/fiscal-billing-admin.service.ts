import { Inject, Injectable } from "@nestjs/common";
import {
  FISCAL_BILLING_ADMIN_REPOSITORY,
  type FiscalBillingAdminRepository,
} from "./fiscal-billing-admin.repository";
import { fiscalBillingAdminError } from "./fiscal-billing-admin.errors";
import type {
  TenantBillingConfigurationRecord,
  TenantBillingConfigurationUpdate,
} from "./fiscal-billing-admin.types";

const SAFE_DEFAULTS = {
  billingEnabled: false,
  externalRegistrationEnabled: false,
  electronicIssuanceEnabled: false,
  countryCode: "CR",
  defaultCurrencyCode: "CRC",
  fiscalTimezone: "America/Costa_Rica",
  fiscalSchemaVersion: "4.4",
} as const;

@Injectable()
export class FiscalBillingAdminService {
  constructor(
    @Inject(FISCAL_BILLING_ADMIN_REPOSITORY)
    private readonly repository: FiscalBillingAdminRepository,
  ) {}

  async getConfiguration(tenantId: string) {
    const configuration = await this.repository.findConfiguration(tenantId);
    return configuration
      ? this.toResponse(true, configuration)
      : {
          configured: false,
          configuration: {
            id: null,
            ...SAFE_DEFAULTS,
            createdAt: null,
            updatedAt: null,
          },
        };
  }

  async updateConfiguration(
    tenantId: string,
    input: TenantBillingConfigurationUpdate,
  ) {
    const current = await this.repository.findConfiguration(tenantId);
    const effective = { ...SAFE_DEFAULTS, ...(current ?? {}), ...input };
    if (effective.electronicIssuanceEnabled) {
      if (effective.countryCode !== "CR") {
        throw fiscalBillingAdminError("BILLING_CONFIGURATION_INVALID_COUNTRY");
      }
      if (effective.fiscalSchemaVersion !== "4.4") {
        throw fiscalBillingAdminError("BILLING_CONFIGURATION_INVALID_SCHEMA");
      }
    }
    const configuration = await this.repository.upsertConfiguration(
      tenantId,
      input,
    );
    return this.toResponse(true, configuration);
  }

  private toResponse(
    configured: true,
    configuration: TenantBillingConfigurationRecord,
  ) {
    return {
      configured,
      configuration: {
        id: configuration.id,
        billingEnabled: configuration.billingEnabled,
        externalRegistrationEnabled:
          configuration.externalRegistrationEnabled,
        electronicIssuanceEnabled:
          configuration.electronicIssuanceEnabled,
        countryCode: configuration.countryCode,
        defaultCurrencyCode: configuration.defaultCurrencyCode,
        fiscalTimezone: configuration.fiscalTimezone,
        fiscalSchemaVersion: configuration.fiscalSchemaVersion,
        createdAt: configuration.createdAt.toISOString(),
        updatedAt: configuration.updatedAt.toISOString(),
      },
    };
  }
}

import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { FiscalBillingAdminRepository } from "./fiscal-billing-admin.repository";
import type { TenantBillingConfigurationRecord, TenantBillingConfigurationUpdate } from "./fiscal-billing-admin.types";

@Injectable()
export class PrismaFiscalBillingAdminRepository
  implements FiscalBillingAdminRepository
{
  constructor(private readonly prisma: PrismaService) {}

  findConfiguration(tenantId: string): Promise<TenantBillingConfigurationRecord | null> {
    return this.prisma.tenantBillingConfiguration.findUnique({
      where: { tenantId },
    }) as Promise<TenantBillingConfigurationRecord | null>;
  }

  upsertConfiguration(
    tenantId: string,
    input: TenantBillingConfigurationUpdate,
  ): Promise<TenantBillingConfigurationRecord> {
    return this.prisma.tenantBillingConfiguration.upsert({
      where: { tenantId },
      create: { tenantId, ...input },
      update: input,
    }) as Promise<TenantBillingConfigurationRecord>;
  }
}

import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { FiscalBillingAdminRepository } from "./fiscal-billing-admin.repository";
import type { TenantBillingConfigurationUpdate } from "./fiscal-billing-admin.types";

@Injectable()
export class PrismaFiscalBillingAdminRepository
  implements FiscalBillingAdminRepository
{
  constructor(private readonly prisma: PrismaService) {}

  findConfiguration(tenantId: string) {
    return this.prisma.tenantBillingConfiguration.findUnique({
      where: { tenantId },
    });
  }

  upsertConfiguration(
    tenantId: string,
    input: TenantBillingConfigurationUpdate,
  ) {
    return this.prisma.tenantBillingConfiguration.upsert({
      where: { tenantId },
      create: { tenantId, ...input },
      update: input,
    });
  }
}

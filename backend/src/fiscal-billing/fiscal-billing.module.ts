import { Module } from "@nestjs/common";
import { FiscalCatalogModule } from "../fiscal-catalogs/fiscal-catalog.module";
import { FiscalBillingController } from "./fiscal-billing.controller";
import {
  SALES_ORDER_FISCAL_BILLING_REPOSITORY,
} from "./fiscal-billing.repository";
import { SalesOrderFiscalBillingService } from "./fiscal-billing.service";
import { PrismaSalesOrderFiscalBillingRepository } from "./prisma-fiscal-billing.repository";
import {
  BILLING_DOCUMENT_REPOSITORY,
} from "./billing-document.repository";
import { BillingDocumentService } from "./billing-document.service";
import { PrismaBillingDocumentRepository } from "./prisma-billing-document.repository";
import { FiscalBillingAdminController } from "./fiscal-billing-admin.controller";
import { FiscalBillingAdminService } from "./fiscal-billing-admin.service";
import { FISCAL_BILLING_ADMIN_REPOSITORY } from "./fiscal-billing-admin.repository";
import { PrismaFiscalBillingAdminRepository } from "./prisma-fiscal-billing-admin.repository";
import { FiscalIssuerAdminController } from "./fiscal-issuer-admin.controller";
import { FiscalIssuerAdminService } from "./fiscal-issuer-admin.service";
import { FISCAL_ISSUER_ADMIN_REPOSITORY } from "./fiscal-issuer-admin.repository";
import { PrismaFiscalIssuerAdminRepository } from "./prisma-fiscal-issuer-admin.repository";

@Module({
  imports: [FiscalCatalogModule],
  controllers: [
    FiscalBillingController,
    FiscalBillingAdminController,
    FiscalIssuerAdminController,
  ],
  providers: [
    SalesOrderFiscalBillingService,
    BillingDocumentService,
    PrismaSalesOrderFiscalBillingRepository,
    PrismaBillingDocumentRepository,
    FiscalBillingAdminService,
    PrismaFiscalBillingAdminRepository,
    FiscalIssuerAdminService,
    PrismaFiscalIssuerAdminRepository,
    {
      provide: SALES_ORDER_FISCAL_BILLING_REPOSITORY,
      useExisting: PrismaSalesOrderFiscalBillingRepository,
    },
    {
      provide: BILLING_DOCUMENT_REPOSITORY,
      useExisting: PrismaBillingDocumentRepository,
    },
    {
      provide: FISCAL_BILLING_ADMIN_REPOSITORY,
      useExisting: PrismaFiscalBillingAdminRepository,
    },
    {
      provide: FISCAL_ISSUER_ADMIN_REPOSITORY,
      useExisting: PrismaFiscalIssuerAdminRepository,
    },
  ],
})
export class FiscalBillingModule {}

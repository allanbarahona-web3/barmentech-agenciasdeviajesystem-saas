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

@Module({
  imports: [FiscalCatalogModule],
  controllers: [FiscalBillingController],
  providers: [
    SalesOrderFiscalBillingService,
    BillingDocumentService,
    PrismaSalesOrderFiscalBillingRepository,
    PrismaBillingDocumentRepository,
    {
      provide: SALES_ORDER_FISCAL_BILLING_REPOSITORY,
      useExisting: PrismaSalesOrderFiscalBillingRepository,
    },
    {
      provide: BILLING_DOCUMENT_REPOSITORY,
      useExisting: PrismaBillingDocumentRepository,
    },
  ],
})
export class FiscalBillingModule {}

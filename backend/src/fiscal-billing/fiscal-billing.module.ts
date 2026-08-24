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
import { HaciendaEconomicActivityAdapter } from "./hacienda-economic-activity.adapter";
import { HACIENDA_ECONOMIC_ACTIVITY_PROVIDER } from "./hacienda-economic-activity.provider";
import { ProviderNumberingAdminController } from "./provider-numbering-admin.controller";
import { ProviderNumberingAdminService } from "./provider-numbering-admin.service";
import { FacturaEnCrNumberingAdapter } from "./factura-en-cr-numbering.adapter";
import { FACTURA_EN_CR_NUMBERING_PROVIDER } from "./factura-en-cr-numbering.provider";
import { FiscalNumberSequenceAdminController } from "./fiscal-number-sequence-admin.controller";
import { FiscalNumberSequenceAdminService } from "./fiscal-number-sequence-admin.service";
import { PrismaFiscalNumberSequenceAdminRepository } from "./prisma-fiscal-number-sequence-admin.repository";
import { FISCAL_NUMBER_SEQUENCE_ADMIN_REPOSITORY } from "./fiscal-number-sequence-admin.repository";
import { FiscalOutboxPublisherService } from "./jobs/fiscal-outbox-publisher.service";
import { OfficialExchangeRateModule } from "../official-exchange-rates/official-exchange-rate.module";
import { FiscalIssuanceClock } from "./fiscal-issuance.clock";
import { FacturaEnCrElectronicSubmissionAdapter } from "./providers/factura-en-cr-electronic-submission.adapter";
import { ELECTRONIC_DOCUMENT_SUBMISSION_PROVIDER } from "./providers/electronic-document-submission.provider";

@Module({
  imports: [FiscalCatalogModule, OfficialExchangeRateModule],
  controllers: [
    FiscalBillingController,
    FiscalBillingAdminController,
    FiscalIssuerAdminController,
    ProviderNumberingAdminController,
    FiscalNumberSequenceAdminController,
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
    HaciendaEconomicActivityAdapter,
    ProviderNumberingAdminService,
    FacturaEnCrNumberingAdapter,
    FacturaEnCrElectronicSubmissionAdapter,
    FiscalNumberSequenceAdminService,
    PrismaFiscalNumberSequenceAdminRepository,
    FiscalOutboxPublisherService,
    FiscalIssuanceClock,
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
    {
      provide: HACIENDA_ECONOMIC_ACTIVITY_PROVIDER,
      useExisting: HaciendaEconomicActivityAdapter,
    },
    {
      provide: FACTURA_EN_CR_NUMBERING_PROVIDER,
      useExisting: FacturaEnCrNumberingAdapter,
    },
    {
      provide: ELECTRONIC_DOCUMENT_SUBMISSION_PROVIDER,
      useExisting: FacturaEnCrElectronicSubmissionAdapter,
    },
    {
      provide: FISCAL_NUMBER_SEQUENCE_ADMIN_REPOSITORY,
      useExisting: PrismaFiscalNumberSequenceAdminRepository,
    },
  ],
  exports: [ELECTRONIC_DOCUMENT_SUBMISSION_PROVIDER],
})
export class FiscalBillingModule {}

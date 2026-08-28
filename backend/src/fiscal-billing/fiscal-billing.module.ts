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
import { FiscalAcceptedFanoutCoordinatorService } from "./jobs/fiscal-accepted-fanout-coordinator.service";
import { FiscalTerminalArtifactFanoutCoordinatorService } from "./jobs/fiscal-terminal-artifact-fanout-coordinator.service";
import { AccountReceivableRecognitionService } from "./account-receivable-recognition.service";
import { AccountReceivableRecognitionPublisher } from "./jobs/account-receivable-recognition.publisher";
import { AccountReceivableRecognitionProcessor } from "./jobs/account-receivable-recognition.processor";
import { OfficialExchangeRateModule } from "../official-exchange-rates/official-exchange-rate.module";
import { FiscalIssuanceClock } from "./fiscal-issuance.clock";
import { FacturaEnCrElectronicSubmissionAdapter } from "./providers/factura-en-cr-electronic-submission.adapter";
import { ELECTRONIC_DOCUMENT_SUBMISSION_PROVIDER } from "./providers/electronic-document-submission.provider";
import { BillingDocumentSubmissionPreparationService } from "./billing-document-submission-preparation.service";
import { BillingDocumentSubmissionAttemptService } from "./billing-document-submission-attempt.service";
import { BillingDocumentSubmissionExecutorService } from "./billing-document-submission-executor.service";
import { BillingDocumentSubmissionOutcomeService } from "./billing-document-submission-outcome.service";
import { FiscalBillingSubmissionProcessor } from "./jobs/fiscal-billing-submission.processor";
import { FacturaEnCrDocumentStatusAdapter } from "./providers/factura-en-cr-document-status.adapter";
import { ELECTRONIC_DOCUMENT_STATUS_PROVIDER } from "./providers/electronic-document-status.provider";
import { BillingDocumentStatusLookupService } from "./billing-document-status-lookup.service";
import { BillingDocumentStatusPersistenceService } from "./billing-document-status-persistence.service";
import { BillingDocumentRecoveryPreparationService } from "./billing-document-recovery-preparation.service";
import { BillingDocumentRecoveryExecutorService } from "./billing-document-recovery-executor.service";
import { FiscalStatusReconciliationPublisher } from "./jobs/fiscal-status-reconciliation.publisher";
import { FiscalStatusReconciliationProcessor } from "./jobs/fiscal-status-reconciliation.processor";
import { FacturaEnCrDocumentRefreshAdapter } from "./providers/factura-en-cr-document-refresh.adapter";
import { ELECTRONIC_DOCUMENT_REFRESH_PROVIDER } from "./providers/electronic-document-refresh.provider";
import { BillingDocumentRefreshExecutorService } from "./billing-document-refresh-executor.service";
import { FiscalRefreshReconciliationPublisher } from "./jobs/fiscal-refresh-reconciliation.publisher";
import { FiscalRefreshReconciliationProcessor } from "./jobs/fiscal-refresh-reconciliation.processor";
import { StorageModule } from "../storage/storage.module";
import { FiscalArtifactRetrievalService } from "./fiscal-artifact-retrieval.service";
import { FiscalArtifactRetrievalPublisher } from "./jobs/fiscal-artifact-retrieval.publisher";
import { FiscalArtifactRetrievalProcessor } from "./jobs/fiscal-artifact-retrieval.processor";
import { FacturaEnCrFiscalArtifactRetrievalAdapter } from "./providers/factura-en-cr-fiscal-artifact-retrieval.adapter";
import { FISCAL_ARTIFACT_RETRIEVAL_PORT } from "./providers/fiscal-artifact-retrieval.provider";

@Module({
  imports: [FiscalCatalogModule, OfficialExchangeRateModule, StorageModule],
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
    FacturaEnCrDocumentStatusAdapter,
    FiscalNumberSequenceAdminService,
    PrismaFiscalNumberSequenceAdminRepository,
    FiscalOutboxPublisherService,
    FiscalAcceptedFanoutCoordinatorService,
    FiscalTerminalArtifactFanoutCoordinatorService,
    AccountReceivableRecognitionService,
    AccountReceivableRecognitionPublisher,
    AccountReceivableRecognitionProcessor,
    FiscalIssuanceClock,
    BillingDocumentSubmissionPreparationService,
    BillingDocumentSubmissionAttemptService,
    BillingDocumentSubmissionExecutorService,
    BillingDocumentSubmissionOutcomeService,
    FiscalBillingSubmissionProcessor,
    BillingDocumentStatusLookupService,
    BillingDocumentStatusPersistenceService,
    BillingDocumentRecoveryPreparationService,
    BillingDocumentRecoveryExecutorService,
    FiscalStatusReconciliationPublisher,
    FiscalStatusReconciliationProcessor,
    FacturaEnCrDocumentRefreshAdapter,
    FacturaEnCrFiscalArtifactRetrievalAdapter,
    FiscalArtifactRetrievalService,
    FiscalArtifactRetrievalPublisher,
    FiscalArtifactRetrievalProcessor,
    BillingDocumentRefreshExecutorService,
    FiscalRefreshReconciliationPublisher,
    FiscalRefreshReconciliationProcessor,
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
      provide: ELECTRONIC_DOCUMENT_STATUS_PROVIDER,
      useExisting: FacturaEnCrDocumentStatusAdapter,
    },
    {provide:ELECTRONIC_DOCUMENT_REFRESH_PROVIDER,useExisting:FacturaEnCrDocumentRefreshAdapter},
    { provide: FISCAL_ARTIFACT_RETRIEVAL_PORT, useExisting: FacturaEnCrFiscalArtifactRetrievalAdapter },
    {
      provide: FISCAL_NUMBER_SEQUENCE_ADMIN_REPOSITORY,
      useExisting: PrismaFiscalNumberSequenceAdminRepository,
    },
  ],
  exports: [ELECTRONIC_DOCUMENT_SUBMISSION_PROVIDER, ELECTRONIC_DOCUMENT_STATUS_PROVIDER,ELECTRONIC_DOCUMENT_REFRESH_PROVIDER, FISCAL_ARTIFACT_RETRIEVAL_PORT, BillingDocumentSubmissionPreparationService, BillingDocumentSubmissionAttemptService, BillingDocumentSubmissionExecutorService, BillingDocumentSubmissionOutcomeService, BillingDocumentStatusLookupService, BillingDocumentStatusPersistenceService, BillingDocumentRecoveryPreparationService, BillingDocumentRecoveryExecutorService],
})
export class FiscalBillingModule {}

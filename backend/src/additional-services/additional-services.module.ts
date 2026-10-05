import { Module } from "@nestjs/common";
import { AdditionalServicesService } from "./additional-services.service";
import { AdditionalServiceCatalogController } from "./additional-service-catalog.controller";
import { AdditionalServicePricingConfigurationsController } from "./additional-service-pricing-configurations.controller";
import { AdditionalServiceFiscalProfilesController } from "./additional-service-fiscal-profiles.controller";
import { CatalogBootstrapService } from "./catalog-bootstrap.service";
import { AdditionalServiceSuppliersController } from "./additional-service-suppliers.controller";
import { SupplierRequestNotificationService } from "./supplier-request-notification.service";
import { AdditionalServicesPersistenceModule } from "./infrastructure/additional-services-persistence.module";
import { AdditionalServicesPricingEngineModule } from "./infrastructure/additional-services-pricing-engine.module";
import { AdditionalServicesPricingController } from "./additional-services-pricing.controller";
import { AdditionalServicesPricingService } from "./additional-services-pricing.service";
import { AdditionalServiceOrdersController } from "./additional-service-orders.controller";
import { CommercialProposalPdfMapper } from "./commercial-proposal-pdf.mapper";
import { CommercialProposalPdfService } from "./commercial-proposal-pdf.service";
import { DocumentsModule } from "../documents/documents.module";
import { GeneratedDocumentsModule } from "../generated-documents";
import { StorageModule } from "../storage/storage.module";
import { EmailModule } from "../email/email.module";
import { CommercialProposalEmailService } from "./commercial-proposal-email.service";
import { CommercialProposalApprovalService } from "./commercial-proposal-approval.service";
import { CommercialProposalPublicController } from "./commercial-proposal-public.controller";
import { SalesOrdersModule } from "../sales-orders/sales-orders.module";
import { CommercialProposalInPersonApprovalService } from "./commercial-proposal-in-person-approval.service";
import { FiscalCatalogModule } from "../fiscal-catalogs/fiscal-catalog.module";
import { TravelFiscalClassificationModule } from "./travel-fiscal-classification.module";
import { AdditionalServiceOperationalContextAdapter } from "./operations-read/additional-service-operational-context.adapter";
import { OPERATIONAL_ADDITIONAL_SERVICE_READER } from "./operations-read/operational-additional-service-reader.port";
import { AdditionalServiceOperationsIntakeOutboxProducer } from "./additional-service-operations-intake-outbox.producer";
import { AdditionalServiceOperationalWorkSourceAdapter } from "./operations-read/additional-service-operational-work-source.adapter";
import { OPERATIONAL_WORK_SOURCE_RECONCILIATION_READER } from "../operations/intake/operational-work-source-reconciliation.port";
import { AdditionalServiceOperationalWorkSourceReconciliationAdapter } from "./operations-read/additional-service-operational-work-source-reconciliation.adapter";

@Module({
  imports: [
    AdditionalServicesPersistenceModule,
    AdditionalServicesPricingEngineModule,
    DocumentsModule,
    GeneratedDocumentsModule,
    StorageModule,
    EmailModule,
    SalesOrdersModule,
    FiscalCatalogModule,
    TravelFiscalClassificationModule,
  ],
  controllers: [
    AdditionalServiceCatalogController,
    AdditionalServicePricingConfigurationsController,
    AdditionalServiceFiscalProfilesController,
    AdditionalServicesPricingController,
    AdditionalServiceOrdersController,
    AdditionalServiceSuppliersController,
    CommercialProposalPublicController,
  ],
  providers: [
    AdditionalServicesService,
    AdditionalServicesPricingService,
    CatalogBootstrapService,
    SupplierRequestNotificationService,
    CommercialProposalPdfMapper,
    CommercialProposalPdfService,
    CommercialProposalEmailService,
    CommercialProposalApprovalService,
    CommercialProposalInPersonApprovalService,
    AdditionalServiceOperationsIntakeOutboxProducer,
    AdditionalServiceOperationalContextAdapter,
    AdditionalServiceOperationalWorkSourceAdapter,
    AdditionalServiceOperationalWorkSourceReconciliationAdapter,
    { provide: OPERATIONAL_ADDITIONAL_SERVICE_READER, useExisting: AdditionalServiceOperationalContextAdapter },
    { provide: OPERATIONAL_WORK_SOURCE_RECONCILIATION_READER, useExisting: AdditionalServiceOperationalWorkSourceReconciliationAdapter },
  ],
  exports: [
    AdditionalServicesPersistenceModule,
    AdditionalServicesPricingEngineModule,
    AdditionalServicesService,
    CatalogBootstrapService,
    CommercialProposalPdfService,
    OPERATIONAL_ADDITIONAL_SERVICE_READER,
    AdditionalServiceOperationalWorkSourceAdapter,
    OPERATIONAL_WORK_SOURCE_RECONCILIATION_READER,
  ],
})
export class AdditionalServicesModule {}

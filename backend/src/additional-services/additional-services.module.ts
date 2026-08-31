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
  ],
  exports: [
    AdditionalServicesPersistenceModule,
    AdditionalServicesPricingEngineModule,
    AdditionalServicesService,
    CatalogBootstrapService,
    CommercialProposalPdfService,
  ],
})
export class AdditionalServicesModule {}

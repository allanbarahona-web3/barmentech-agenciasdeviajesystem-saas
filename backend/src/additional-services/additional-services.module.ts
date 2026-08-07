import { Module } from "@nestjs/common";
import { AdditionalServicesService } from "./additional-services.service";
import { AdditionalServiceCatalogController } from "./additional-service-catalog.controller";
import { AdditionalServicePricingConfigurationsController } from "./additional-service-pricing-configurations.controller";
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

@Module({
  imports: [
    AdditionalServicesPersistenceModule,
    AdditionalServicesPricingEngineModule,
    DocumentsModule,
  ],
  controllers: [
    AdditionalServiceCatalogController,
    AdditionalServicePricingConfigurationsController,
    AdditionalServicesPricingController,
    AdditionalServiceOrdersController,
    AdditionalServiceSuppliersController,
  ],
  providers: [
    AdditionalServicesService,
    AdditionalServicesPricingService,
    CatalogBootstrapService,
    SupplierRequestNotificationService,
    CommercialProposalPdfMapper,
    CommercialProposalPdfService,
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

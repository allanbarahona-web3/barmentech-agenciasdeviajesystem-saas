import { Module } from "@nestjs/common";
import { AdditionalServicesService } from "./additional-services.service";
import {
  ADDITIONAL_SERVICES_REPOSITORY,
  PrismaAdditionalServicesRepository,
} from "./repositories";
import { AdditionalServiceCatalogController } from "./additional-service-catalog.controller";
import { AdditionalServicePricingConfigurationsController } from "./additional-service-pricing-configurations.controller";
import { CatalogBootstrapService } from "./catalog-bootstrap.service";
import { AdditionalServiceSuppliersController } from "./additional-service-suppliers.controller";
import { SupplierRequestNotificationService } from "./supplier-request-notification.service";

@Module({
  controllers: [
    AdditionalServiceCatalogController,
    AdditionalServicePricingConfigurationsController,
    AdditionalServiceSuppliersController,
  ],
  providers: [
    PrismaAdditionalServicesRepository,
    {
      provide: ADDITIONAL_SERVICES_REPOSITORY,
      useExisting: PrismaAdditionalServicesRepository,
    },
    AdditionalServicesService,
    CatalogBootstrapService,
    SupplierRequestNotificationService,
  ],
  exports: [AdditionalServicesService, CatalogBootstrapService],
})
export class AdditionalServicesModule {}

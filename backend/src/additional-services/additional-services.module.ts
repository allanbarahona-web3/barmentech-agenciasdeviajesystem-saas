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
  ],
  exports: [AdditionalServicesService, CatalogBootstrapService],
})
export class AdditionalServicesModule {}

import { Module } from "@nestjs/common";
import { AdditionalServicesService } from "./additional-services.service";
import {
  ADDITIONAL_SERVICES_REPOSITORY,
  PrismaAdditionalServicesRepository,
} from "./repositories";

@Module({
  providers: [
    PrismaAdditionalServicesRepository,
    {
      provide: ADDITIONAL_SERVICES_REPOSITORY,
      useExisting: PrismaAdditionalServicesRepository,
    },
    AdditionalServicesService,
  ],
  exports: [AdditionalServicesService],
})
export class AdditionalServicesModule {}

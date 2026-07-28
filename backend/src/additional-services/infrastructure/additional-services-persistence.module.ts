import { Module } from "@nestjs/common";
import {
  ADDITIONAL_SERVICES_REPOSITORY,
  PrismaAdditionalServicesRepository,
} from "../repositories";

@Module({
  providers: [
    PrismaAdditionalServicesRepository,
    {
      provide: ADDITIONAL_SERVICES_REPOSITORY,
      useExisting: PrismaAdditionalServicesRepository,
    },
  ],
  exports: [ADDITIONAL_SERVICES_REPOSITORY],
})
export class AdditionalServicesPersistenceModule {}

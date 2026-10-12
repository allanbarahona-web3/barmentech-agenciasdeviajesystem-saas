import { Module } from '@nestjs/common';
import { TravelPackagesController } from './travel-packages.controller';
import { TravelPackagesService } from './travel-packages.service';
import { TravelPackageParticipantsRepository } from './repositories/travel-package-participants.repository';
import { TravelCapacityValidationService } from './travel-capacity-validation.service';
import { TravelFiscalClassificationModule } from '../additional-services/travel-fiscal-classification.module';
import { PassengerGroupsModule } from '../passenger-groups/passenger-groups.module';

@Module({
  imports: [TravelFiscalClassificationModule, PassengerGroupsModule],
  controllers: [TravelPackagesController],
  providers: [TravelPackagesService, TravelPackageParticipantsRepository, TravelCapacityValidationService],
  exports: [TravelPackagesService, TravelPackageParticipantsRepository, TravelCapacityValidationService],
})
export class TravelPackagesModule {}

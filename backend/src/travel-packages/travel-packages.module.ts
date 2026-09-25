import { Module } from '@nestjs/common';
import { TravelPackagesController } from './travel-packages.controller';
import { TravelPackagesService } from './travel-packages.service';
import { TravelPackageParticipantsRepository } from './repositories/travel-package-participants.repository';
import { TravelFiscalClassificationModule } from '../additional-services/travel-fiscal-classification.module';
import { PassengerGroupsModule } from '../passenger-groups/passenger-groups.module';

@Module({
  imports: [TravelFiscalClassificationModule, PassengerGroupsModule],
  controllers: [TravelPackagesController],
  providers: [TravelPackagesService, TravelPackageParticipantsRepository],
  exports: [TravelPackagesService, TravelPackageParticipantsRepository],
})
export class TravelPackagesModule {}

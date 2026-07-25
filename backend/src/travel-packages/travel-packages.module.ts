import { Module } from '@nestjs/common';
import { TravelPackagesController } from './travel-packages.controller';
import { TravelPackagesService } from './travel-packages.service';
import { TravelPackageParticipantsRepository } from './repositories/travel-package-participants.repository';

@Module({
  controllers: [TravelPackagesController],
  providers: [TravelPackagesService, TravelPackageParticipantsRepository],
  exports: [TravelPackagesService, TravelPackageParticipantsRepository],
})
export class TravelPackagesModule {}

import { Module } from '@nestjs/common';
import { TravelPackagesController } from './travel-packages.controller';
import { TravelPackagesService } from './travel-packages.service';

@Module({
  controllers: [TravelPackagesController],
  providers: [TravelPackagesService],
  exports: [TravelPackagesService],
})
export class TravelPackagesModule {}

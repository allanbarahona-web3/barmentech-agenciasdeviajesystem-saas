import { Module } from '@nestjs/common';
import { InternalTourismModule } from '../internal-tourism/internal-tourism.module';
import { TravelPackagesModule } from '../travel-packages/travel-packages.module';
import { ContractNotesService } from '../contracts/notes/contract-notes.service';
import { TravelContextController } from './travel-context.controller';
import { TravelContextService } from './travel-context.service';

@Module({
  imports: [TravelPackagesModule, InternalTourismModule],
  controllers: [TravelContextController],
  providers: [TravelContextService, ContractNotesService],
  exports: [TravelContextService],
})
export class TravelContextModule {}

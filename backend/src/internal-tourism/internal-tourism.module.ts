import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { InternalToursService } from './internal-tours.service';
import { InternalBookingsService } from './internal-bookings.service';
import { InternalTripsController } from './internal-trips.controller';
import { InternalBookingsController } from './internal-bookings.controller';
import { TravelFiscalClassificationModule } from '../additional-services/travel-fiscal-classification.module';

@Module({
  imports: [PrismaModule, EmailModule, TravelFiscalClassificationModule],
  providers: [InternalToursService, InternalBookingsService],
  controllers: [InternalTripsController, InternalBookingsController],
  exports: [InternalToursService, InternalBookingsService],
})
export class InternalTourismModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { InternalToursService } from './internal-tours.service';
import { InternalBookingsService } from './internal-bookings.service';
import { InternalTripsController } from './internal-trips.controller';
import { InternalBookingsController } from './internal-bookings.controller';

@Module({
  imports: [PrismaModule, EmailModule],
  providers: [InternalToursService, InternalBookingsService],
  controllers: [InternalTripsController, InternalBookingsController],
  exports: [InternalToursService, InternalBookingsService],
})
export class InternalTourismModule {}

import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { EmailModule } from "../email/email.module";
import { TravelPackagesModule } from "../travel-packages/travel-packages.module";
import { InternalTourismModule } from "../internal-tourism/internal-tourism.module";

@Module({
  imports: [EmailModule, TravelPackagesModule, InternalTourismModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}

import { Module } from "@nestjs/common";
import { CostEngineModule } from "../cost-engine/cost-engine.module";
import { PricingModule } from "../pricing/pricing.module";
import { TravelPricingModule } from "../travel-pricing/travel-pricing.module";
import { WorkerModule } from "../infrastructure/worker";
import { AirfarePricingRepriceProcessorService } from "./airfare-pricing-reprice-processor.service";
import { AirfarePricingRepriceWorker } from "./airfare-pricing-reprice.worker";
import { AirfarePricingPendingRecoveryService } from "./airfare-pricing-pending-recovery.service";

@Module({
  imports: [CostEngineModule, PricingModule, TravelPricingModule, WorkerModule],
  providers: [AirfarePricingRepriceProcessorService, AirfarePricingRepriceWorker, AirfarePricingPendingRecoveryService],
  exports: [AirfarePricingRepriceProcessorService],
})
export class AirfarePricingModule {}

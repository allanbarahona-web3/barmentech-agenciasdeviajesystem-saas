import { Module } from "@nestjs/common";
import { CostEngineModule } from "../cost-engine/cost-engine.module";
import { TravelPricingController } from "./travel-pricing.controller";
import { TravelPricingService } from "./travel-pricing.service";

/** Travel adapter for explicit publication of independent Pricing Engine outputs. */
@Module({
  imports: [CostEngineModule],
  controllers: [TravelPricingController],
  providers: [TravelPricingService],
})
export class TravelPricingModule {}

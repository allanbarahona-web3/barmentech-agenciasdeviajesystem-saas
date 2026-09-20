import { Module } from "@nestjs/common";
import { CostEngineModule } from "../cost-engine/cost-engine.module";
import { PricingController } from "./pricing.controller";
import { PricingRepository } from "./pricing.repository";
import { PricingService } from "./pricing.service";

@Module({
  imports: [CostEngineModule],
  controllers: [PricingController],
  providers: [PricingRepository, PricingService],
  exports: [PricingService],
})
export class PricingModule {}

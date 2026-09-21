import { Module } from "@nestjs/common";
import { CostEngineModule } from "../cost-engine/cost-engine.module";
import { PricingController } from "./pricing.controller";
import { PricingRepository } from "./pricing.repository";
import { PricingService } from "./pricing.service";
import { TenantPricingPolicyController } from "./tenant-pricing-policy.controller";
import { TenantPricingPolicyService } from "./tenant-pricing-policy.service";

@Module({
  imports: [CostEngineModule],
  controllers: [PricingController, TenantPricingPolicyController],
  providers: [PricingRepository, PricingService, TenantPricingPolicyService],
  exports: [PricingService, TenantPricingPolicyService],
})
export class PricingModule {}

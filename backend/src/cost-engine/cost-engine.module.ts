import { Module } from "@nestjs/common";
import { CostEngineController } from "./cost-engine.controller";
import { CostEngineRepository } from "./cost-engine.repository";
import { CostEngineService } from "./cost-engine.service";
import { StorageModule } from "../storage/storage.module";
import { CostEvidenceService } from "./cost-evidence.service";
import { TravelCostingProjectResolverService } from "./travel-costing-project-resolver.service";
import { AirfareDailyAuthorityController } from "./airfare-daily-authority.controller";
import { AirfareDailyAuthorityService } from "./airfare-daily-authority.service";
import { TenantBusinessDateResolver } from "./tenant-business-date.resolver";
import { CostingProjectCurrentCostReader } from "./costing-project-current-cost-reader";

@Module({
  imports: [StorageModule],
  controllers: [CostEngineController, AirfareDailyAuthorityController],
  providers: [CostEngineRepository, CostEngineService, CostEvidenceService, TravelCostingProjectResolverService, AirfareDailyAuthorityService, TenantBusinessDateResolver, CostingProjectCurrentCostReader],
  exports: [CostEngineService, CostingProjectCurrentCostReader],
})
export class CostEngineModule {}

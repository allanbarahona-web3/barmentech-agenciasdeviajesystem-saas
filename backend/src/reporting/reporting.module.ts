import { Module } from "@nestjs/common";
import { ReportingAccessPolicy } from "./access/reporting-access-policy";
import { ReportingCoreService } from "./core/reporting-core.service";
import { ReportingPeriodResolver } from "./period/reporting-period.resolver";

@Module({
  providers: [ReportingAccessPolicy, ReportingCoreService, ReportingPeriodResolver],
  exports: [ReportingAccessPolicy, ReportingCoreService, ReportingPeriodResolver],
})
export class ReportingModule {}

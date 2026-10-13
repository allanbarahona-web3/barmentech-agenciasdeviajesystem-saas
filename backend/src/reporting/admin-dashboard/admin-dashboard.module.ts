import { Module } from "@nestjs/common";
import { AccountingCostsModule } from "../accounting-costs/accounting-costs.module";
import { ReportingModule } from "../reporting.module";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";

@Module({
  imports: [ReportingModule, AccountingCostsModule],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
})
export class AdminDashboardModule {}

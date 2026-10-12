import { Module } from "@nestjs/common";
import { ExchangeRateModule } from "../../exchange-rate/exchange-rate.module";
import { StorageModule } from "../../storage/storage.module";
import { ReportingModule } from "../reporting.module";
import { AccountingCostEvidenceService } from "./accounting-cost-evidence.service";
import { AccountingCostFxProjector } from "./accounting-cost-fx.projector";
import { AccountingCostsController } from "./accounting-costs.controller";
import { AccountingCostsService } from "./accounting-costs.service";
import { OperationalPurchaseAccountingCostAdapter } from "./operational-purchase-accounting-cost.adapter";

@Module({
  imports: [ReportingModule, ExchangeRateModule, StorageModule],
  controllers: [AccountingCostsController],
  providers: [AccountingCostsService, OperationalPurchaseAccountingCostAdapter, AccountingCostFxProjector, AccountingCostEvidenceService],
})
export class AccountingCostsModule {}

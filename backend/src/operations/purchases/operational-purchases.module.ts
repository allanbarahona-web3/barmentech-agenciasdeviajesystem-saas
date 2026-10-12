import { Module } from "@nestjs/common";
import { FinanceModule } from "../../finance/finance.module";
import { OfficialExchangeRateModule } from "../../official-exchange-rates/official-exchange-rate.module";
import { OperationalPurchasesController } from "./operational-purchases.controller";
import { OperationalPurchaseAccountingFxSnapshotService } from "./operational-purchase-accounting-fx-snapshot.service";
import { OperationalStandalonePurchasesController } from "./operational-standalone-purchases.controller";
import { OperationalPurchasesService } from "./operational-purchases.service";

@Module({ imports: [FinanceModule, OfficialExchangeRateModule], controllers: [OperationalPurchasesController, OperationalStandalonePurchasesController], providers: [OperationalPurchasesService, OperationalPurchaseAccountingFxSnapshotService] })
export class OperationalPurchasesModule {}

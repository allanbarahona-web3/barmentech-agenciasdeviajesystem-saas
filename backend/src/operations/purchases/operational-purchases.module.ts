import { Module } from "@nestjs/common";
import { FinanceModule } from "../../finance/finance.module";
import { OperationalPurchasesController } from "./operational-purchases.controller";
import { OperationalStandalonePurchasesController } from "./operational-standalone-purchases.controller";
import { OperationalPurchasesService } from "./operational-purchases.service";

@Module({ imports: [FinanceModule], controllers: [OperationalPurchasesController, OperationalStandalonePurchasesController], providers: [OperationalPurchasesService] })
export class OperationalPurchasesModule {}

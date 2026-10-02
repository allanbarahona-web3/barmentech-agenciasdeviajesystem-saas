import { Module } from "@nestjs/common";
import { FinanceModule } from "../../finance/finance.module";
import { OperationalPurchasesController } from "./operational-purchases.controller";
import { OperationalPurchasesService } from "./operational-purchases.service";

@Module({ imports: [FinanceModule], controllers: [OperationalPurchasesController], providers: [OperationalPurchasesService] })
export class OperationalPurchasesModule {}

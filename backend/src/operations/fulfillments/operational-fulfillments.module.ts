import { Module } from "@nestjs/common";
import { FinanceModule } from "../../finance/finance.module";
import { OperationalFulfillmentsController } from "./operational-fulfillments.controller";
import { OperationalStandaloneFulfillmentsController } from "./operational-standalone-fulfillments.controller";
import { OperationalFulfillmentsService } from "./operational-fulfillments.service";

@Module({
  imports: [FinanceModule],
  controllers: [OperationalFulfillmentsController, OperationalStandaloneFulfillmentsController],
  providers: [OperationalFulfillmentsService],
})
export class OperationalFulfillmentsModule {}

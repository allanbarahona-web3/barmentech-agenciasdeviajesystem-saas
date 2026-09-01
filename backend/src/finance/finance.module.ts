import { Module } from "@nestjs/common";
import { PaymentRegistrationService } from "./payment-registration.service";
import { PaymentAllocationService } from "./payment-allocation.service";
import { PaymentAllocationReversalService } from "./payment-allocation-reversal.service";
import { PaymentCancellationService } from "./payment-cancellation.service";
import { FinanceController } from "./finance.controller";
import { FinanceReadService } from "./finance-read.service";
import { CustomerFundsAllocationService } from "./customer-funds-allocation.service";
import { BusinessNumberingModule } from "../business-numbering/business-numbering.module";

@Module({
  imports: [BusinessNumberingModule],
  controllers: [FinanceController],
  providers: [PaymentRegistrationService, PaymentAllocationService, PaymentAllocationReversalService, PaymentCancellationService, FinanceReadService, CustomerFundsAllocationService],
  exports: [PaymentRegistrationService, PaymentAllocationService, PaymentAllocationReversalService, PaymentCancellationService],
})
export class FinanceModule {}

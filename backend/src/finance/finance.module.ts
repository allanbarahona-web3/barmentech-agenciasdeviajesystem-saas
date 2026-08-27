import { Module } from "@nestjs/common";
import { PaymentRegistrationService } from "./payment-registration.service";
import { PaymentAllocationService } from "./payment-allocation.service";
import { PaymentAllocationReversalService } from "./payment-allocation-reversal.service";

@Module({
  providers: [PaymentRegistrationService, PaymentAllocationService, PaymentAllocationReversalService],
  exports: [PaymentRegistrationService, PaymentAllocationService, PaymentAllocationReversalService],
})
export class FinanceModule {}

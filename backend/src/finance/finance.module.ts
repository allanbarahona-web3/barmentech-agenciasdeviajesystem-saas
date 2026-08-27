import { Module } from "@nestjs/common";
import { PaymentRegistrationService } from "./payment-registration.service";
import { PaymentAllocationService } from "./payment-allocation.service";
import { PaymentAllocationReversalService } from "./payment-allocation-reversal.service";
import { PaymentCancellationService } from "./payment-cancellation.service";

@Module({
  providers: [PaymentRegistrationService, PaymentAllocationService, PaymentAllocationReversalService, PaymentCancellationService],
  exports: [PaymentRegistrationService, PaymentAllocationService, PaymentAllocationReversalService, PaymentCancellationService],
})
export class FinanceModule {}

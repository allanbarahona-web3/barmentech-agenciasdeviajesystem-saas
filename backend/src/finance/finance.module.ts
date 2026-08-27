import { Module } from "@nestjs/common";
import { PaymentRegistrationService } from "./payment-registration.service";
import { PaymentAllocationService } from "./payment-allocation.service";

@Module({
  providers: [PaymentRegistrationService, PaymentAllocationService],
  exports: [PaymentRegistrationService, PaymentAllocationService],
})
export class FinanceModule {}

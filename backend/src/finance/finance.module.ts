import { Module } from "@nestjs/common";
import { PaymentRegistrationService } from "./payment-registration.service";

@Module({
  providers: [PaymentRegistrationService],
  exports: [PaymentRegistrationService],
})
export class FinanceModule {}

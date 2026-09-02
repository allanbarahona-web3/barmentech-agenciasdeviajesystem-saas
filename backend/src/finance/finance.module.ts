import { Module } from "@nestjs/common";
import { PaymentRegistrationService } from "./payment-registration.service";
import { PaymentAllocationService } from "./payment-allocation.service";
import { PaymentAllocationReversalService } from "./payment-allocation-reversal.service";
import { PaymentCancellationService } from "./payment-cancellation.service";
import { FinanceController } from "./finance.controller";
import { FinanceReadService } from "./finance-read.service";
import { CustomerFundsAllocationService } from "./customer-funds-allocation.service";
import { BusinessNumberingModule } from "../business-numbering/business-numbering.module";
import { DocumentsModule } from "../documents/documents.module";
import { EmailModule } from "../email/email.module";
import { CustomerAccountStatementService } from "./customer-account-statement.service";
import { RegisterPaymentAndApplyService } from "./register-payment-and-apply.service";
import { PaymentReceiptService } from "./payment-receipt.service";
import { ContractReservationPaymentService } from "./contract-reservation-payment.service";
import { ContractReservationReviewService } from "./contract-reservation-review.service";
import { ContractReservationApprovalModule } from "../contracts/contract-reservation-approval.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [BusinessNumberingModule, DocumentsModule, EmailModule, StorageModule, ContractReservationApprovalModule],
  controllers: [FinanceController],
  providers: [PaymentRegistrationService, PaymentAllocationService, PaymentAllocationReversalService, PaymentCancellationService, FinanceReadService, CustomerFundsAllocationService, CustomerAccountStatementService, RegisterPaymentAndApplyService, PaymentReceiptService, ContractReservationPaymentService, ContractReservationReviewService],
  exports: [PaymentRegistrationService, PaymentAllocationService, PaymentAllocationReversalService, PaymentCancellationService, ContractReservationPaymentService, ContractReservationReviewService],
})
export class FinanceModule {}

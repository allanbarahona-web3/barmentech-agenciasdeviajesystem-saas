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
import { CommercialObligationModule } from "./commercial-obligation.module";
import { CommercialObligationAllocationService } from "./commercial-obligation-allocation.service";
import { ContractInstallmentPaymentService } from "./contract-installment-payment.service";
import { FiscalBillingModule } from "../fiscal-billing/fiscal-billing.module";
import { TravelFiscalClassificationModule } from "../additional-services/travel-fiscal-classification.module";
import { FiscalCatalogModule } from "../fiscal-catalogs/fiscal-catalog.module";
import { ContractPaymentFiscalPreparationService } from "./contract-payment-fiscal-preparation.service";
import { ContractPaymentFiscalizationOutboxService } from "./contract-payment-fiscalization-outbox.service";
import { ContractPaymentFiscalizationPublisher } from "./contract-payment-fiscalization.publisher";
import { ContractPaymentFiscalizationWorkerService } from "./contract-payment-fiscalization-worker.service";
import { ContractPaymentFiscalizationProcessor } from "./contract-payment-fiscalization.processor";
import { ExchangeRateModule } from "../exchange-rate/exchange-rate.module";

@Module({
  imports: [BusinessNumberingModule, DocumentsModule, EmailModule, StorageModule, CommercialObligationModule, ContractReservationApprovalModule, FiscalBillingModule, TravelFiscalClassificationModule, FiscalCatalogModule, ExchangeRateModule],
  controllers: [FinanceController],
  providers: [PaymentRegistrationService, PaymentAllocationService, PaymentAllocationReversalService, PaymentCancellationService, FinanceReadService, CustomerFundsAllocationService, CustomerAccountStatementService, RegisterPaymentAndApplyService, PaymentReceiptService, ContractReservationPaymentService, CommercialObligationAllocationService, ContractPaymentFiscalizationOutboxService, ContractReservationReviewService, ContractInstallmentPaymentService, ContractPaymentFiscalPreparationService, ContractPaymentFiscalizationPublisher, ContractPaymentFiscalizationWorkerService, ContractPaymentFiscalizationProcessor],
  exports: [PaymentRegistrationService, PaymentAllocationService, PaymentAllocationReversalService, PaymentCancellationService, ContractReservationPaymentService, ContractReservationReviewService, ContractPaymentFiscalPreparationService, CommercialObligationModule],
})
export class FinanceModule {}

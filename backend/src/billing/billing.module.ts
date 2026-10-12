import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { EmailModule } from "../email/email.module";
import { InternalTourismModule } from "../internal-tourism/internal-tourism.module";
import { StorageModule } from "../storage/storage.module";
import { ReceiptProcessingWorker } from "./jobs/receipt-processing.worker";
import { ContractReservationApprovalModule } from "../contracts/contract-reservation-approval.module";

@Module({
  imports: [EmailModule, InternalTourismModule, StorageModule, ContractReservationApprovalModule],
  controllers: [BillingController],
  providers: [BillingService, ReceiptProcessingWorker],
  exports: [BillingService],
})
export class BillingModule {}

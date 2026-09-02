import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { EmailModule } from "../email/email.module";
import { TravelPackagesModule } from "../travel-packages/travel-packages.module";
import { InternalTourismModule } from "../internal-tourism/internal-tourism.module";
import { StorageModule } from "../storage/storage.module";
import { ReceiptProcessingWorker } from "./jobs/receipt-processing.worker";
import { FinanceModule } from "../finance/finance.module";
import { ContractReservationApprovalModule } from "../contracts/contract-reservation-approval.module";

@Module({
  imports: [EmailModule, TravelPackagesModule, InternalTourismModule, StorageModule, FinanceModule, ContractReservationApprovalModule],
  controllers: [BillingController],
  providers: [BillingService, ReceiptProcessingWorker],
  exports: [BillingService],
})
export class BillingModule {}

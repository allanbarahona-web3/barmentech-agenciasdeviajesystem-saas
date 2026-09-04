import { Module } from "@nestjs/common";
import { TravelPackagesModule } from "../travel-packages/travel-packages.module";
import { CommercialObligationModule } from "../finance/commercial-obligation.module";
import { ContractReservationApprovalService } from "./contract-reservation-approval.service";

@Module({
  imports: [TravelPackagesModule, CommercialObligationModule],
  providers: [ContractReservationApprovalService],
  exports: [ContractReservationApprovalService],
})
export class ContractReservationApprovalModule {}

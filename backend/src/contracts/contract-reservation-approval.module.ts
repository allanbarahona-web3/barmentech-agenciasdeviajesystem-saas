import { Module } from "@nestjs/common";
import { TravelPackagesModule } from "../travel-packages/travel-packages.module";
import { ContractReservationApprovalService } from "./contract-reservation-approval.service";

@Module({
  imports: [TravelPackagesModule],
  providers: [ContractReservationApprovalService],
  exports: [ContractReservationApprovalService],
})
export class ContractReservationApprovalModule {}

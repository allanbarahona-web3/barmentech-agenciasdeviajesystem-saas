import { Module } from "@nestjs/common";
import { TravelPackagesModule } from "../travel-packages/travel-packages.module";
import { CommercialObligationModule } from "../finance/commercial-obligation.module";
import { TravelPricingModule } from "../travel-pricing/travel-pricing.module";
import { ContractCommercialSnapshotService } from "./contract-commercial-snapshot.service";
import { ContractReservationApprovalService } from "./contract-reservation-approval.service";

@Module({
  imports: [TravelPackagesModule, CommercialObligationModule, TravelPricingModule],
  providers: [ContractReservationApprovalService, ContractCommercialSnapshotService],
  exports: [ContractReservationApprovalService],
})
export class ContractReservationApprovalModule {}

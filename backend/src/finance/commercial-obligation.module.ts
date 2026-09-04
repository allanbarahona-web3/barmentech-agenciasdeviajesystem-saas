import { Module } from "@nestjs/common";
import { CommercialObligationService } from "./commercial-obligation.service";

@Module({
  providers: [CommercialObligationService],
  exports: [CommercialObligationService],
})
export class CommercialObligationModule {}

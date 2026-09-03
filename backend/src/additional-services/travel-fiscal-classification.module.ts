import { Module } from "@nestjs/common";
import { TravelFiscalClassificationService } from "./travel-fiscal-classification.service";

@Module({
  providers: [TravelFiscalClassificationService],
  exports: [TravelFiscalClassificationService],
})
export class TravelFiscalClassificationModule {}

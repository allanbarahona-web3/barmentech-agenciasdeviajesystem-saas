import { Module } from "@nestjs/common";
import { BccrOfficialExchangeRateAdapter } from "./bccr-official-exchange-rate.adapter";
import { OFFICIAL_EXCHANGE_RATE_PROVIDER } from "./official-exchange-rate.provider";

@Module({
  providers: [
    BccrOfficialExchangeRateAdapter,
    {
      provide: OFFICIAL_EXCHANGE_RATE_PROVIDER,
      useExisting: BccrOfficialExchangeRateAdapter,
    },
  ],
  exports: [OFFICIAL_EXCHANGE_RATE_PROVIDER],
})
export class OfficialExchangeRateModule {}

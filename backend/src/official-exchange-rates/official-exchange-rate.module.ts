import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { BccrOfficialExchangeRateAdapter } from "./bccr-official-exchange-rate.adapter";
import { OFFICIAL_EXCHANGE_RATE_PROVIDER } from "./official-exchange-rate.provider";
import { OfficialExchangeRateResolver } from "./official-exchange-rate.resolver";
import { PrismaOfficialExchangeRateRepository } from "./prisma-official-exchange-rate.repository";
import { OFFICIAL_EXCHANGE_RATE_REPOSITORY } from "./official-exchange-rate.repository";

@Module({
  imports: [PrismaModule],
  providers: [
    BccrOfficialExchangeRateAdapter,
    PrismaOfficialExchangeRateRepository,
    {
      provide: OFFICIAL_EXCHANGE_RATE_PROVIDER,
      useExisting: BccrOfficialExchangeRateAdapter,
    },
    {
      provide: OFFICIAL_EXCHANGE_RATE_REPOSITORY,
      useExisting: PrismaOfficialExchangeRateRepository,
    },
    OfficialExchangeRateResolver,
  ],
  exports: [OfficialExchangeRateResolver],
})
export class OfficialExchangeRateModule {}

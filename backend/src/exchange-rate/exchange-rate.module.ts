import { Module } from "@nestjs/common";
import { ExchangeRateController } from "./exchange-rate.controller";
import { ExchangeRateService } from "./exchange-rate.service";
import { PrismaModule } from "../prisma/prisma.module";
import { TenantModule } from "../tenant/tenant.module";
import { EmailModule } from "../email/email.module";
import { OfficialExchangeRateModule } from "../official-exchange-rates/official-exchange-rate.module";
import { DailyExchangeRateResolver } from "./daily-exchange-rate.resolver";
import { CurrentExchangeRateResolver } from "./current-exchange-rate.resolver";

@Module({
  imports: [PrismaModule, TenantModule, EmailModule, OfficialExchangeRateModule],
  controllers: [ExchangeRateController],
  providers: [ExchangeRateService, DailyExchangeRateResolver, CurrentExchangeRateResolver],
  exports: [ExchangeRateService, DailyExchangeRateResolver, CurrentExchangeRateResolver],
})
export class ExchangeRateModule {}

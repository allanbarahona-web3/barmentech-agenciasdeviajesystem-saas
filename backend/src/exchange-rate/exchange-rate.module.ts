import { Module } from "@nestjs/common";
import { ExchangeRateController } from "./exchange-rate.controller";
import { ExchangeRateService } from "./exchange-rate.service";
import { PrismaModule } from "../prisma/prisma.module";
import { TenantModule } from "../tenant/tenant.module";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [PrismaModule, TenantModule, EmailModule],
  controllers: [ExchangeRateController],
  providers: [ExchangeRateService],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}

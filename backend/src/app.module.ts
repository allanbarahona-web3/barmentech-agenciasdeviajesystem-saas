import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { CompanyBankAccountsModule } from "./company-bank-accounts/company-bank-accounts.module";
import { ContractsModule } from "./contracts/contracts.module";
import { ExchangeRateModule } from "./exchange-rate/exchange-rate.module";
import { PaymentVerificationModule } from "./payment-verification/payment-verification.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TravelPackagesModule } from "./travel-packages/travel-packages.module";

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_TTL_MS || 60000),
        limit: Number(process.env.RATE_LIMIT_MAX || 120),
      },
    ]),
    PrismaModule,
    AuthModule,
    ContractsModule,
    BillingModule,
    CompanyBankAccountsModule,
    PaymentVerificationModule,
    ExchangeRateModule,
    TravelPackagesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { CompanyBankAccountsModule } from "./company-bank-accounts/company-bank-accounts.module";
import { ContractsModule } from "./contracts/contracts.module";
import { EmployeesModule } from "./employees/employees.module";
import { ExchangeRateModule } from "./exchange-rate/exchange-rate.module";
import { PaymentVerificationModule } from "./payment-verification/payment-verification.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TravelPackagesModule } from "./travel-packages/travel-packages.module";
import { TenantModule } from "./tenant/tenant.module";
import { SuperAdminModule } from "./super-admin/super-admin.module";
import { EmailModule } from "./email/email.module";
import { InternalTourismModule } from "./internal-tourism/internal-tourism.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { TenantMiddleware } from "./tenant/tenant.middleware";
import { RLSInterceptor } from "./common/interceptors/rls.interceptor";

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
    TenantModule,
    EmailModule,
    AuthModule,
    SuperAdminModule,
    ContractsModule,
    BillingModule,
    CompanyBankAccountsModule,
    EmployeesModule,
    PaymentVerificationModule,
    ExchangeRateModule,
    TravelPackagesModule,
    InternalTourismModule,
    AttendanceModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RLSInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // TenantMiddleware se aplica a todas las rutas
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}

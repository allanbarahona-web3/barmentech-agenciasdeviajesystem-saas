import { Module } from '@nestjs/common';
import { PaymentVerificationController } from './payment-verification.controller';
import { PaymentVerificationService } from './payment-verification.service';
import { OpenAiVisionService } from './openai-vision.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CompanyBankAccountsModule } from '../company-bank-accounts/company-bank-accounts.module';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';

@Module({
  imports: [PrismaModule, CompanyBankAccountsModule, ExchangeRateModule],
  controllers: [PaymentVerificationController],
  providers: [PaymentVerificationService, OpenAiVisionService],
  exports: [PaymentVerificationService, OpenAiVisionService],
})
export class PaymentVerificationModule {}

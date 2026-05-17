import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { EmailModule } from "../email/email.module";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";
import { ContractsEmailsService } from "./contracts-emails.service";
import { PdfRenderService } from "./pdf-render.service";

@Module({
  imports: [BillingModule, EmailModule],
  controllers: [ContractsController],
  providers: [ContractsService, ContractsEmailsService, PdfRenderService],
})
export class ContractsModule {}

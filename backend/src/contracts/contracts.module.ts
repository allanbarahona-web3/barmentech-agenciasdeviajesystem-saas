import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { EmailModule } from "../email/email.module";
import { CustomersModule } from "../customers/customers.module";
import { DocumentsModule } from "../documents/documents.module";
import { StorageModule } from "../storage/storage.module";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";
import { ContractsEmailsService } from "./contracts-emails.service";
import { PdfRenderService } from "./pdf-render.service";
import { ContractSigningSessionBuilder } from "./contract-signing-session.builder";

@Module({
  imports: [BillingModule, EmailModule, CustomersModule, DocumentsModule, StorageModule],
  controllers: [ContractsController],
  providers: [ContractsService, ContractsEmailsService, PdfRenderService, ContractSigningSessionBuilder],
})
export class ContractsModule {}

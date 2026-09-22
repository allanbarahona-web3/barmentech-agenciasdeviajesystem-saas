import { Module } from "@nestjs/common";
import { BusinessNumberingModule } from "../business-numbering/business-numbering.module";
import { CostEngineModule } from "../cost-engine/cost-engine.module";
import { PricingModule } from "../pricing/pricing.module";
import { DocumentsModule } from "../documents/documents.module";
import { GeneratedDocumentsModule } from "../generated-documents";
import { StorageModule } from "../storage/storage.module";
import { EmailModule } from "../email/email.module";
import { SalesOrdersModule } from "../sales-orders/sales-orders.module";
import { CustomQuotationCostingService } from "./custom-quotation-costing.service";
import { CustomQuotationPricingService } from "./custom-quotation-pricing.service";
import { CustomQuotationVersionService } from "./custom-quotation-version.service";
import { CustomQuotationProposalMapper } from "./custom-quotation-proposal.mapper";
import { CustomQuotationProposalService } from "./custom-quotation-proposal.service";
import { CustomQuotationApprovalService } from "./custom-quotation-approval.service";
import { CustomQuotationCustomerApprovalService } from "./custom-quotation-customer-approval.service";
import { CustomQuotationCustomerApprovalPublicController } from "./custom-quotation-customer-approval-public.controller";
import { CustomQuotationDeliveryEmailMapper } from "./custom-quotation-delivery-email.mapper";
import { CustomQuotationDeliveryService } from "./custom-quotation-delivery.service";
import { CustomQuotationSalesOrderService } from "./custom-quotation-sales-order.service";
import { CustomQuotationsController } from "./custom-quotations.controller";
import { CustomQuotationsService } from "./custom-quotations.service";

@Module({
  imports: [BusinessNumberingModule, CostEngineModule, PricingModule, DocumentsModule, GeneratedDocumentsModule, StorageModule, EmailModule, SalesOrdersModule],
  controllers: [CustomQuotationsController, CustomQuotationCustomerApprovalPublicController],
  providers: [CustomQuotationsService, CustomQuotationCostingService, CustomQuotationPricingService, CustomQuotationVersionService, CustomQuotationProposalMapper, CustomQuotationProposalService, CustomQuotationApprovalService, CustomQuotationCustomerApprovalService, CustomQuotationDeliveryEmailMapper, CustomQuotationDeliveryService, CustomQuotationSalesOrderService],
  exports: [CustomQuotationsService, CustomQuotationCostingService, CustomQuotationPricingService, CustomQuotationVersionService, CustomQuotationProposalService, CustomQuotationApprovalService],
})
export class CustomQuotationsModule {}

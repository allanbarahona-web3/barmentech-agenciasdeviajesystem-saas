import { Module } from "@nestjs/common";
import { FiscalBillingReportingModule } from "../reporting-adapters/fiscal-billing/fiscal-billing-reporting.module";
import { FinanceReportingModule } from "../reporting-adapters/finance/finance-reporting.module";
import { ReportingController } from "./reporting.controller";
import { ReportingModule } from "./reporting.module";
import { ReportingSalesApplicationService } from "./sales/reporting-sales-application.service";
import { SalesReportService } from "./sales/sales-report.service";
import { ReportingSalesTaxApplicationService } from "./sales-tax/reporting-sales-tax-application.service";
import { SalesTaxReportService } from "./sales-tax/sales-tax-report.service";
import { ReportingExportService } from "./exports/reporting-export.service";
import { ReportingReceivablesApplicationService } from "./receivables/reporting-receivables-application.service";
import { ReceivablesReportService } from "./receivables/receivables-report.service";

@Module({
  imports: [ReportingModule, FiscalBillingReportingModule, FinanceReportingModule],
  controllers: [ReportingController],
  providers: [ReportingSalesApplicationService, SalesReportService, ReportingSalesTaxApplicationService, SalesTaxReportService, ReportingExportService, ReportingReceivablesApplicationService, ReceivablesReportService],
})
export class ReportingApplicationModule {}

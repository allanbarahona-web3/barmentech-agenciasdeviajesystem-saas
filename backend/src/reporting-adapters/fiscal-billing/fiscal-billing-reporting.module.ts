import { Module } from "@nestjs/common";
import { REPORT_DOCUMENT_READER, REPORT_TAX_AGGREGATION_READER } from "../../reporting/contracts/reporting.contracts";
import { ReportingModule } from "../../reporting/reporting.module";
import { FiscalBillingReportingAdapter } from "./fiscal-billing-reporting.adapter";

@Module({
  imports: [ReportingModule],
  providers: [
    FiscalBillingReportingAdapter,
    { provide: REPORT_DOCUMENT_READER, useExisting: FiscalBillingReportingAdapter },
    { provide: REPORT_TAX_AGGREGATION_READER, useExisting: FiscalBillingReportingAdapter },
  ],
  exports: [FiscalBillingReportingAdapter, REPORT_DOCUMENT_READER, REPORT_TAX_AGGREGATION_READER],
})
export class FiscalBillingReportingModule {}

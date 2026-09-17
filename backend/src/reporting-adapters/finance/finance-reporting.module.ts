import { Module } from "@nestjs/common";
import { RECEIVABLE_MONTHLY_PROJECTION_READER, RECEIVABLE_REPORT_READER, RECEIVABLE_REPORT_SUMMARY_READER } from "../../reporting/contracts/receivables-reporting.contracts";
import { ReportingModule } from "../../reporting/reporting.module";
import { FinanceReportingAdapter } from "./finance-reporting.adapter";

@Module({
  imports: [ReportingModule],
  providers: [
    FinanceReportingAdapter,
    { provide: RECEIVABLE_REPORT_READER, useExisting: FinanceReportingAdapter },
    { provide: RECEIVABLE_REPORT_SUMMARY_READER, useExisting: FinanceReportingAdapter },
    { provide: RECEIVABLE_MONTHLY_PROJECTION_READER, useExisting: FinanceReportingAdapter },
  ],
  exports: [FinanceReportingAdapter, RECEIVABLE_REPORT_READER, RECEIVABLE_REPORT_SUMMARY_READER, RECEIVABLE_MONTHLY_PROJECTION_READER],
})
export class FinanceReportingModule {}

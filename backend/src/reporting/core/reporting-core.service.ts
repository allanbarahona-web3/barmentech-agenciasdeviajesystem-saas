import { Injectable } from "@nestjs/common";
import type {
  ReportDocument,
  ReportDocumentReadFilter,
  ReportDocumentReader,
  ReportExecutionContext,
  ResolvedReportingPeriod,
} from "../contracts/reporting.contracts";

/**
 * Generic readonly orchestration. Authorization and persistence remain outside
 * this service, behind the execution context and reader port respectively.
 */
@Injectable()
export class ReportingCoreService {
  async readDocuments(
    reader: ReportDocumentReader,
    context: ReportExecutionContext,
    period: ResolvedReportingPeriod,
    filter?: ReportDocumentReadFilter,
  ): Promise<readonly ReportDocument[]> {
    assertExecutionContext(context);
    assertPeriod(period);
    return reader.readDocuments(context, period, filter);
  }
}

export function assertExecutionContext(context: ReportExecutionContext): void {
  if (!nonEmpty(context.tenantId) || !nonEmpty(context.actorUserId) || !nonEmpty(context.timezone)) {
    throw new Error("REPORTING_EXECUTION_CONTEXT_INVALID");
  }
}

function assertPeriod(period: ResolvedReportingPeriod): void {
  if (!isCalendarDate(period.startOn) || !isCalendarDate(period.endOn) || period.startOn > period.endOn) {
    throw new Error("REPORTING_PERIOD_INVALID");
  }
}

function nonEmpty(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

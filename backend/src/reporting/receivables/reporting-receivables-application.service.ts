import { Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { ReceivableDueDateSelection, ReceivableReportReadFilter, ReceivableReportWindow } from "../contracts/receivables-reporting.contracts";
import { ReportingAccessPolicy } from "../access/reporting-access-policy";
import { ReportingPeriodResolver } from "../period/reporting-period.resolver";
import { ReceivablesReportService, type ReceivablesReportResult } from "./receivables-report.service";

export interface AuthenticatedReceivablesReportRequest {
  tenantId: string;
  actorUserId: string;
  role: UserRole;
  dueDate: ReceivableDueDateSelection;
  page: number;
  pageSize: number;
  filter?: ReceivableReportReadFilter;
}

/** Outer authorization and tenant-timezone orchestration for the readonly report. */
@Injectable()
export class ReportingReceivablesApplicationService {
  constructor(private readonly prisma: PrismaService, private readonly access: ReportingAccessPolicy, private readonly periods: ReportingPeriodResolver, private readonly receivables: ReceivablesReportService) {}

  async execute(request: AuthenticatedReceivablesReportRequest): Promise<ReceivablesReportResult> {
    const config = await this.prisma.tenantBillingConfiguration.findUnique({ where: { tenantId: request.tenantId }, select: { fiscalTimezone: true } });
    const context = this.access.createReadContext({ tenantId: request.tenantId, actorUserId: request.actorUserId, role: request.role, timezone: config?.fiscalTimezone ?? "UTC" }, "RECEIVABLES");
    const asOfDate = this.periods.resolve({ kind: "TODAY" }, context.timezone).startOn;
    const dueDateRange = resolveDueDateRange(request.dueDate, asOfDate);
    const window: ReceivableReportWindow = {
      ...(dueDateRange ? { dueDateFrom: dueDateRange.startOn, dueDateTo: dueDateRange.endOn } : {}),
      currentOn: asOfDate,
      currentWindowEndOn: asOfDate,
      monthlyStartOn: `${asOfDate.slice(0, 7)}-01`,
    };
    return this.receivables.execute(context, dueDateRange ?? { startOn: asOfDate, endOn: asOfDate }, { page: request.page, pageSize: request.pageSize, read: { window, ...(request.filter ? { filter: request.filter } : {}) } });
  }
}

function resolveDueDateRange(selection: ReceivableDueDateSelection, today: string): { startOn: string; endOn: string } | undefined {
  switch (selection.preset) {
    case "ALL": return undefined;
    case "OVERDUE": return { startOn: "0001-01-01", endOn: addDays(today, -1) };
    case "DUE_TODAY": return { startOn: today, endOn: today };
    case "NEXT_7_DAYS": return { startOn: today, endOn: addDays(today, 7) };
    case "NEXT_15_DAYS": return { startOn: today, endOn: addDays(today, 15) };
    case "CURRENT_MONTH": return { startOn: `${today.slice(0, 7)}-01`, endOn: endOfMonth(today.slice(0, 7)) };
    case "CUSTOM": return { startOn: selection.dateFrom, endOn: selection.dateTo };
  }
}

function addDays(value: string, days: number): string { const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function endOfMonth(yearMonth: string): string { const [year, month] = yearMonth.split("-").map(Number); return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10); }

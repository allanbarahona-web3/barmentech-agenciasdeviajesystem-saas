import { BadRequestException } from "@nestjs/common";
import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";
import type { ReportingPeriodSelection } from "../period/reporting-period.resolver";

const PERIODS = ["TODAY", "LAST_7_DAYS", "LAST_30_DAYS", "THIS_MONTH", "CUSTOM"] as const;

export class AdminDashboardQueryDto {
  @IsOptional() @IsString() @IsIn(PERIODS) period?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export type AdminDashboardPeriodKind = typeof PERIODS[number];

export function parseAdminDashboardPeriod(query: AdminDashboardQueryDto): {
  kind: AdminDashboardPeriodKind;
  selection: ReportingPeriodSelection;
} {
  const kind = String(query.period ?? "THIS_MONTH").trim().toUpperCase() as AdminDashboardPeriodKind;
  if (!(PERIODS as readonly string[]).includes(kind)) {
    throw new BadRequestException("ADMIN_DASHBOARD_PERIOD_INVALID");
  }
  if (kind === "CUSTOM") {
    if (!query.dateFrom || !query.dateTo || query.dateFrom > query.dateTo) {
      throw new BadRequestException("ADMIN_DASHBOARD_CUSTOM_PERIOD_INVALID");
    }
    return { kind, selection: { kind: "CUSTOM", startOn: query.dateFrom, endOn: query.dateTo } };
  }
  if (kind === "THIS_MONTH") return { kind, selection: { kind: "CURRENT_MONTH" } };
  return { kind, selection: { kind } };
}

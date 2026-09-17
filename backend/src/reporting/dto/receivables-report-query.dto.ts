import { BadRequestException } from "@nestjs/common";
import { IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import type { ReceivableDueDatePreset, ReceivableDueDateSelection, ReceivableReportReadFilter } from "../contracts/receivables-reporting.contracts";
const DUE_DATE_PRESETS: readonly ReceivableDueDatePreset[] = ["ALL", "OVERDUE", "DUE_TODAY", "NEXT_7_DAYS", "NEXT_15_DAYS", "CURRENT_MONTH", "CUSTOM"];

export class ReceivablesReportQueryDto {
  @IsOptional() @IsString() @IsIn(DUE_DATE_PRESETS) dueDatePreset?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() @MaxLength(100) customerSearch?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) currencyCode?: string;
  @IsOptional() @IsString() @IsIn(["ALL", "RECOGNIZED_RECEIVABLE", "PROJECTED_RECEIVABLE"]) category?: string;
  @IsOptional() @IsString() @IsIn(["ALL", "OVERDUE", "CURRENT", "FUTURE", "NO_PROJECTABLE_DATE"]) timing?: string;
  @IsOptional() @IsString() @Matches(/^\d+$/) page?: string;
  @IsOptional() @IsString() @Matches(/^\d+$/) pageSize?: string;
  @IsOptional() @IsString() @IsIn(["PDF", "XLSX", "CSV"]) format?: string;
}

export function parseReceivablesReportQuery(query: ReceivablesReportQueryDto): { dueDate: ReceivableDueDateSelection; page: number; pageSize: number; filter?: ReceivableReportReadFilter } {
  const preset = String(query.dueDatePreset ?? "ALL").trim().toUpperCase() as ReceivableDueDatePreset;
  if (!DUE_DATE_PRESETS.includes(preset)) throw new BadRequestException("RECEIVABLE_DUE_DATE_PRESET_INVALID");
  const dueDate = preset === "CUSTOM" ? customDueDate(query.dateFrom, query.dateTo) : { preset };
  const filter: ReceivableReportReadFilter = {
    ...(query.customerSearch?.trim() ? { customerSearch: query.customerSearch.trim() } : {}),
    ...(query.currencyCode ? { currencyCode: query.currencyCode.toUpperCase() } : {}),
    ...(query.category && query.category !== "ALL" ? { category: query.category as "RECOGNIZED_RECEIVABLE" | "PROJECTED_RECEIVABLE" } : {}),
    ...(query.timing && query.timing !== "ALL" ? { timing: query.timing as ReceivableReportReadFilter["timing"] } : {}),
  };
  return { dueDate, page: positive(query.page, 1, 1, 10_000), pageSize: positive(query.pageSize, 25, 1, 100), ...(Object.keys(filter).length ? { filter } : {}) };
}
function customDueDate(dateFrom?: string, dateTo?: string): ReceivableDueDateSelection { if (!dateFrom || !dateTo) throw new BadRequestException("RECEIVABLE_CUSTOM_DUE_DATE_REQUIRED"); if (dateFrom > dateTo) throw new BadRequestException("RECEIVABLE_CUSTOM_DUE_DATE_INVALID"); return { preset: "CUSTOM", dateFrom, dateTo }; }
function positive(value: string | undefined, fallback: number, minimum: number, maximum: number): number { if (value === undefined || value === "") return fallback; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new BadRequestException("REPORTING_PAGINATION_INVALID"); return parsed; }

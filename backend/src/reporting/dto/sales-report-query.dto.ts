import { BadRequestException } from "@nestjs/common";
import { IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import type { ReportDocumentReadFilter } from "../contracts/reporting.contracts";
import type { ReportingProjection } from "../contracts/reporting.contracts";
import type { ReportingPeriodSelection } from "../period/reporting-period.resolver";

const PERIOD_PRESETS = ["TODAY", "LAST_7_DAYS", "LAST_15_DAYS", "CURRENT_MONTH", "PREVIOUS_MONTH", "CUSTOM"] as const;
const STANDARD_PERIOD_PRESETS = ["TODAY", "LAST_7_DAYS", "LAST_15_DAYS", "CURRENT_MONTH", "PREVIOUS_MONTH"] as const;

/** Shared readonly query contract for the Sales and Sales Tax reporting endpoints. */
export class ReportingQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(PERIOD_PRESETS)
  periodPreset?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  page?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  pageSize?: string;

  @IsOptional()
  @IsString()
  @IsIn(["ALL", "CASH", "CREDIT", "OTHER"])
  saleCondition?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currencyCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  taxCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  rateCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(?:\.\d+)?$/)
  rate?: string;

  @IsOptional()
  @IsString()
  @IsIn(["ORIGINAL", "CRC"])
  projectionMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["PDF", "XLSX", "CSV"])
  format?: string;
}

export function parseReportingQuery(query: ReportingQueryDto): {
  period: ReportingPeriodSelection; page: number; pageSize: number; filter?: ReportDocumentReadFilter; projection: ReportingProjection;
} {
  const preset = String(query.periodPreset || "CURRENT_MONTH").trim().toUpperCase();
  const period = preset === "CUSTOM"
    ? customPeriod(query.dateFrom, query.dateTo)
    : standardPeriod(preset);
  return {
    period,
    page: positiveInteger(query.page, 1, 1, 10_000),
    pageSize: positiveInteger(query.pageSize, 25, 1, 100),
    filter: reportingFilter(query),
    projection: query.projectionMode === "CRC" ? { mode: "TARGET_CURRENCY", targetCurrencyCode: "CRC" } : { mode: "ORIGINAL" },
  };
}

function reportingFilter(query: ReportingQueryDto): ReportDocumentReadFilter | undefined {
  const saleCondition = query.saleCondition && query.saleCondition !== "ALL" ? query.saleCondition as "CASH" | "CREDIT" | "OTHER" : undefined;
  const currencyCode = query.currencyCode?.toUpperCase();
  const filter: ReportDocumentReadFilter = {
    ...(saleCondition ? { saleCondition } : {}),
    ...(currencyCode ? { currencyCode } : {}),
    ...(query.taxCode ? { taxCode: query.taxCode } : {}),
    ...(query.rateCode ? { rateCode: query.rateCode } : {}),
    ...(query.rate ? { rate: query.rate } : {}),
  };
  return Object.keys(filter).length ? filter : undefined;
}

function standardPeriod(value: string): ReportingPeriodSelection {
  if (STANDARD_PERIOD_PRESETS.includes(value as typeof STANDARD_PERIOD_PRESETS[number])) {
    return { kind: value as Exclude<ReportingPeriodSelection["kind"], "CUSTOM"> };
  }
  throw new BadRequestException("REPORTING_PERIOD_PRESET_INVALID");
}

function customPeriod(startOn?: string, endOn?: string): ReportingPeriodSelection {
  if (!startOn || !endOn) throw new BadRequestException("REPORTING_CUSTOM_PERIOD_REQUIRED");
  return { kind: "CUSTOM", startOn, endOn };
}

function positiveInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) throw new BadRequestException("REPORTING_PAGINATION_INVALID");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new BadRequestException("REPORTING_PAGINATION_INVALID");
  return parsed;
}

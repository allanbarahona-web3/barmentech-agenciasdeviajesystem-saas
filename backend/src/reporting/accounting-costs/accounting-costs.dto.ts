import { BadRequestException } from "@nestjs/common";
import { IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import type { AccountingCostFilter, AccountingCostReadRequest, OperationalPurchaseAccountingCostFilter } from "./accounting-costs.types";
import type { ReportingPeriodSelection } from "../period/reporting-period.resolver";

const PERIODS = ["TODAY", "LAST_7_DAYS", "LAST_15_DAYS", "CURRENT_MONTH", "PREVIOUS_MONTH", "CUSTOM"] as const;

export class AccountingCostsQueryDto {
  @IsOptional() @IsString() @IsIn(PERIODS) periodPreset?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() @IsIn(["OPERATIONAL_PURCHASE"]) sourceType?: string;
  @IsOptional() @IsString() @MaxLength(100) counterpartySearch?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @IsOptional() @IsString() @MaxLength(80) servicePurposeCode?: string;
  @IsOptional() @IsString() @IsIn(["DRAFT", "RESERVED", "PURCHASED", "CONFIRMED", "CANCELLED"]) status?: string;
  @IsOptional() @IsString() @MaxLength(191) travelPackageId?: string;
  @IsOptional() @IsString() @MaxLength(191) customerId?: string;
  @IsOptional() @IsString() @Matches(/^\d+$/) page?: string;
  @IsOptional() @IsString() @Matches(/^\d+$/) pageSize?: string;
}

export class AccountingCostsExportQueryDto extends AccountingCostsQueryDto {
  @IsOptional() @IsString() @IsIn(["ORIGINAL", "BASE"]) projectionMode?: string;
  @IsOptional() @IsString() @IsIn(["PDF", "XLSX", "CSV"]) format?: string;
}

export class AccountingCostEvidenceQueryDto {
  @IsOptional() @IsString() @Matches(/^\d+$/) page?: string;
  @IsOptional() @IsString() @Matches(/^\d+$/) pageSize?: string;
}

export function parseAccountingCostsQuery(query: AccountingCostsQueryDto): { period: ReportingPeriodSelection; read: AccountingCostReadRequest } {
  const preset = String(query.periodPreset ?? "CURRENT_MONTH").trim().toUpperCase();
  const period = preset === "CUSTOM" ? customPeriod(query.dateFrom, query.dateTo) : standardPeriod(preset);
  const filter: AccountingCostFilter = {
    ...(query.sourceType ? { sourceType: "OPERATIONAL_PURCHASE" } : {}),
    ...(query.counterpartySearch?.trim() ? { counterpartySearch: query.counterpartySearch.trim() } : {}),
    ...(query.currency ? { currency: query.currency.toUpperCase() } : {}),
    ...(query.servicePurposeCode?.trim() ? { servicePurposeCode: query.servicePurposeCode.trim() } : {}),
    ...(query.status?.trim() ? { status: query.status.trim().toUpperCase() } : {}),
  };
  const operational: OperationalPurchaseAccountingCostFilter = {
    ...(query.travelPackageId?.trim() ? { travelPackageId: query.travelPackageId.trim() } : {}),
    ...(query.customerId?.trim() ? { customerId: query.customerId.trim() } : {}),
  };
  return { period, read: { page: positive(query.page, 1, 25), pageSize: positive(query.pageSize, 20, 25), ...(Object.keys(filter).length ? { filter } : {}), ...(Object.keys(operational).length ? { operational } : {}) } };
}

export function parseAccountingCostsExportQuery(query: AccountingCostsExportQueryDto) {
  return { ...parseAccountingCostsQuery(query), projectionMode: query.projectionMode === "BASE" ? "BASE" as const : "ORIGINAL" as const };
}

export function parseEvidencePagination(query: AccountingCostEvidenceQueryDto) { return { page: positive(query.page, 1, 25), pageSize: positive(query.pageSize, 20, 25) }; }
function standardPeriod(value: string): ReportingPeriodSelection { if ((PERIODS as readonly string[]).includes(value) && value !== "CUSTOM") return { kind: value as Exclude<ReportingPeriodSelection["kind"], "CUSTOM"> }; throw new BadRequestException("REPORTING_PERIOD_PRESET_INVALID"); }
function customPeriod(startOn?: string, endOn?: string): ReportingPeriodSelection { if (!startOn || !endOn || startOn > endOn) throw new BadRequestException("REPORTING_CUSTOM_PERIOD_INVALID"); return { kind: "CUSTOM", startOn, endOn }; }
function positive(value: string | undefined, fallback: number, maximum: number) { if (value === undefined || value === "") return fallback; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new BadRequestException("REPORTING_PAGINATION_INVALID"); return parsed; }

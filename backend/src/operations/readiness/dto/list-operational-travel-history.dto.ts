import { Transform } from "class-transformer";
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import {
  OPERATIONAL_WORK_SOURCE_CATEGORIES,
  type OperationalWorkSourceCategory,
} from "../operational-work-source-filter";

export const OPERATIONAL_TRAVEL_HISTORY_DATE_PRESETS = ["TODAY", "LAST_7_DAYS", "LAST_30_DAYS", "CUSTOM"] as const;
export const OPERATIONAL_TRAVEL_HISTORY_TERMINAL_STATUSES = ["ALL", "CONFIRMED", "CANCELLED"] as const;

export class ListOperationalTravelHistoryDto {
  @IsOptional()
  @IsIn(OPERATIONAL_TRAVEL_HISTORY_DATE_PRESETS)
  datePreset?: (typeof OPERATIONAL_TRAVEL_HISTORY_DATE_PRESETS)[number];

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @MaxLength(191)
  travelPackageId?: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @MaxLength(191)
  travelPackageParticipantId?: string;

  @IsOptional()
  @IsIn(OPERATIONAL_WORK_SOURCE_CATEGORIES)
  sourceCategory?: OperationalWorkSourceCategory;

  @IsOptional()
  @IsIn(OPERATIONAL_TRAVEL_HISTORY_TERMINAL_STATUSES)
  terminalStatus?: (typeof OPERATIONAL_TRAVEL_HISTORY_TERMINAL_STATUSES)[number];

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(25)
  pageSize = 20;
}

import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export const OPERATIONAL_PASSENGER_DASHBOARD_SOURCES = ["BASE_TRIP", "ADDITIONAL_SERVICES"] as const;
export const OPERATIONAL_PASSENGER_DASHBOARD_STATUSES = ["PENDING", "IN_PROGRESS", "RESERVED", "PURCHASED", "CONFIRMED", "CANCELLED", "NOT_APPLICABLE"] as const;

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;

export class ListOperationalPassengerDashboardDto {
  @Transform(({ value }) => Number.parseInt(String(value), 10)) @IsInt() @Min(1)
  page = 1;

  @Transform(({ value }) => Number.parseInt(String(value), 10)) @IsInt() @Min(1) @Max(25)
  pageSize = 20;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(160)
  search?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(191)
  contractId?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(191)
  passengerGroupId?: string;

  @IsOptional() @IsIn(OPERATIONAL_PASSENGER_DASHBOARD_SOURCES)
  source?: typeof OPERATIONAL_PASSENGER_DASHBOARD_SOURCES[number];

  @IsOptional() @IsIn(OPERATIONAL_PASSENGER_DASHBOARD_STATUSES)
  status?: typeof OPERATIONAL_PASSENGER_DASHBOARD_STATUSES[number];
}

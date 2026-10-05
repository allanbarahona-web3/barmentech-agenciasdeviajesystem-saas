import { Transform } from "class-transformer";
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { OPERATIONAL_WORK_SOURCE_CATEGORIES, type OperationalWorkSourceCategory } from "../operational-work-source-filter";

const states = ["PENDING", "IN_PROGRESS", "FULFILLED", "CANCELLED", "NOT_APPLICABLE"] as const;
const deadlines = ["OVERDUE", "DUE_SOON", "FUTURE", "NONE"] as const;
export class ListOperationalWorkItemsDto {
  @Transform(({ value }) => Number.parseInt(String(value), 10)) @IsInt() @Min(1) page = 1;
  @Transform(({ value }) => Number.parseInt(String(value), 10)) @IsInt() @Min(1) @Max(25) pageSize = 20;
  @IsOptional() @IsIn(states) status?: typeof states[number];
  @IsOptional() @IsBooleanString() active?: string;
  @IsOptional() @IsString() @MaxLength(80) servicePurposeCode?: string;
  @IsOptional() @IsString() @MaxLength(191) participantId?: string;
  @IsOptional() @IsString() @MaxLength(191) passengerGroupId?: string;
  @IsOptional() @IsString() @MaxLength(191) assignedToUserId?: string;
  @IsOptional() @IsBooleanString() unassigned?: string;
  @IsOptional() @IsBooleanString() critical?: string;
  @IsOptional() @IsIn(deadlines) deadlineState?: typeof deadlines[number];
  @IsOptional() @IsIn(OPERATIONAL_WORK_SOURCE_CATEGORIES) sourceCategory?: OperationalWorkSourceCategory;
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @MaxLength(100) search?: string;
}

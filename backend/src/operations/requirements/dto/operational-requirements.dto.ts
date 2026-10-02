import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsBooleanString,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const trimIdentifiers = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : item))
    : value;
const supplied = (_object: unknown, value: unknown) => value !== undefined;

const MONEY_PATTERN = /^\d+(?:\.\d{1,5})?$/;
export const OPERATIONAL_SOURCE_TYPES = ["MANUAL", "CONTRACT", "CUSTOM_QUOTATION"] as const;
export const OPERATIONAL_SOLD_VALUE_SCOPES = [
  "EXACT_SERVICE_LINE",
  "ORDER_TOTAL",
  "QUOTATION_TOTAL",
  "CONTRACT_TOTAL",
  "PACKAGE_REFERENCE",
  "NONE",
] as const;
export const OPERATIONAL_REQUIREMENT_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "FULFILLED",
  "CANCELLED",
  "NOT_APPLICABLE",
] as const;

class RequirementSourceGroupSnapshotDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  sourcePassengerGroupId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @Matches(/\S/)
  sourcePassengerGroupName?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  @Matches(/\S/)
  sourcePassengerGroupServiceCode?: string | null;
}

export class CreateOperationalRequirementDto extends RequirementSourceGroupSnapshotDto {
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  @Matches(/\S/)
  servicePurposeCode!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(160)
  @Matches(/\S/)
  servicePurposeName!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  @Matches(/\S/)
  description!: string;

  @IsOptional()
  @IsBoolean()
  critical?: boolean;

  @IsOptional()
  @IsDateString()
  operationalDeadlineAt?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  assignedToUserId?: string | null;

  @Transform(trimIdentifiers)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(191, { each: true })
  @Matches(/\S/, { each: true })
  participantIds!: string[];

  @IsIn(OPERATIONAL_SOURCE_TYPES)
  sourceType!: (typeof OPERATIONAL_SOURCE_TYPES)[number];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  sourceId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  sourceLineId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  sourceVersionId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @Matches(/\S/)
  sourceReference?: string | null;

  @IsOptional()
  @IsDateString()
  sourceAcceptedAt?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(MONEY_PATTERN)
  soldAmount?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  soldCurrency?: string | null;

  @IsOptional()
  @IsIn(OPERATIONAL_SOLD_VALUE_SCOPES)
  soldValueScope?: (typeof OPERATIONAL_SOLD_VALUE_SCOPES)[number];
}

export class UpdateOperationalRequirementDto extends RequirementSourceGroupSnapshotDto {
  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  @Matches(/\S/)
  servicePurposeCode?: string;

  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  @Matches(/\S/)
  servicePurposeName?: string;

  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  @Matches(/\S/)
  description?: string;

  @ValidateIf(supplied)
  @IsBoolean()
  critical?: boolean;

  @IsOptional()
  @IsDateString()
  operationalDeadlineAt?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  assignedToUserId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @Matches(/\S/)
  sourceReference?: string | null;
}

export class OperationalRequirementPassengersDto {
  @Transform(trimIdentifiers)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(191, { each: true })
  @Matches(/\S/, { each: true })
  participantIds!: string[];
}

export class TransitionOperationalRequirementDto {
  @IsIn(OPERATIONAL_REQUIREMENT_STATUSES)
  status!: (typeof OPERATIONAL_REQUIREMENT_STATUSES)[number];
}

export class ListOperationalRequirementsDto {
  @IsOptional()
  @IsIn(OPERATIONAL_REQUIREMENT_STATUSES)
  status?: (typeof OPERATIONAL_REQUIREMENT_STATUSES)[number];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  @Matches(/\S/)
  servicePurposeCode?: string;

  @IsOptional()
  @IsBooleanString()
  critical?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  assignedToUserId?: string;

  @IsOptional()
  @IsDateString()
  deadlineFrom?: string;

  @IsOptional()
  @IsDateString()
  deadlineTo?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @Matches(/\S/)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  pageSize?: number;
}

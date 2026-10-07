import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
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

export const OPERATIONAL_FULFILLMENT_STATUSES = [
  "DRAFT",
  "RESERVED",
  "PURCHASED",
  "CONFIRMED",
  "CANCELLED",
] as const;

export class OperationalFulfillmentFieldsDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @Matches(/\S/)
  providerName?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @Matches(/\S/)
  providerReference?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  reservationCode?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  confirmationReference?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  voucherReference?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  ticketReference?: string | null;

  @IsOptional()
  @IsDateString()
  serviceStartAt?: string | null;

  @IsOptional()
  @IsDateString()
  serviceEndAt?: string | null;

  @IsOptional()
  @IsObject()
  detailPayload?: Record<string, unknown> | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  detailVersion?: number | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  assignedToUserId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  @Matches(/\S/)
  confirmationNotes?: string | null;
}

export class CreateOperationalFulfillmentDto extends OperationalFulfillmentFieldsDto {
  @Transform(trimIdentifiers)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(191, { each: true })
  @Matches(/\S/, { each: true })
  participantIds!: string[];
}

/** Customer-scoped work has no TravelPackage participant assignments. */
export class CreateStandaloneOperationalFulfillmentDto extends OperationalFulfillmentFieldsDto {}

export class UpdateOperationalFulfillmentDto extends OperationalFulfillmentFieldsDto {
  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @Matches(/\S/)
  override providerName?: string | null;

  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @Matches(/\S/)
  override providerReference?: string | null;

  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  override reservationCode?: string | null;

  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  override confirmationReference?: string | null;

  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  override voucherReference?: string | null;

  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  override ticketReference?: string | null;

  @ValidateIf(supplied)
  @IsDateString()
  override serviceStartAt?: string | null;

  @ValidateIf(supplied)
  @IsDateString()
  override serviceEndAt?: string | null;

  @ValidateIf(supplied)
  @IsObject()
  override detailPayload?: Record<string, unknown> | null;

  @ValidateIf(supplied)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  override detailVersion?: number | null;

  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  override assignedToUserId?: string | null;

  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  @Matches(/\S/)
  override confirmationNotes?: string | null;
}

export class OperationalFulfillmentPassengersDto {
  @Transform(trimIdentifiers)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(191, { each: true })
  @Matches(/\S/, { each: true })
  participantIds!: string[];
}

export class TransitionOperationalFulfillmentDto {
  @IsIn(OPERATIONAL_FULFILLMENT_STATUSES)
  targetStatus!: (typeof OPERATIONAL_FULFILLMENT_STATUSES)[number];
}

export class ListOperationalFulfillmentsDto {
  @IsOptional()
  @IsIn(OPERATIONAL_FULFILLMENT_STATUSES)
  status?: (typeof OPERATIONAL_FULFILLMENT_STATUSES)[number];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  assignedToUserId?: string;

  @IsOptional()
  @IsDateString()
  serviceStartFrom?: string;

  @IsOptional()
  @IsDateString()
  serviceStartTo?: string;

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

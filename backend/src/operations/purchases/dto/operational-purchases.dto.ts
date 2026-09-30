import { Transform, Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from "class-validator";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
const supplied = (_object: unknown, value: unknown) => value !== undefined;
const MONEY = /^\d+(?:\.\d{1,5})?$/;

export class CreateOperationalPurchaseDto {
  @Transform(trim) @IsString() @MaxLength(500) @Matches(/\S/)
  providerName!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) @Matches(/\S/)
  supplierReference?: string | null;

  @Transform(trim) @IsString() @Matches(MONEY)
  amount!: string;

  @Transform(trim) @IsString() @Matches(/^[A-Za-z]{3}$/)
  currency!: string;

  @IsOptional() @Transform(trim) @IsString() @Matches(MONEY)
  taxAmount?: string | null;

  @IsDateString()
  purchasedAt!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(191) @Matches(/\S/)
  supplierInvoiceNumber?: string | null;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) @Matches(/\S/)
  notes?: string | null;
}

export class UpdateOperationalPurchaseDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) @Matches(/\S/)
  supplierReference?: string | null;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(191) @Matches(/\S/)
  supplierInvoiceNumber?: string | null;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) @Matches(/\S/)
  notes?: string | null;
}

export class ListOperationalPurchasesDto {
  @IsOptional() @Transform(trim) @IsString() @Matches(/^[A-Za-z]{3}$/)
  currency?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) @Matches(/\S/)
  providerSearch?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(25)
  pageSize?: number;
}

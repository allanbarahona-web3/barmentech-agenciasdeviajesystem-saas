import { Transform, Type } from "class-transformer";
import { FiscalItemCategory } from "@prisma/client";
import {
  IsBoolean,
  IsBooleanString,
  IsInt,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
  ValidateIf,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const present = (_object: unknown, value: unknown) => value !== undefined;

export class CreateFiscalClassificationDto {
  @Transform(trim) @IsString() @MaxLength(160) @Matches(/\S/)
  displayName!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) @Matches(/\S/)
  description?: string | null;

  @IsEnum(FiscalItemCategory)
  fiscalItemCategory!: FiscalItemCategory;

  @Transform(trim) @IsString() @MaxLength(13) @Matches(/^\d+$/)
  cabysCode!: string;

  @Transform(trim) @IsString() @MaxLength(20) @Matches(/\S/)
  unitOfMeasureCode!: string;

  @Transform(trim) @IsString() @MaxLength(4) @Matches(/\S/)
  taxCode!: string;

  @Transform(trim) @IsString() @MaxLength(4) @Matches(/\S/)
  taxRateCode!: string;
}

export class UpdateFiscalClassificationDto {
  @ValidateIf(present) @Transform(trim) @IsString() @MaxLength(160) @Matches(/\S/)
  displayName?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) @Matches(/\S/)
  description?: string | null;

  @ValidateIf(present) @IsEnum(FiscalItemCategory)
  fiscalItemCategory?: FiscalItemCategory;

  @ValidateIf(present) @Transform(trim) @IsString() @MaxLength(13) @Matches(/^\d+$/)
  cabysCode?: string;

  @ValidateIf(present) @Transform(trim) @IsString() @MaxLength(20) @Matches(/\S/)
  unitOfMeasureCode?: string;

  @ValidateIf(present) @Transform(trim) @IsString() @MaxLength(4) @Matches(/\S/)
  taxCode?: string;

  @ValidateIf(present) @Transform(trim) @IsString() @MaxLength(4) @Matches(/\S/)
  taxRateCode?: string;
}

export class UpdateFiscalClassificationStatusDto {
  @IsBoolean()
  isActive!: boolean;
}

export class ListFiscalClassificationsDto {
  @IsOptional() @IsBooleanString()
  active?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(25)
  pageSize?: number;
}

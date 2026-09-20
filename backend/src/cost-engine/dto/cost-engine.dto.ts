import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
} from "class-validator";

const MONEY_PATTERN = /^\d+(?:\.\d{1,5})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export class CreateCostComponentDto {
  @IsString()
  @IsNotEmpty()
  costCategoryId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  costSupplierId?: string | null;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsObject()
  detailPayload?: Record<string, unknown> | null;

  @IsOptional()
  @Transform(({ value }) => value === null ? null : Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  detailSchemaVersion?: number | null;

  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN)
  quantity?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  unit?: string | null;

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(0)
  sortPosition?: number;

  @IsString()
  @Matches(MONEY_PATTERN)
  amount!: string;

  @IsString()
  @Matches(CURRENCY_PATTERN)
  currency!: string;

  @IsOptional()
  @IsString()
  sourceReference?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  sourceUrl?: string | null;

  @IsOptional()
  @IsString()
  reason?: string | null;
}

export class UpdateCostComponentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  costCategoryId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  costSupplierId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsObject()
  detailPayload?: Record<string, unknown> | null;

  @IsOptional()
  @Transform(({ value }) => value === null ? null : Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  detailSchemaVersion?: number | null;

  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN)
  quantity?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  unit?: string | null;

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(0)
  sortPosition?: number;
}

export class UpdateCostComponentCostDto {
  @IsString()
  @Matches(MONEY_PATTERN)
  amount!: string;

  @IsString()
  @Matches(CURRENCY_PATTERN)
  currency!: string;

  @IsOptional()
  @IsString()
  sourceReference?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  sourceUrl?: string | null;

  @IsOptional()
  @IsString()
  reason?: string | null;
}

export class DuplicateCostComponentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;
}

export class ListCostComponentsDto {
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(25)
  pageSize?: number;
}

export class ListCostMonetaryTimelineDto extends ListCostComponentsDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/)
  categoryCode?: string;
}

export class CreateCostCategoryDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/)
  code!: string;

  @IsString()
  @IsNotEmpty()
  displayName!: string;
}

export class UpdateCostCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  displayName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateCostSupplierDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  website?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateCostSupplierDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  website?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateCostApplicabilityDto {
  @IsString()
  @IsNotEmpty()
  scopeType!: string;

  @IsOptional()
  @IsString()
  scopeKey?: string | null;

  @IsOptional()
  @IsString()
  label?: string | null;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;
}

export class UpdateCostApplicabilityDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  scopeType?: string;

  @IsOptional()
  @IsString()
  scopeKey?: string | null;

  @IsOptional()
  @IsString()
  label?: string | null;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;
}

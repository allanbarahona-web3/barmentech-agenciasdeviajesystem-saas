import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

const MONEY_PATTERN = /^\d+(?:\.\d{1,5})?$/;
const PERCENTAGE_PATTERN = /^\d+(?:\.\d{1,6})?$/;
const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const present = (_object: unknown, value: unknown) => value !== undefined;

class PricingPolicyInputsDto {
  @IsOptional() @IsString() @Matches(MONEY_PATTERN)
  operationalCostsAmountDefault?: string;

  @IsOptional() @IsString() @Matches(PERCENTAGE_PATTERN)
  riskMarginPercent?: string;

  @IsOptional() @IsString() @Matches(PERCENTAGE_PATTERN)
  targetProfitMarginPercent?: string;

  @IsOptional() @IsString() @Matches(PERCENTAGE_PATTERN)
  salesCommissionPercent?: string;

  @IsOptional() @IsString() @Matches(PERCENTAGE_PATTERN)
  bankCommissionPercent?: string;

  @IsOptional() @IsString() @Matches(PERCENTAGE_PATTERN)
  applicableTaxPercent?: string;
}

export class CreateTenantPricingPolicyDto extends PricingPolicyInputsDto {
  @Transform(trim) @IsString() @MaxLength(160) @Matches(/\S/)
  name!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) @Matches(/\S/)
  description?: string | null;

  @IsOptional() @IsBoolean()
  active?: boolean;

  @IsOptional() @IsBoolean()
  isDefaultForCustomQuotations?: boolean;
}

export class UpdateTenantPricingPolicyDto extends PricingPolicyInputsDto {
  @ValidateIf(present) @Transform(trim) @IsString() @MaxLength(160) @Matches(/\S/)
  name?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) @Matches(/\S/)
  description?: string | null;

  @ValidateIf(present) @IsBoolean()
  active?: boolean;

  @ValidateIf(present) @IsBoolean()
  isDefaultForCustomQuotations?: boolean;
}

export class UpdateTenantPricingPolicyStatusDto {
  @IsBoolean()
  active!: boolean;
}

export class UpdateTenantPricingPolicyDefaultDto {
  @IsBoolean()
  isDefaultForCustomQuotations!: boolean;
}

export class ListTenantPricingPoliciesDto {
  @IsOptional() @IsBooleanString()
  active?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(25)
  pageSize?: number;
}

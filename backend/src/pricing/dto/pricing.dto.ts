import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

const MONEY_PATTERN = /^\d+(?:\.\d{1,5})?$/;
const PERCENTAGE_PATTERN = /^\d+(?:\.\d{1,6})?$/;

export class UpdatePricingConfigurationDto {
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN)
  operationalCostsAmount?: string;

  @IsOptional()
  @IsString()
  @Matches(PERCENTAGE_PATTERN)
  riskMarginPercent?: string;

  @IsOptional()
  @IsString()
  @Matches(PERCENTAGE_PATTERN)
  targetProfitMarginPercent?: string;

  @IsOptional()
  @IsString()
  @Matches(PERCENTAGE_PATTERN)
  salesCommissionPercent?: string;

  @IsOptional()
  @IsString()
  @Matches(PERCENTAGE_PATTERN)
  bankCommissionPercent?: string;

  @IsOptional()
  @IsString()
  @Matches(PERCENTAGE_PATTERN)
  applicableTaxPercent?: string;
}

export class ListPricingCalculationVersionsDto {
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

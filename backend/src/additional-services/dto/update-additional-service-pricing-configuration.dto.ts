import { IsEnum, IsNumber, IsOptional, Min } from "class-validator";
import { AdditionalServiceMarginType } from "../enums";

export class UpdateAdditionalServicePricingConfigurationDto {
  @IsOptional()
  @IsEnum(AdditionalServiceMarginType)
  marginType?: AdditionalServiceMarginType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  marginValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxPercentage?: number;
}

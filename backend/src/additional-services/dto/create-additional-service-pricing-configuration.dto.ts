import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { AdditionalServiceMarginType } from "../enums";

export class CreateAdditionalServicePricingConfigurationDto {
  @IsString()
  additionalServiceCatalogId!: string;

  @IsEnum(AdditionalServiceMarginType)
  marginType!: AdditionalServiceMarginType;

  @IsNumber()
  @Min(0)
  marginValue!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

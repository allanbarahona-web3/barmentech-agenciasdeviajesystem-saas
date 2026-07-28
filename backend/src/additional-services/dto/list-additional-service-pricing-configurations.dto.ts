import { IsEnum, IsOptional, IsString } from "class-validator";

export class ListAdditionalServicePricingConfigurationsDto {
  @IsOptional()
  @IsString()
  additionalServiceCatalogId?: string;

  @IsOptional()
  @IsEnum(["true", "false", "all"])
  isActive?: "true" | "false" | "all";
}

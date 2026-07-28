import { IsBoolean } from "class-validator";

export class UpdateAdditionalServicePricingConfigurationStatusDto {
  @IsBoolean()
  isActive!: boolean;
}

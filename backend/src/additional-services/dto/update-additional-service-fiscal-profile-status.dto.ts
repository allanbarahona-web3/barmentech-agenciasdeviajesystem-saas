import { IsBoolean } from "class-validator";

export class UpdateAdditionalServiceFiscalProfileStatusDto {
  @IsBoolean()
  isActive!: boolean;
}

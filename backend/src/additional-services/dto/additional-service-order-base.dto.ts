import {
  IsEnum,
  IsOptional,
  IsString,
} from "class-validator";
import { AdditionalServiceOrderStatus } from "../enums";

export class AdditionalServiceOrderBaseDto {
  @IsString()
  orderNumber!: string;

  @IsOptional()
  @IsString()
  travelPackageId?: string;

  @IsOptional()
  @IsString()
  internalTripId?: string;

  @IsOptional()
  @IsEnum(AdditionalServiceOrderStatus)
  status?: AdditionalServiceOrderStatus;
}

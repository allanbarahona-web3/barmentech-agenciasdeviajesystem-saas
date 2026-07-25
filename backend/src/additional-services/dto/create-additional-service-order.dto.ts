import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { AdditionalServiceOrderLineBaseDto } from "./additional-service-order-line-base.dto";
import { AdditionalServiceOrderParticipantBaseDto } from "./additional-service-order-participant-base.dto";

export class CreateAdditionalServiceOrderLineDto extends AdditionalServiceOrderLineBaseDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdditionalServiceOrderParticipantBaseDto)
  participants!: AdditionalServiceOrderParticipantBaseDto[];
}

export class CreateAdditionalServiceOrderDto {
  @IsOptional()
  @IsString()
  travelPackageId?: string;

  @IsOptional()
  @IsString()
  internalTripId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateAdditionalServiceOrderLineDto)
  lines!: CreateAdditionalServiceOrderLineDto[];
}

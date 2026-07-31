import { Transform } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import {
  AdditionalServiceOrderStatus,
  AdditionalServiceTravelType,
} from "../enums";

export class ListAdditionalServiceOrdersDto {
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  travelId?: string;

  @IsOptional()
  @IsString()
  travelNumber?: string;

  @IsOptional()
  @IsEnum(AdditionalServiceTravelType)
  travelType?: AdditionalServiceTravelType;

  @IsOptional()
  @IsDateString({ strict: true })
  createdFrom?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  createdTo?: string;

  @IsOptional()
  @IsEnum(AdditionalServiceOrderStatus)
  status?: AdditionalServiceOrderStatus;
}

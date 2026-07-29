import { Type } from "class-transformer";
import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  AdditionalServiceCurrency,
  AdditionalServiceTravelType,
} from "../enums";

export class CreateAdditionalServiceOrderLineDto {
  @IsString()
  serviceCode!: string;

  @Type(() => Number)
  @IsInt()
  @Equals(1)
  serviceDetailsVersion!: 1;

  @IsObject()
  serviceDetails!: Record<string, unknown>;

  @IsString()
  supplierId!: string;

  @IsOptional()
  @IsUrl()
  supplierCostUrl?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  supplierCost!: number;

  @IsEnum(AdditionalServiceCurrency)
  supplierCostCurrency!: AdditionalServiceCurrency;

  @IsOptional()
  @IsString()
  commercialNotes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  participantIds!: string[];
}

export class CreateAdditionalServiceOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  idempotencyKey!: string;

  @IsString()
  travelId!: string;

  @IsEnum(AdditionalServiceTravelType)
  travelType!: AdditionalServiceTravelType;

  @IsEnum(AdditionalServiceCurrency)
  quotationCurrency!: AdditionalServiceCurrency;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateAdditionalServiceOrderLineDto)
  lines!: CreateAdditionalServiceOrderLineDto[];
}

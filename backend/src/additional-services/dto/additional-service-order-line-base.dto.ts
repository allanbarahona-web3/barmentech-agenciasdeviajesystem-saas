import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from "class-validator";
import {
  AdditionalServiceCurrency,
  AdditionalServiceMarginType,
  AdditionalServiceType,
} from "../enums";

export class AdditionalServiceOrderLineBaseDto {
  @IsEnum(AdditionalServiceType)
  serviceType!: AdditionalServiceType;

  @IsString()
  detail!: string;

  @IsString()
  notes!: string;

  @IsOptional()
  @IsDateString()
  serviceDate?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsEnum(AdditionalServiceCurrency)
  currency!: AdditionalServiceCurrency;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  exchangeRate!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salePrice!: number;

  @IsEnum(AdditionalServiceMarginType)
  marginType!: AdditionalServiceMarginType;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  marginValue!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxPercentage!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxAmount!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total!: number;

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsUrl()
  sourceUrl?: string;
}

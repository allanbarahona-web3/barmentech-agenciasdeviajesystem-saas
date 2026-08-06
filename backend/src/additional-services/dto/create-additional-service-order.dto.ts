import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsDateString,
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
  ValidateIf,
  ValidateNested,
} from "class-validator";
import {
  AdditionalServiceCurrency,
  AdditionalServiceTravelType,
  PaymentConditionType,
  PaymentTermUnit,
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

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  quoteCustomerId!: string;

  @IsEnum(AdditionalServiceTravelType)
  travelType!: AdditionalServiceTravelType;

  @IsEnum(AdditionalServiceCurrency)
  quotationCurrency!: AdditionalServiceCurrency;

  @IsOptional()
  @IsEnum(PaymentConditionType)
  paymentConditionType?: PaymentConditionType;

  @ValidateIf(
    (dto: CreateAdditionalServiceOrderDto) =>
      dto.paymentConditionType === PaymentConditionType.CREDIT ||
      dto.paymentTermValue !== undefined,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  paymentTermValue?: number;

  @ValidateIf(
    (dto: CreateAdditionalServiceOrderDto) =>
      dto.paymentConditionType === PaymentConditionType.CREDIT ||
      dto.paymentTermUnit !== undefined,
  )
  @IsEnum(PaymentTermUnit)
  paymentTermUnit?: PaymentTermUnit;

  @IsOptional()
  @IsDateString()
  quotationValidUntil?: string;

  @IsOptional()
  @IsString()
  commercialObservations?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateAdditionalServiceOrderLineDto)
  lines!: CreateAdditionalServiceOrderLineDto[];
}

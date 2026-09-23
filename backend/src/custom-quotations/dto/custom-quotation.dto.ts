import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { Currency, PaymentConditionType, PaymentTermUnit } from "@prisma/client";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
const supplied = (_object: unknown, value: unknown) => value !== undefined;

export class CreateCustomQuotationDto {
  @IsOptional() @Transform(trim) @IsString() @Matches(/\S/)
  leadId?: string;

  @IsOptional() @Transform(trim) @IsString() @Matches(/\S/)
  customerId?: string;

  @IsEnum(Currency)
  currency!: Currency;

  @Transform(trim) @IsString() @MaxLength(200) @Matches(/\S/)
  title!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000)
  commercialObservations?: string | null;

  @IsOptional() @IsDateString()
  quotationValidUntil?: string | null;

  @IsOptional() @IsEnum(PaymentConditionType)
  paymentConditionType?: PaymentConditionType | null;

  @ValidateIf((dto: CreateCustomQuotationDto) => dto.paymentConditionType === PaymentConditionType.CREDIT)
  @Type(() => Number) @IsInt() @Min(1)
  paymentTermValue?: number | null;

  @ValidateIf((dto: CreateCustomQuotationDto) => dto.paymentConditionType === PaymentConditionType.CREDIT)
  @IsEnum(PaymentTermUnit)
  paymentTermUnit?: PaymentTermUnit | null;

}

export class UpdateCustomQuotationDto {
  @ValidateIf(supplied) @Transform(trim) @IsString() @Matches(/\S/)
  leadId?: string;

  @ValidateIf(supplied) @Transform(trim) @IsString() @Matches(/\S/)
  customerId?: string;

  @ValidateIf(supplied) @IsEnum(Currency)
  currency?: Currency;

  @ValidateIf(supplied) @Transform(trim) @IsString() @MaxLength(200) @Matches(/\S/)
  title?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000)
  commercialObservations?: string | null;

  @IsOptional() @IsDateString()
  quotationValidUntil?: string | null;

  @IsOptional() @IsEnum(PaymentConditionType)
  paymentConditionType?: PaymentConditionType | null;

  @ValidateIf((dto: UpdateCustomQuotationDto) => dto.paymentConditionType === PaymentConditionType.CREDIT || dto.paymentTermValue !== undefined)
  @Type(() => Number) @IsInt() @Min(1)
  paymentTermValue?: number | null;

  @ValidateIf((dto: UpdateCustomQuotationDto) => dto.paymentConditionType === PaymentConditionType.CREDIT || dto.paymentTermUnit !== undefined)
  @IsEnum(PaymentTermUnit)
  paymentTermUnit?: PaymentTermUnit | null;

}

export class ListCustomQuotationsDto {
  @IsOptional() @IsIn(["DRAFT", "ISSUED", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"])
  status?: string;

  @IsOptional() @Transform(trim) @IsString() @Matches(/\S/)
  customerId?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(25)
  pageSize?: number;
}

export class CreateCustomQuotationLineDto {
  @Transform(trim) @IsString() @MaxLength(500) @Matches(/\S/)
  description!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000)
  commercialNote?: string | null;

  @IsOptional() @Transform(trim) @Matches(/^\d+(?:\.\d{1,4})?$/)
  quantity?: string;
}

export class UpdateCustomQuotationLineDto {
  @ValidateIf(supplied) @Transform(trim) @IsString() @MaxLength(500) @Matches(/\S/)
  description?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000)
  commercialNote?: string | null;

  @ValidateIf(supplied) @Transform(trim) @Matches(/^\d+(?:\.\d{1,4})?$/)
  quantity?: string;
}

export class ReorderCustomQuotationLinesDto {
  @IsArray() @Matches(/\S/, { each: true }) @IsString({ each: true })
  lineIds!: string[];
}

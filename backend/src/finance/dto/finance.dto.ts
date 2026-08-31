import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

const moneyText = /^\d+(?:\.\d+)?$/;

export class RegisterPaymentDto {
  @Transform(trim) @IsString() @MaxLength(200) @Matches(/\S/) registrationDeduplicationKey!: string;
  @Transform(trim) @IsString() @MaxLength(500) @Matches(/\S/) payerDisplayName!: string;
  @Transform(trim) @IsString() @Matches(/^[A-Za-z]{3}$/) currencyCode!: string;
  @Transform(trim) @IsString() @MaxLength(100) @Matches(moneyText) receivedAmount!: string;
  @IsDateString() receivedAt!: string;
  @Transform(trim) @IsString() @MaxLength(50) @Matches(/\S/) paymentMethod!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(191) @Matches(/\S/) customerId?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(4) @Matches(/\S/) payerIdentificationType?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) @Matches(/\S/) payerIdentificationNumber?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(150) @Matches(/\S/) externalReference?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) @Matches(/\S/) description?: string | null;
}

export class PaymentAllocationItemDto {
  @Transform(trim) @IsString() @MaxLength(191) @Matches(/\S/) accountReceivableId!: string;
  @Transform(trim) @IsString() @MaxLength(100) @Matches(moneyText) amount!: string;
  @Transform(trim) @IsString() @MaxLength(200) @Matches(/\S/) allocationDeduplicationKey!: string;
}

export class AllocatePaymentDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(25) @ValidateNested({ each: true }) @Type(() => PaymentAllocationItemDto)
  allocations!: PaymentAllocationItemDto[];
}

export class ReversePaymentAllocationDto {
  @Transform(trim) @IsString() @MaxLength(200) @Matches(/\S/) reversalDeduplicationKey!: string;
  @Transform(trim) @IsString() @MaxLength(500) @Matches(/\S/) reason!: string;
}

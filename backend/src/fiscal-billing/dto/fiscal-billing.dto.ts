import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { CR_DOCUMENT_TYPES } from "../fiscal-billing.constants";

export class ListEligibleSalesOrdersDto {
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class ManualInvoiceEmailResendDto {
  @IsOptional()
  @Transform(({ value }) => typeof value === "string" ? value.trim() || undefined : value)
  @IsEmail()
  @MaxLength(254)
  to?: string;

  @IsOptional()
  @Transform(({ value }) => Array.isArray(value) ? value.map((item) => typeof item === "string" ? item.trim() : item) : value)
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  cc?: string[];
}

export class CreateBillingDraftDto {
  @IsString()
  fiscalIssuerId!: string;

  @IsIn([
    CR_DOCUMENT_TYPES.ELECTRONIC_INVOICE,
    CR_DOCUMENT_TYPES.ELECTRONIC_TICKET,
  ])
  documentTypeCode!: string;

  @IsOptional()
  @IsIn(["01", "02", "03", "04"])
  receiverIdentificationTypeCode?: string;

  @IsOptional()
  @IsString()
  receiverIdentificationNumber?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsString({ each: true })
  paymentMethodCodes!: string[];

}

export class FiscalCreditNoteLineSelectionDto {
  @IsString()
  @MaxLength(191)
  sourceBillingDocumentLineId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  creditedQuantity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  creditedGrossAmount?: string;
}

export class CreateFiscalCreditNoteDraftDto {
  @IsString()
  @MaxLength(191)
  originalBillingDocumentId!: string;

  @IsString()
  @MaxLength(4)
  referenceReasonCode!: string;

  @IsString()
  @MaxLength(500)
  referenceReasonDescription!: string;

  @IsBoolean()
  fullDocument!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FiscalCreditNoteLineSelectionDto)
  lines?: FiscalCreditNoteLineSelectionDto[];
}

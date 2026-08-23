import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
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

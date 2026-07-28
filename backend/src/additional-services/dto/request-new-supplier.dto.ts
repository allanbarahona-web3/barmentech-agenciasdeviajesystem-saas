import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from "class-validator";

export class RequestNewSupplierDto {
  @IsString()
  @IsNotEmpty()
  supplierName!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  website?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsIn(["INTERNATIONAL", "INTERNAL"])
  travelType!: "INTERNATIONAL" | "INTERNAL";

  @IsString()
  @IsNotEmpty()
  additionalService!: string;

  @IsOptional()
  @IsString()
  orderId?: string;
}

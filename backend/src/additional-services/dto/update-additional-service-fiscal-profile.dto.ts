import { IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { Transform } from "class-transformer";

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class UpdateAdditionalServiceFiscalProfileDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  @Matches(/^\d{13}$/, { message: "cabysCode debe contener exactamente 13 dígitos." })
  cabysCode?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MaxLength(20)
  @Matches(/\S/, { message: "unitOfMeasureCode no puede estar vacío." })
  unitOfMeasureCode?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MaxLength(4)
  @Matches(/\S/, { message: "taxCode no puede estar vacío." })
  taxCode?: string | null;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MaxLength(4)
  @Matches(/\S/, { message: "taxRateCode no puede estar vacío." })
  taxRateCode?: string | null;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @Matches(/^\d{1,3}(?:\.\d{1,4})?$/, {
    message: "taxPercentage debe ser un decimal no negativo compatible con Decimal(7,4).",
  })
  taxPercentage?: string | null;
}

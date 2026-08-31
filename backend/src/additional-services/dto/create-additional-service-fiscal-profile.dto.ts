import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { Transform } from "class-transformer";

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class CreateAdditionalServiceFiscalProfileDto {
  @IsString()
  @Transform(trimString)
  @Matches(/\S/, { message: "additionalServiceCatalogId no puede estar vacío." })
  additionalServiceCatalogId!: string;

  @IsString()
  @Transform(trimString)
  @Matches(/^\d{13}$/, { message: "cabysCode debe contener exactamente 13 dígitos." })
  cabysCode!: string;

  @IsString()
  @Transform(trimString)
  @MaxLength(15)
  @Matches(/\S/, { message: "unitOfMeasureCode no puede estar vacío." })
  unitOfMeasureCode!: string;

  @IsString()
  @Transform(trimString)
  @Matches(/^\d{2}$/, { message: "taxCode debe contener exactamente 2 dígitos." })
  taxCode!: string;

  @IsString()
  @Transform(trimString)
  @Matches(/^\d{2}$/, { message: "taxRateCode debe contener exactamente 2 dígitos." })
  taxRateCode!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

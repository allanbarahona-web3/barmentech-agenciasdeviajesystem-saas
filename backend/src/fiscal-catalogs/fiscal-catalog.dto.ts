import { Transform, Type } from "class-transformer";
import { IsInt, IsString, Matches, Max, Min, MinLength } from "class-validator";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;

export class CabysSearchQueryDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  q!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  top: number = 20;
}

export class CabysCodeParamDto {
  @Transform(trim)
  @IsString()
  @Matches(/^\d{13}$/)
  code!: string;
}

export class ConfirmCabysDto extends CabysCodeParamDto {}

export class TaxCodeParamDto {
  @Transform(trim)
  @IsString()
  @Matches(/^\d{2}$/)
  taxCode!: string;
}

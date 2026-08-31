import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
const trimUppercase = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim().toUpperCase() : value;

export class TerritorialCountryParamDto {
  @Transform(trimUppercase)
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;
}

export class TerritorialSubdivisionQueryDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  parentFullCode?: string;
}

import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const present = (_object: unknown, value: unknown) => value !== undefined;

export class CreateFiscalIssuerDto {
  @Transform(trim) @IsString() @Matches(/\S/) displayName!: string;
  @Transform(trim) @IsString() @Matches(/\S/) legalName!: string;
  @Transform(trim) @IsString() @MaxLength(4) @Matches(/^\S{1,4}$/) identificationTypeCode!: string;
  @Transform(trim) @IsString() @MaxLength(30) @Matches(/\S/) identificationNumber!: string;
  @IsOptional() @Transform(trim) @IsString() @Matches(/\S/) commercialName?: string | null;
  @Transform(trim) @IsString() @Matches(/^[A-Z]{2}$/) countryCode!: string;
  @Transform(trim) @IsEmail() email!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(4) @Matches(/^\+?\d{1,4}$/) phoneCountryCode?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(20) @Matches(/\S/) phoneNumber?: string | null;
  @Transform(trim) @IsString() @Matches(/^(?:[1-7]|\d{2})$/) provinceCode!: string;
  @Transform(trim) @IsString() @Matches(/^\d{2}$/) cantonCode!: string;
  @Transform(trim) @IsString() @Matches(/^\d{2}$/) districtCode!: string;
  @IsOptional() @Transform(trim) @IsString() @Matches(/^\d{2}$/) neighborhoodCode?: string | null;
  @Transform(trim) @IsString() @Matches(/\S/) otherAddressDetails!: string;
  @IsOptional() @Transform(trim) @IsString() @Matches(/^[A-Z]{3}$/) defaultCurrencyCode?: string | null;
  @IsOptional() @Transform(trim) @IsString() @Matches(/^\d{3}$/) establishmentCode?: string | null;
  @IsOptional() @Transform(trim) @IsString() @Matches(/^\d{5}$/) terminalCode?: string | null;
}

export class UpdateFiscalIssuerDto {
  @ValidateIf(present) @Transform(trim) @IsString() @Matches(/\S/) displayName?: string;
  @ValidateIf(present) @Transform(trim) @IsString() @Matches(/\S/) legalName?: string;
  @ValidateIf(present) @Transform(trim) @IsString() @MaxLength(4) @Matches(/^\S{1,4}$/) identificationTypeCode?: string;
  @ValidateIf(present) @Transform(trim) @IsString() @MaxLength(30) @Matches(/\S/) identificationNumber?: string;
  @IsOptional() @Transform(trim) @IsString() @Matches(/\S/) commercialName?: string | null;
  @ValidateIf(present) @Transform(trim) @IsString() @Matches(/^[A-Z]{2}$/) countryCode?: string;
  @ValidateIf(present) @Transform(trim) @IsEmail() email?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(4) @Matches(/^\+?\d{1,4}$/) phoneCountryCode?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(20) @Matches(/\S/) phoneNumber?: string | null;
  @ValidateIf(present) @Transform(trim) @IsString() @Matches(/^(?:[1-7]|\d{2})$/) provinceCode?: string;
  @ValidateIf(present) @Transform(trim) @IsString() @Matches(/^\d{2}$/) cantonCode?: string;
  @ValidateIf(present) @Transform(trim) @IsString() @Matches(/^\d{2}$/) districtCode?: string;
  @IsOptional() @Transform(trim) @IsString() @Matches(/^\d{2}$/) neighborhoodCode?: string | null;
  @ValidateIf(present) @Transform(trim) @IsString() @Matches(/\S/) otherAddressDetails?: string;
  @IsOptional() @Transform(trim) @IsString() @Matches(/^[A-Z]{3}$/) defaultCurrencyCode?: string | null;
  @IsOptional() @Transform(trim) @IsString() @Matches(/^\d{3}$/) establishmentCode?: string | null;
  @IsOptional() @Transform(trim) @IsString() @Matches(/^\d{5}$/) terminalCode?: string | null;
}

export class UpdateFiscalIssuerStatusDto {
  @IsBoolean()
  isActive!: boolean;
}

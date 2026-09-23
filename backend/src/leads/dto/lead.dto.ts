import { Transform, Type } from "class-transformer";
import {
  IsEmail,
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

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toLowerCase() : value;
const present = (_object: unknown, value: unknown) => value !== undefined;

export class CreateLeadDto {
  @Transform(trim) @IsString() @MaxLength(200) @Matches(/\S/)
  fullName!: string;

  @Transform(normalizeEmail) @IsEmail() @MaxLength(320)
  email!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  phone?: string | null;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  companyName?: string | null;
}

export class UpdateLeadDto {
  @ValidateIf(present) @Transform(trim) @IsString() @MaxLength(200) @Matches(/\S/)
  fullName?: string;

  @ValidateIf(present) @Transform(normalizeEmail) @IsEmail() @MaxLength(320)
  email?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  phone?: string | null;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  companyName?: string | null;
}

export class ListLeadsDto {
  @IsOptional() @IsIn(["OPEN", "CONVERTED"])
  status?: "OPEN" | "CONVERTED";

  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(25)
  pageSize?: number;
}

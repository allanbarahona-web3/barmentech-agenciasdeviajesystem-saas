import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

const trimIdentifiers = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : item))
    : value;

const present = (_object: unknown, value: unknown) => value !== undefined;

export class CreatePassengerGroupDto {
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  additionalServiceCatalogId!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(160)
  @Matches(/\S/)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  color?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdatePassengerGroupDto {
  @ValidateIf(present)
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  @Matches(/\S/)
  additionalServiceCatalogId?: string;

  @ValidateIf(present)
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  @Matches(/\S/)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  color?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class PassengerGroupMembersDto {
  @Transform(trimIdentifiers)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @Matches(/\S/, { each: true })
  @MaxLength(191, { each: true })
  participantIds!: string[];
}

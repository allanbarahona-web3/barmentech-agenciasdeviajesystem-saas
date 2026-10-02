import { OperationalEvidenceType } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;

export class CreateOperationalEvidenceDto {
  @IsEnum(OperationalEvidenceType)
  evidenceType!: OperationalEvidenceType;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(191) @Matches(/\S/)
  operationalPurchaseId?: string;
}

export class ListOperationalEvidenceDto {
  @IsOptional() @IsEnum(OperationalEvidenceType)
  evidenceType?: OperationalEvidenceType;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(191) @Matches(/\S/)
  operationalPurchaseId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(25)
  pageSize?: number;
}

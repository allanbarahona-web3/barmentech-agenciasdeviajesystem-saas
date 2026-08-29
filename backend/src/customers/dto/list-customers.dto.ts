import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import type { ClientIdentificationType } from "../client-identification";

/**
 * ListCustomersDto
 * 
 * Query parameters for customer list endpoint.
 * Supports pagination and search.
 */
export class ListCustomersDto {
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  idType?: ClientIdentificationType;
}

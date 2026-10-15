import { IsEmail, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { Transform } from "class-transformer";
import type { ClientIdentificationType } from "../client-identification";

/**
 * UpdateCustomerDto
 * 
 * DTO for updating customer information.
 * All fields are optional to support partial updates (PATCH).
 * Only includes editable fields and never allows updating tenantId.
 * Identity fields are revalidated together by CustomersService.
 */
export class UpdateCustomerDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  fullName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  idType?: ClientIdentificationType;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  idNumber?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  maritalStatus?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  nationality?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  occupation?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  address?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  emergencyContactName?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  emergencyContactPhone?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "dateOfBirth debe tener el formato YYYY-MM-DD." })
  dateOfBirth?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    value === null || value === undefined
      ? value
      : typeof value === "string"
        ? value.trim() || null
        : value,
  )
  @IsString()
  @MaxLength(100)
  emergencyContactRelationship?: string | null;
}

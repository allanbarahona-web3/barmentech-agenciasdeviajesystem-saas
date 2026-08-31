import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";
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
}

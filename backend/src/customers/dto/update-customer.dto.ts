import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * UpdateCustomerDto
 * 
 * DTO for updating customer information.
 * All fields are optional to support partial updates (PATCH).
 * Only includes editable fields - does not allow updating idNumber or tenantId.
 */
export class UpdateCustomerDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  fullName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  idType?: string | null;

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

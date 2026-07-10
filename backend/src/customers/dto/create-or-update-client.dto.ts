import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * CreateOrUpdateClientDto
 * 
 * DTO for creating or updating a customer.
 * Uses neutral customer domain names (not prefixed with "client").
 * ContractsService maps its domain data into this DTO.
 */
export class CreateOrUpdateClientDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  idNumber!: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  idType?: string | null;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  emergencyContactName?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  emergencyContactPhone?: string | null;

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
  @MaxLength(50)
  maritalStatus?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  address?: string | null;

  @IsString()
  @IsNotEmpty()
  tenantId!: string;
}

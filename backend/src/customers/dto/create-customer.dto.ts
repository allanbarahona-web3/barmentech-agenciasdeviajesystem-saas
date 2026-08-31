import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import type { ClientIdentificationType } from "../client-identification";

/**
 * CreateCustomerDto
 * 
 * DTO for creating a new customer via direct API call.
 * Similar to CreateOrUpdateClientDto but without tenantId (comes from auth).
 */
export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  idNumber!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  idType!: ClientIdentificationType;

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
}

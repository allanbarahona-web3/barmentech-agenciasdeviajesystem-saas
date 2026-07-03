import { IsNotEmpty, IsString } from "class-validator";

/**
 * ValidateCustomerIdentityDto
 * 
 * DTO for validating customer identity before contract creation.
 * Used to check if an idNumber already exists and whether the fullName matches.
 */
export class ValidateCustomerIdentityDto {
  @IsNotEmpty({ message: "El número de identificación es requerido" })
  @IsString({ message: "El número de identificación debe ser texto" })
  idNumber!: string;

  @IsNotEmpty({ message: "El nombre completo es requerido" })
  @IsString({ message: "El nombre completo debe ser texto" })
  fullName!: string;
}

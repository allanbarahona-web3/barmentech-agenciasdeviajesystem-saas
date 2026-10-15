import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import type { ClientIdentificationType } from "../client-identification";

export class ResolveMinorCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  idType!: ClientIdentificationType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  idNumber!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "dateOfBirth debe tener el formato YYYY-MM-DD." })
  dateOfBirth?: string | null;
}

import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
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
  @IsDateString()
  dateOfBirth?: string;
}

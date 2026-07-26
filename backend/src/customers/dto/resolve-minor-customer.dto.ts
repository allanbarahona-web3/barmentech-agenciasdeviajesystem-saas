import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class ResolveMinorCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  idType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  idNumber!: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;
}

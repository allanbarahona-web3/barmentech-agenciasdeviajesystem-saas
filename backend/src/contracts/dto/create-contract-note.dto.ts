import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min } from 'class-validator';

export class CreateContractNoteDto {
  @IsEnum(['HOLDER', 'COMPANION', 'MINOR'])
  @IsNotEmpty()
  passengerType!: 'HOLDER' | 'COMPANION' | 'MINOR';

  @IsOptional()
  @IsInt()
  @Min(0)
  passengerIndex?: number | null;

  @IsString()
  @IsNotEmpty()
  passengerName!: string;

  @IsString()
  @IsNotEmpty()
  note!: string;
}

/**
 * DTO for creating a contract note from customer profile
 * Passenger identity is derived automatically from customer-contract participation
 */
export class CreateContractNoteForCustomerDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  note!: string;
}

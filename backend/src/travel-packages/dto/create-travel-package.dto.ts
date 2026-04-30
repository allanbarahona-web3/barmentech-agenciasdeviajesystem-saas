import { IsString, IsInt, IsDateString, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateTravelPackageDto {
  @IsString()
  name!: string;

  @IsString()
  destination!: string;

  @IsDateString()
  departureDate!: string;

  @IsDateString()
  returnDate!: string;

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  packagePrice?: number;

  @IsOptional()
  @IsEnum(['USD', 'CRC'], {
    message: 'priceCurrency must be USD or CRC',
  })
  priceCurrency?: string = 'USD';

  @IsOptional()
  @IsEnum(['OPEN', 'CLOSED', 'CANCELLED'], {
    message: 'status must be OPEN, CLOSED, or CANCELLED',
  })
  status?: string = 'OPEN';
}

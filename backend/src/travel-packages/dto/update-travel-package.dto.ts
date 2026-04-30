import { IsString, IsInt, IsDateString, IsEnum, IsNumber, Min, IsOptional } from 'class-validator';

export class UpdateTravelPackageDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsDateString()
  departureDate?: string;

  @IsOptional()
  @IsDateString()
  returnDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  packagePrice?: number;

  @IsOptional()
  @IsEnum(['USD', 'CRC'], {
    message: 'priceCurrency must be USD or CRC',
  })
  priceCurrency?: string;

  @IsOptional()
  @IsEnum(['OPEN', 'CLOSED', 'CANCELLED'], {
    message: 'status must be OPEN, CLOSED, or CANCELLED',
  })
  status?: string;
}

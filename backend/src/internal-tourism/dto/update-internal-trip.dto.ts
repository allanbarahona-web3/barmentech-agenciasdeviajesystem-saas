import { CreateInternalTripDto } from './create-internal-trip.dto';
import { IsString, IsOptional, IsDateString, IsInt, IsPositive, IsEnum, IsNumber } from 'class-validator';
import { TransportType } from '@prisma/client';

export class UpdateInternalTripDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  destination?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  departureDate?: string;

  @IsDateString()
  @IsOptional()
  returnDate?: string;

  @IsString()
  @IsOptional()
  departureTime?: string;

  @IsString()
  @IsOptional()
  returnTime?: string;

  @IsInt()
  @IsPositive()
  @IsOptional()
  capacity?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  currency?: string; // CRC, USD, etc.

  @IsNumber()
  @IsOptional()
  minReservation?: number; // Monto de reserva mínima (opcional)

  @IsEnum(TransportType)
  @IsOptional()
  transportType?: TransportType;

  @IsString()
  @IsOptional()
  itinerary?: string;

  @IsString()
  @IsOptional()
  status?: string; // OPEN | CLOSED | CANCELLED | COMPLETED
}

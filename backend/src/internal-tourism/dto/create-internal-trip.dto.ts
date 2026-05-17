import { TransportType } from '@prisma/client';
import { IsString, IsNotEmpty, IsDateString, IsInt, IsPositive, IsOptional, IsEnum, IsNumber } from 'class-validator';

export class CreateInternalTripDto {
  @IsString()
  @IsNotEmpty()
  name!: string; // "Viaje a Arenal"

  @IsString()
  @IsNotEmpty()
  destination!: string; // "La Fortuna, Arenal"

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsNotEmpty()
  departureDate!: string; // ISO 8601: "2026-05-25"

  @IsDateString()
  @IsNotEmpty()
  returnDate!: string; // ISO 8601: "2026-05-26"

  @IsString()
  @IsOptional()
  departureTime?: string; // "08:00"

  @IsString()
  @IsOptional()
  returnTime?: string; // "18:00"

  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  capacity!: number; // 20

  @IsNumber()
  @IsPositive()
  @IsNotEmpty()
  price!: number; // 45000

  @IsEnum(TransportType)
  @IsNotEmpty()
  transportType!: TransportType; // BUS | PRIVATE | etc.

  @IsString()
  @IsOptional()
  currency?: string; // CRC, MXN, USD, etc. (si no se proporciona, usa tenant.preferredCurrency)

  @IsString()
  @IsNotEmpty()
  itinerary!: string; // HTML o texto con actividades

  @IsString()
  @IsOptional()
  status?: string; // OPEN | CLOSED | CANCELLED | COMPLETED (default: OPEN)

  @IsNumber()
  @IsOptional()
  minReservation?: number; // Monto de reserva mínima (opcional)
}

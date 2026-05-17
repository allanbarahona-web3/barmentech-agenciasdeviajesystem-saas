import { IsString, IsNotEmpty, IsInt, IsPositive, IsOptional, IsUUID } from 'class-validator';

export class CreateInternalBookingDto {
  @IsUUID()
  @IsNotEmpty()
  internalTripId!: string; // UUID del viaje

  @IsUUID()
  @IsNotEmpty()
  clientId!: string; // UUID del cliente

  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  participantCount!: number; // 1, 2, 3, etc.

  @IsString()
  @IsOptional()
  notes?: string; // "Cliente pide ventanilla trasera"
}

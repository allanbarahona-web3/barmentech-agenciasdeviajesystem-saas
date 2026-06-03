import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class ArchiveContractDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  draftId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  contractNumber!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  clientFullName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  clientIdNumber!: string;

  @IsEmail()
  clientEmail!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  destination!: string;

  @IsString()
  @IsNotEmpty()
  payloadJson!: string;

  @IsOptional()
  @IsString()
  contractHtml?: string; // Opcional para viajes internos (no requieren PDF)

  @IsOptional()
  @IsString()
  @MaxLength(40)
  issuedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  source?: string; // SCHEDULED_TRIP | MIGRATION | CUSTOM_TRIP | QUOTE | INTERNAL_TRIP

  @IsOptional()
  @IsString()
  @MaxLength(40)
  internalTripId?: string; // Para viajes internos (sin contrato PDF)
}

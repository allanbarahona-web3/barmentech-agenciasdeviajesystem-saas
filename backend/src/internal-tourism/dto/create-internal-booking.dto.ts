import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { InternalTourBookingParticipantRole } from '../enums';

export class InternalTourBookingParticipantDto {
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsEnum(InternalTourBookingParticipantRole)
  role!: InternalTourBookingParticipantRole;
}

export class CreateInternalBookingDto {
  @IsString()
  @IsNotEmpty()
  internalTripId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InternalTourBookingParticipantDto)
  participants!: InternalTourBookingParticipantDto[];

  @IsString()
  @IsOptional()
  notes?: string; // "Cliente pide ventanilla trasera"
}

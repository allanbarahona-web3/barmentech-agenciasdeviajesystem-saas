import { IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ATTENDANCE_STATES } from '../constants/attendance-state.constant';

export class CorrectionEntryDto {
  @IsOptional()
  @IsIn(ATTENDANCE_STATES)
  type?: string;

  @IsOptional()
  @IsDateString()
  clockIn?: string;

  @IsOptional()
  @IsDateString()
  clockOut?: string;

  @IsString()
  @MinLength(10)
  reason!: string;
}

import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ATTENDANCE_STATES } from '../constants/attendance-state.constant';

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === true || value === false) {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return value;
};

const toNumber = ({ value }: { value: unknown }) => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }
  return value;
};

export class FilterEntriesDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(ATTENDANCE_STATES)
  type?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isOT?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  exceeded?: boolean;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  offset?: number;
}

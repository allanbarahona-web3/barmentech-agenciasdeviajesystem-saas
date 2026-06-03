import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

class AttendanceSystemHoursDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'systemStart must be in HH:mm format',
  })
  systemStart!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'systemEnd must be in HH:mm format',
  })
  systemEnd!: string;

  @IsString()
  timezone!: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  daysOfWeek?: number[];
}

export class ConfigAttendanceDto {
  @IsOptional()
  @IsBoolean()
  requireAttendanceForAgente?: boolean;

  @IsOptional()
  @IsBoolean()
  requireAttendanceForOperador?: boolean;

  @IsOptional()
  @IsBoolean()
  requireAttendanceForVendedor?: boolean;

  @IsOptional()
  @IsBoolean()
  requireAttendanceForAdmin?: boolean;

  @IsOptional()
  @IsBoolean()
  requireAttendanceForContador?: boolean;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  break1Duration?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(120)
  lunchDuration?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  break2Duration?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  break3Duration?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  regularHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  maxOtHours?: number;

  @IsOptional()
  @IsBoolean()
  otEnabled?: boolean;

  @IsOptional()
  @IsObject()
  systemHours?: AttendanceSystemHoursDto;
}

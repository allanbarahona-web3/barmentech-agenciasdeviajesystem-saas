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

export class ListPaginatedAdminEntriesDto {
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 50;

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
}

export class AttendanceAdminListItemDto {
  id!: string;
  type!: string;
  clockIn!: Date;
  clockOut!: Date | null;
  duration!: number | null;
  isOT!: boolean;
  correctionCount!: number;
  user!: {
    id: string;
    fullName: string;
  };
}

export class PaginatedAdminAttendanceEntriesResponseDto {
  items!: AttendanceAdminListItemDto[];
  total!: number;
  page!: number;
  pageSize!: number;
  totalPages!: number;
}

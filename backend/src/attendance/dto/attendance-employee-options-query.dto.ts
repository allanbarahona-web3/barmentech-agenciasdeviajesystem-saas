import { IsOptional, IsString } from 'class-validator';

export class AttendanceEmployeeOptionsQueryDto {
  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class AttendanceEmployeeOptionDto {
  userId!: string;
  fullName!: string;
}

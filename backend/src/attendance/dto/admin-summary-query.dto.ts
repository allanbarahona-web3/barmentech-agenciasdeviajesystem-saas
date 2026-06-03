import { IsDateString, IsOptional, IsString } from 'class-validator';

export class AdminSummaryQueryDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}

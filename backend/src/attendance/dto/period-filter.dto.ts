import { IsDateString } from 'class-validator';

export class PeriodFilterDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}

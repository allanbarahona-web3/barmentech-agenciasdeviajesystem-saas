import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ATTENDANCE_STATES } from '../constants/attendance-state.constant';

export class CheckInDto {
  @IsIn(ATTENDANCE_STATES)
  state!: string;

  @IsOptional()
  @IsBoolean()
  activateOT?: boolean;
}

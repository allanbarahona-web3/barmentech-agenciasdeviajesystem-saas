import { AttendanceState } from '../constants/attendance-state.constant';

export interface AttendanceStatus {
  currentState: AttendanceState | null;
  clockedInAt: Date | null;
  sessionDuration: number;
  paidSoFar: number;
  effectiveSoFar: number;
  isWithinSystemHours: boolean;
}

export interface DailySummary {
  date: Date;
  workingMin: number;
  meetingMin: number;
  otMin: number;
  break1Min: number;
  break2Min: number;
  break3Min: number;
  lunchMin: number;
  effectiveMin: number;
  paidMin: number;
  totalMin: number;
  excessBreaksMin: number;
  excessLunchMin: number;
  isComplete: boolean;
  hasOT: boolean;
}

export interface AttendanceEntryView {
  type: AttendanceState;
  clockIn: Date;
  clockOut: Date | null;
  duration: number | null;
  exceeded: boolean;
  excessMinutes: number | null;
  isOT: boolean;
}

export interface CheckInResponse {
  success: boolean;
  currentState: AttendanceState;
  message: string;
  paidHours: number;
  effectiveHours: number;
  warning?: 'break_exceeded' | 'lunch_exceeded' | 'ot_limit_reached';
}

export interface PeriodSummary {
  totalPaidHours: number;
  totalEffectiveHours: number;
  totalOtHours: number;
  avgEfficiency: number;
  workingDays: number;
}

export interface AttendanceActor {
  id: string;
  role: string;
  email: string;
  tenantId: string | null;
  fullName: string;
}

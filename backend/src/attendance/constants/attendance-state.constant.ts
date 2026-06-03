export const ATTENDANCE_STATES = [
  'WORKING',
  'MEETING',
  'BREAK1',
  'LUNCH',
  'BREAK2',
  'BREAK3',
  'OT',
  'OFF',
] as const;

export type AttendanceState = (typeof ATTENDANCE_STATES)[number];

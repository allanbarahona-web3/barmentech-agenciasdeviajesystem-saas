/**
 * Attendance Access Control - Single Source of Truth
 * 
 * Centralized permission logic for the Attendance system.
 * This ensures consistency across the frontend.
 */

/**
 * Operational roles that use the Attendance system.
 * These roles must clock in/out and have timesheets.
 */
const ATTENDANCE_OPERATIONAL_ROLES = [
  'AGENT',
  'OPERACIONES',
  'VENTAS',
  'FACTURACION_COBROS',
] as const;

/**
 * Check if a role requires the Attendance workflow.
 * 
 * Operational roles must:
 * - See the Attendance widget
 * - Receive the Start Shift modal
 * - Clock in and out
 * - Access My Timesheet
 * - Mark OFF before logout
 * 
 * @param role - The user's role (case-insensitive)
 * @returns true if the role uses Attendance
 */
export function usesAttendance(role: string | undefined | null): boolean {
  if (!role) return false;
  const normalized = role.toUpperCase();
  return ATTENDANCE_OPERATIONAL_ROLES.includes(normalized as any);
}

/**
 * Alias for usesAttendance - check if a role requires attendance.
 */
export const requiresAttendance = usesAttendance;

/**
 * Check if a role can view timesheets.
 * Operational roles can view their own timesheets.
 */
export const canViewTimesheet = usesAttendance;

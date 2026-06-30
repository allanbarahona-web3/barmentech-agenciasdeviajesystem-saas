/**
 * Attendance Access Control - Single Source of Truth
 * 
 * Centralized role definitions for the Attendance system.
 * This ensures consistency across all Attendance endpoints.
 */

/**
 * Operational roles that use the Attendance system.
 * These roles must clock in/out and have timesheets.
 */
export const ATTENDANCE_OPERATIONAL_ROLES = [
  'AGENT',
  'OPERACIONES',
  'VENTAS',
  'FACTURACION_COBROS',
] as const;

/**
 * Administrative roles that manage Attendance but don't clock in/out.
 */
export const ATTENDANCE_ADMIN_ROLES = [
  'ADMIN',
  'SUPER_ADMIN',
] as const;

/**
 * All roles that have access to Attendance endpoints (operational + admin).
 */
export const ATTENDANCE_ALL_ROLES = [
  ...ATTENDANCE_OPERATIONAL_ROLES,
  ...ATTENDANCE_ADMIN_ROLES,
] as const;

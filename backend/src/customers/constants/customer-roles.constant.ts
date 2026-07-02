/**
 * Customer Access Control - Single Source of Truth
 * 
 * Centralized role definitions for the Customer Profile system.
 * This ensures consistency across all Customer endpoints.
 */

/**
 * All roles that have access to Customer Profile endpoints.
 * 
 * ADMIN: Full administrative access
 * AGENT: Customer management and operations
 * FACTURACION_COBROS: Billing and collections access
 */
export const CUSTOMER_ACCESS_ROLES = [
  'ADMIN',
  'AGENT',
  'FACTURACION_COBROS',
] as const;

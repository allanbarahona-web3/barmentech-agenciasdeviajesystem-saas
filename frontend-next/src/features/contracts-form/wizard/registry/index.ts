/**
 * Wizard Registry - Public API
 * 
 * Exports step registry infrastructure for the Contracts Wizard.
 * This module provides the single source of truth for wizard step metadata.
 * 
 * Exported Types:
 * - WizardStepDefinition: Generic step definition interface
 * - WizardStepRegistry: Array type for step collections
 * 
 * Exported Constants:
 * - contractsStepRegistry: Complete registry of contract wizard steps
 * 
 * Exported Helpers:
 * - getStepById: Find step by unique ID
 * - getStepByOrder: Find step by order number
 * - getTotalSteps: Get total step count
 * - getVisibleSteps: Get visible steps (respecting conditional visibility)
 * 
 * Usage:
 * ```typescript
 * import { 
 *   contractsStepRegistry, 
 *   getStepById,
 *   type WizardStepDefinition 
 * } from '@/features/contracts-form/wizard/registry';
 * ```
 */

// Type exports
export type { WizardStepDefinition, WizardStepRegistry } from './types';

// Registry exports
export {
  contractsStepRegistry,
  getStepById,
  getStepByOrder,
  getTotalSteps,
  getVisibleSteps,
} from './contracts.registry';

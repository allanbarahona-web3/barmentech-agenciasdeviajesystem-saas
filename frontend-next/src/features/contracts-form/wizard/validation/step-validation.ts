/**
 * Step Validation Engine
 * 
 * Generic validation entry point for wizard steps.
 * Executes step-specific validation using existing business rules.
 */

import type { ContractFormState } from "@/features/contracts-form/types";

/**
 * Validation context for contracts wizard steps
 */
export type ContractsValidationContext = {
  state: ContractFormState;
  rangeMessage: string;
  itineraryMessage: string;
  isInternalTrip: boolean;
};

/**
 * Validation result
 */
export type ValidationResult = {
  valid: boolean;
  errorMessage?: string;
};

/**
 * Step-specific validation functions
 */
type StepValidator = (context: ContractsValidationContext) => ValidationResult;

/**
 * Validate travel step
 */
function validateTravelStep(context: ContractsValidationContext): ValidationResult {
  const { state, rangeMessage } = context;

  // Reuse existing date range validation
  if (rangeMessage) {
    return { valid: false, errorMessage: `Error: ${rangeMessage}` };
  }

  // Check required travel fields
  if (!state.contractNumber) {
    return { valid: false, errorMessage: "Error: Número de contrato requerido" };
  }

  if (!state.startDate || !state.endDate) {
    return { valid: false, errorMessage: "Error: Fechas de viaje requeridas" };
  }

  if (!state.destination) {
    return { valid: false, errorMessage: "Error: Destino requerido" };
  }

  return { valid: true };
}

/**
 * Validate holder step
 */
function validateHolderStep(context: ContractsValidationContext): ValidationResult {
  const { state } = context;

  // Check required holder fields
  if (!state.clientFullName.trim()) {
    return { valid: false, errorMessage: "Error: Nombre del cliente requerido" };
  }

  if (!state.clientIdNumber.trim()) {
    return { valid: false, errorMessage: "Error: Número de identificación requerido" };
  }

  if (!state.clientEmail.trim()) {
    return { valid: false, errorMessage: "Error: Correo del cliente requerido" };
  }

  return { valid: true };
}

/**
 * Validate itinerary step
 */
function validateItineraryStep(context: ContractsValidationContext): ValidationResult {
  const { itineraryMessage, isInternalTrip } = context;

  // Reuse existing itinerary validation (international trips only)
  if (!isInternalTrip && itineraryMessage) {
    return { valid: false, errorMessage: `Error: ${itineraryMessage}` };
  }

  return { valid: true };
}

/**
 * Registry of step validators
 */
const stepValidators: Record<string, StepValidator> = {
  travel: validateTravelStep,
  holder: validateHolderStep,
  itinerary: validateItineraryStep,
  // Other steps: companions, minors, documents, summary - no blocking validation
};

/**
 * Validate a wizard step
 * 
 * Generic entry point for step validation.
 * Executes step-specific validation using the validation registry.
 * 
 * @param stepId - The step ID to validate
 * @param context - Validation context containing state and derived values
 * @returns Validation result with success status and optional error message
 */
export function validateStep(
  stepId: string,
  context: ContractsValidationContext
): ValidationResult {
  const validator = stepValidators[stepId];

  // If no validator registered, step is valid by default
  if (!validator) {
    return { valid: true };
  }

  return validator(context);
}

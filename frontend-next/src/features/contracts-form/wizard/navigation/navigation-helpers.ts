import type { WizardStepRegistry, WizardStepDefinition } from '../registry/types';

/**
 * Navigation Helpers
 * 
 * Generic, reusable navigation utilities for wizard step management.
 * These helpers work with any WizardStepRegistry, making them reusable
 * across different wizard types (Contracts, Operations, Internal Tourism).
 * 
 * All navigation decisions are driven by the registry order property.
 * No hardcoded step knowledge exists in these helpers.
 */

/**
 * Get the first step in the registry
 * 
 * @param registry - The wizard step registry
 * @returns The first step definition
 */
export function getFirstStep(registry: WizardStepRegistry): WizardStepDefinition {
  const sorted = [...registry].sort((a, b) => a.order - b.order);
  return sorted[0];
}

/**
 * Get the last step in the registry
 * 
 * @param registry - The wizard step registry
 * @returns The last step definition
 */
export function getLastStep(registry: WizardStepRegistry): WizardStepDefinition {
  const sorted = [...registry].sort((a, b) => a.order - b.order);
  return sorted[sorted.length - 1];
}

/**
 * Get the next step after the current step
 * 
 * @param registry - The wizard step registry
 * @param currentStepId - The current step ID
 * @returns The next step definition, or null if at the last step
 */
export function getNextStep(
  registry: WizardStepRegistry,
  currentStepId: string
): WizardStepDefinition | null {
  const currentStep = registry.find(step => step.id === currentStepId);
  if (!currentStep) return null;

  const sorted = [...registry].sort((a, b) => a.order - b.order);
  const currentIndex = sorted.findIndex(step => step.id === currentStepId);
  
  if (currentIndex === -1 || currentIndex === sorted.length - 1) {
    return null;
  }

  return sorted[currentIndex + 1];
}

/**
 * Get the previous step before the current step
 * 
 * @param registry - The wizard step registry
 * @param currentStepId - The current step ID
 * @returns The previous step definition, or null if at the first step
 */
export function getPreviousStep(
  registry: WizardStepRegistry,
  currentStepId: string
): WizardStepDefinition | null {
  const currentStep = registry.find(step => step.id === currentStepId);
  if (!currentStep) return null;

  const sorted = [...registry].sort((a, b) => a.order - b.order);
  const currentIndex = sorted.findIndex(step => step.id === currentStepId);
  
  if (currentIndex === -1 || currentIndex === 0) {
    return null;
  }

  return sorted[currentIndex - 1];
}

/**
 * Check if navigation to next step is possible
 * 
 * @param registry - The wizard step registry
 * @param currentStepId - The current step ID
 * @returns true if next navigation is possible, false otherwise
 */
export function canGoNext(
  registry: WizardStepRegistry,
  currentStepId: string
): boolean {
  return getNextStep(registry, currentStepId) !== null;
}

/**
 * Check if navigation to previous step is possible
 * 
 * @param registry - The wizard step registry
 * @param currentStepId - The current step ID
 * @returns true if previous navigation is possible, false otherwise
 */
export function canGoPrevious(
  registry: WizardStepRegistry,
  currentStepId: string
): boolean {
  return getPreviousStep(registry, currentStepId) !== null;
}

/**
 * Check if the current step is the first step
 * 
 * @param registry - The wizard step registry
 * @param currentStepId - The current step ID
 * @returns true if current step is first, false otherwise
 */
export function isFirstStep(
  registry: WizardStepRegistry,
  currentStepId: string
): boolean {
  const firstStep = getFirstStep(registry);
  return firstStep.id === currentStepId;
}

/**
 * Check if the current step is the last step
 * 
 * @param registry - The wizard step registry
 * @param currentStepId - The current step ID
 * @returns true if current step is last, false otherwise
 */
export function isLastStep(
  registry: WizardStepRegistry,
  currentStepId: string
): boolean {
  const lastStep = getLastStep(registry);
  return lastStep.id === currentStepId;
}

/**
 * Get step definition by ID
 * 
 * @param registry - The wizard step registry
 * @param stepId - The step ID to find
 * @returns The step definition or null if not found
 */
export function getStepById(
  registry: WizardStepRegistry,
  stepId: string
): WizardStepDefinition | null {
  return registry.find(step => step.id === stepId) || null;
}

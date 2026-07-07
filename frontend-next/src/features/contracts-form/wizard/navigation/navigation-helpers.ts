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
 * 
 * Conditional Visibility Support:
 * Navigation helpers now support filtering steps by visibility.
 * When context is provided, only visible steps are considered for navigation.
 */

/**
 * Filter registry to only visible steps
 * 
 * @param registry - The wizard step registry
 * @param context - Props/context to evaluate visibility
 * @returns Array of visible steps
 */
export function getVisibleSteps<T = any>(
  registry: WizardStepRegistry<T>,
  context: T
): WizardStepRegistry<T> {
  return registry.filter(step => {
    if (!step.isVisible) return true;
    return step.isVisible(context);
  });
}

/**
 * Get the first step in the registry
 * 
 * @param registry - The wizard step registry
 * @param context - Optional context to filter by visibility
 * @returns The first step definition
 */
export function getFirstStep<T = any>(
  registry: WizardStepRegistry<T>,
  context?: T
): WizardStepDefinition<T> {
  const steps = context ? getVisibleSteps(registry, context) : registry;
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  return sorted[0];
}

/**
 * Get the last step in the registry
 * 
 * @param registry - The wizard step registry
 * @param context - Optional context to filter by visibility
 * @returns The last step definition
 */
export function getLastStep<T = any>(
  registry: WizardStepRegistry<T>,
  context?: T
): WizardStepDefinition<T> {
  const steps = context ? getVisibleSteps(registry, context) : registry;
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  return sorted[sorted.length - 1];
}

/**
 * Get the next step after the current step
 * 
 * @param registry - The wizard step registry
 * @param currentStepId - The current step ID
 * @param context - Optional context to filter by visibility
 * @returns The next step definition, or null if at the last step
 */
export function getNextStep<T = any>(
  registry: WizardStepRegistry<T>,
  currentStepId: string,
  context?: T
): WizardStepDefinition<T> | null {
  const steps = context ? getVisibleSteps(registry, context) : registry;
  const currentStep = steps.find(step => step.id === currentStepId);
  if (!currentStep) return null;

  const sorted = [...steps].sort((a, b) => a.order - b.order);
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
 * @param context - Optional context to filter by visibility
 * @returns The previous step definition, or null if at the first step
 */
export function getPreviousStep<T = any>(
  registry: WizardStepRegistry<T>,
  currentStepId: string,
  context?: T
): WizardStepDefinition<T> | null {
  const steps = context ? getVisibleSteps(registry, context) : registry;
  const currentStep = steps.find(step => step.id === currentStepId);
  if (!currentStep) return null;

  const sorted = [...steps].sort((a, b) => a.order - b.order);
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
 * @param context - Optional context to filter by visibility
 * @returns true if next navigation is possible, false otherwise
 */
export function canGoNext<T = any>(
  registry: WizardStepRegistry<T>,
  currentStepId: string,
  context?: T
): boolean {
  return getNextStep(registry, currentStepId, context) !== null;
}

/**
 * Check if navigation to previous step is possible
 * 
 * @param registry - The wizard step registry
 * @param currentStepId - The current step ID
 * @param context - Optional context to filter by visibility
 * @returns true if previous navigation is possible, false otherwise
 */
export function canGoPrevious<T = any>(
  registry: WizardStepRegistry<T>,
  currentStepId: string,
  context?: T
): boolean {
  return getPreviousStep(registry, currentStepId, context) !== null;
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

import type { WizardStepDefinition, WizardStepRegistry } from './types';

// Step Components
import { TravelStep, type TravelStepProps } from '../steps/travel/TravelStep';
import { CustomerLookupStep, type CustomerLookupStepProps } from '../steps/CustomerLookupStep';
import { HolderStep, type HolderStepProps } from '../steps/holder/HolderStep';
import { CompanionsStep, type CompanionsStepProps } from '../steps/companions/CompanionsStep';
import { MinorsStep, type MinorsStepProps } from '../steps/minors/MinorsStep';
import { ItineraryStep, type ItineraryStepProps } from '../steps/itinerary/ItineraryStep';
import { DocumentsStep, type DocumentsStepProps } from '../steps/documents/DocumentsStep';
import { InsuranceStep, type InsuranceStepProps } from '../steps/insurance/InsuranceStep';
import { SummaryStep, type SummaryStepProps } from '../steps/summary/SummaryStep';

/**
 * Contracts Wizard Step Registry
 * 
 * Single source of truth for all contract wizard steps.
 * Defines step order, titles, components, and conditional behavior.
 * 
 * This registry is infrastructure only and does not yet control wizard navigation.
 * Future stories will integrate this registry into the wizard navigation system.
 * 
 * Architecture:
 * - Each step has a unique ID (used for routing, tracking, analytics)
 * - Order determines the sequence in the wizard flow
 * - Title is displayed in navigation UI, breadcrumbs, progress indicators
 * - Component is the React component to render for the step
 * - validate, isVisible, isOptional are functions (not booleans) for future extensibility
 * 
 * Current Implementation:
 * - All steps are visible (no conditional visibility yet)
 * - All steps are required (no optional steps yet)
 * - No validation functions (validation remains in ContractsWizard for now)
 * 
 * Future Extensions:
 * - Conditional visibility (e.g., hide Companions step if no companions)
 * - Optional steps (e.g., Minors step optional if no minors)
 * - Step-level validation (move validation logic from wizard to step definitions)
 * - Dynamic step injection (e.g., add custom steps based on package type)
 */

/**
 * Step 1: Travel Information
 * 
 * Captures core contract details:
 * - Destination
 * - Travel dates (start/end)
 * - Financial details (total amount, reservation, installments)
 * - Migration mode flag
 * - Internal trip metadata
 */
const travelStep: WizardStepDefinition<TravelStepProps> = {
  id: 'travel',
  title: 'Viaje',
  order: 1,
  component: TravelStep,
  validate: () => true, // Future: Add validation logic
  isVisible: () => true, // Always visible
  isOptional: () => false, // Always required
};

/**
 * Step 2: Customer Lookup
 * 
 * Searches for existing customers or creates new ones:
 * - Customer search by name/ID
 * - Create new customer
 * - Pre-fill holder information from selected customer
 * - Skip if creating customer for first time
 * 
 * Structural placeholder - functionality to be implemented in next story.
 */
const customerLookupStep: WizardStepDefinition<CustomerLookupStepProps> = {
  id: 'customer-lookup',
  title: 'Buscar Cliente',
  order: 2,
  component: CustomerLookupStep,
  validate: () => true, // Future: Add validation logic
  isVisible: () => true, // Always visible
  isOptional: () => false, // Always required
};

/**
 * Step 3: Holder Information
 * 
 * Captures customer/contract holder details:
 * - Personal information (name, ID, email, phone, address)
 * - Emergency contact
 * - Civil status, profession, nationality
 * - Document uploads (ID front/back, passport)
 * - Identity validation
 */
const holderStep: WizardStepDefinition<HolderStepProps> = {
  id: 'holder',
  title: 'Titular',
  order: 3,
  component: HolderStep,
  validate: () => true, // Future: Add validation logic
  isVisible: () => true, // Always visible
  isOptional: () => false, // Always required
};

/**
 * Step 4: Companions Information
 * 
 * Captures adult companion details:
 * - Dynamic list of companions
 * - Personal information per companion
 * - Emergency contacts per companion
 * - Document uploads per companion
 * 
 * Future: Could be conditional (visible only if companions exist)
 */
const companionsStep: WizardStepDefinition<CompanionsStepProps> = {
  id: 'companions',
  title: 'Acompañantes',
  order: 4,
  component: CompanionsStep,
  validate: () => true, // Future: Add validation logic
  isVisible: () => true, // Future: Conditional visibility based on companion count
  isOptional: () => false, // Future: Could be optional if no companions
};

/**
 * Step 5: Minors Information
 * 
 * Captures minor (under 18) companion details:
 * - Dynamic list of minors
 * - Personal information per minor
 * - Guardian information
 * - Responsible adult assignments
 * - Document uploads per minor
 * 
 * Conditional visibility: Only shown when hasMinorCompanion is true
 */
const minorsStep: WizardStepDefinition<MinorsStepProps> = {
  id: 'minors',
  title: 'Menores',
  order: 5,
  component: MinorsStep,
  validate: () => true,
  isVisible: (props) => props.state.hasMinorCompanion, // Conditional: only show if minors are traveling
  isOptional: () => false,
};

/**
 * Step 6: Itinerary Information
 * 
 * Captures trip itinerary details:
 * - Package itinerary (if from scheduled trip)
 * - Custom itinerary items (date + detail)
 * - Date validation
 * - Activity descriptions
 */
const itineraryStep: WizardStepDefinition<ItineraryStepProps> = {
  id: 'itinerary',
  title: 'Itinerario',
  order: 6,
  component: ItineraryStep,
  validate: () => true, // Future: Add validation logic
  isVisible: () => true, // Always visible
  isOptional: () => false, // Always required
};

/**
 * Step 7: Documents Upload
 * 
 * Captures supporting documentation:
 * - Reservation proof (for internal trips)
 * - Support documents (general attachments)
 * - File validation and management
 * 
 * Future: Could be conditional (reservation proof only for internal trips)
 */
const documentsStep: WizardStepDefinition<DocumentsStepProps> = {
  id: 'documents',
  title: 'Documentos',
  order: 7,
  component: DocumentsStep,
  validate: () => true, // Future: Add validation logic
  isVisible: () => true, // Always visible
  isOptional: () => false, // Always required
};

/**
 * Step 8: Insurance Decision
 * 
 * Captures the traveler's decision regarding travel insurance:
 * - Simple yes/no choice
 * - Stored as part of contract payload
 * - No document generation (future story)
 * - No waiver generation (future story)
 * 
 * Always visible and required
 */
const insuranceStep: WizardStepDefinition<InsuranceStepProps> = {
  id: 'insurance',
  title: 'Seguro',
  order: 8,
  component: InsuranceStep,
  validate: () => true, // Future: Add validation logic
  isVisible: () => true, // Always visible
  isOptional: () => false, // Always required
};

/**
 * Step 9: Summary and Submission
 * 
 * Final review and submission:
 * - Contract summary display
 * - Preview panel (HTML preview)
 * - Signing link management
 * - Draft save functionality
 * - Final archival submission
 * 
 * Always visible and required (final step)
 */
const summaryStep: WizardStepDefinition<SummaryStepProps> = {
  id: 'summary',
  title: 'Resumen',
  order: 9,
  component: SummaryStep,
  validate: () => true, // Future: Add validation logic
  isVisible: () => true, // Always visible
  isOptional: () => false, // Always required (final step)
};

/**
 * Complete Contracts Wizard Step Registry
 * 
 * Ordered array of all step definitions for the contracts wizard.
 * This is the single source of truth for:
 * - Step sequence
 * - Step metadata (titles, IDs)
 * - Step components
 * - Step behavior (visibility, validation, optional)
 * 
 * Usage:
 * ```typescript
 * import { contractsStepRegistry } from '@/features/contracts-form/wizard/registry';
 * 
 * // Iterate through steps
 * contractsStepRegistry.forEach(step => {
 *   console.log(step.title, step.order);
 * });
 * 
 * // Find a specific step
 * const holderStep = contractsStepRegistry.find(s => s.id === 'holder');
 * 
 * // Render steps dynamically
 * const CurrentStep = contractsStepRegistry[currentStepIndex].component;
 * ```
 */
export const contractsStepRegistry: WizardStepRegistry = [
  travelStep,
  customerLookupStep,
  holderStep,
  companionsStep,
  minorsStep,
  itineraryStep,
  documentsStep,
  insuranceStep,
  summaryStep,
];

/**
 * Helper: Get step by ID
 * 
 * @param stepId - The unique step identifier
 * @returns The step definition or undefined if not found
 */
export function getStepById(stepId: string): WizardStepDefinition | undefined {
  return contractsStepRegistry.find(step => step.id === stepId);
}

/**
 * Helper: Get step by order
 * 
 * @param order - The step order (1-indexed)
 * @returns The step definition or undefined if not found
 */
export function getStepByOrder(order: number): WizardStepDefinition | undefined {
  return contractsStepRegistry.find(step => step.order === order);
}

/**
 * Helper: Get total step count
 * 
 * @returns The total number of steps in the registry
 */
export function getTotalSteps(): number {
  return contractsStepRegistry.length;
}

/**
 * Helper: Get visible steps (respecting isVisible function)
 * 
 * @param props - Props to pass to isVisible functions
 * @returns Array of visible step definitions
 * 
 * Note: Currently all steps are visible. This will become useful
 * when conditional visibility is implemented in future stories.
 */
export function getVisibleSteps(props?: any): WizardStepDefinition[] {
  return contractsStepRegistry.filter(step => {
    const isVisibleFn = step.isVisible || (() => true);
    return isVisibleFn(props);
  });
}

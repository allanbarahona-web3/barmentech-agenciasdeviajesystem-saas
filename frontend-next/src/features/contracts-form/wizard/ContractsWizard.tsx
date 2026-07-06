import { ContractsForm } from "@/features/contracts-form/ContractsForm";

/**
 * Contracts Wizard Props
 * 
 * Same interface as ContractsForm to ensure backward compatibility.
 */
export type ContractsWizardProps = {
  agent?: {
    id: string;
    email: string;
    fullName: string;
    role?: string;
  } | null;
  initialDraftId?: string | null;
  initialTravelPackageId?: string | null;
  initialInternalTripId?: string | null;
  mode?: string;
};

/**
 * Contracts Wizard - Root Entry Point
 * 
 * This is the new orchestration layer for contract creation.
 * 
 * **Current Implementation (Story 5):**
 * - Acts as a simple container
 * - Renders the existing ContractsForm
 * - No state migration yet
 * - No new functionality
 * 
 * **Future Implementation:**
 * - Will manage wizard navigation
 * - Will render individual steps (Travel, Holder, Companions, etc.)
 * - Will orchestrate state transitions
 * - ContractsForm will be gradually phased out
 * 
 * @param props - Same props as ContractsForm for backward compatibility
 * @returns Wizard container wrapping ContractsForm
 */
export function ContractsWizard(props: ContractsWizardProps) {
  // For now, simply render the existing ContractsForm
  // Future stories will replace this with wizard steps and navigation
  return <ContractsForm {...props} />;
}

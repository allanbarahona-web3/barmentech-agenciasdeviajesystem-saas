import { createContext, Dispatch } from 'react';
import type { ContractFormState, Companion, Minor } from '@/features/contracts-form/types';
import type { WizardAction } from './wizard-reducer';

/**
 * Wizard Context Type
 * 
 * Provides contract state management and helper functions.
 * Designed for reuse across multiple wizard types (Contracts, Operations, Internal Tourism).
 */
export interface WizardContextType {
  // Core state
  state: ContractFormState;
  
  // Low-level dispatch (for advanced use cases)
  dispatch: Dispatch<WizardAction>;
  
  // High-level helper functions (preferred API)
  updateField: (field: keyof ContractFormState, value: any) => void;
  updateFieldWithCalculations: (field: keyof ContractFormState, value: any) => void;
  updateTourDate: (side: 'start' | 'end', value: string) => void;
  setContractState: (state: ContractFormState) => void;
  
  // Companion operations
  addCompanion: () => void;
  removeCompanion: (id: string) => void;
  updateCompanion: (id: string, field: keyof Companion, value: string) => void;
  
  // Minor operations
  addMinor: () => void;
  removeMinor: (id: string) => void;
  updateMinor: (id: string, field: keyof Minor, value: string) => void;
  
  // Itinerary operations
  addItineraryItem: () => void;
  removeItineraryItem: (id: string) => void;
  updateItineraryItem: (id: string, field: 'date' | 'detail', value: string) => void;
}

/**
 * Wizard Context
 * 
 * Context infrastructure for the Contracts Wizard.
 * Provides contract state and operations to consuming components.
 */
export const WizardContext = createContext<WizardContextType | undefined>(
  undefined
);

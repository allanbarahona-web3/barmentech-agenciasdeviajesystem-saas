import type { ContractFormState, IdType, Companion, Minor } from '@/features/contracts-form/types';
import {
  applyMoneyDerivedValues,
  syncTourDates,
  addCompanion as addCompanionUtil,
  removeCompanion as removeCompanionUtil,
  updateCompanion as updateCompanionUtil,
  addMinor as addMinorUtil,
  removeMinor as removeMinorUtil,
  updateMinor as updateMinorUtil,
  addCustomItineraryItem,
  removeCustomItineraryItem,
  updateItineraryItem as updateItineraryItemUtil,
} from '@/features/contracts-form/utils';

/**
 * Wizard State
 * 
 * Wraps the contract form state for the wizard.
 */
export interface WizardState {
  contract: ContractFormState;
}

/**
 * Wizard Action Types
 * 
 * All actions that can modify the wizard state.
 * Reuses existing utilities from utils.ts - no logic duplication.
 */
export type WizardAction =
  // Full state replacement (for loading drafts)
  | { type: 'SET_CONTRACT_STATE'; payload: ContractFormState }
  // Simple field updates
  | { type: 'UPDATE_FIELD'; payload: { field: keyof ContractFormState; value: any } }
  // Field updates with derived calculations
  | { type: 'UPDATE_FIELD_WITH_CALCULATIONS'; payload: { field: keyof ContractFormState; value: any } }
  // Tour date synchronization
  | { type: 'UPDATE_TOUR_DATE'; payload: { side: 'start' | 'end'; value: string } }
  // Companion operations
  | { type: 'ADD_COMPANION' }
  | { type: 'REMOVE_COMPANION'; payload: { id: string } }
  | { type: 'UPDATE_COMPANION'; payload: { id: string; field: keyof Companion; value: string } }
  // Minor operations
  | { type: 'ADD_MINOR' }
  | { type: 'REMOVE_MINOR'; payload: { id: string } }
  | { type: 'UPDATE_MINOR'; payload: { id: string; field: keyof Minor; value: string } }
  // Itinerary operations
  | { type: 'ADD_ITINERARY_ITEM' }
  | { type: 'REMOVE_ITINERARY_ITEM'; payload: { id: string } }
  | { type: 'UPDATE_ITINERARY_ITEM'; payload: { id: string; field: 'date' | 'detail'; value: string } };

/**
 * Create Initial Wizard State
 * 
 * @param contract - Initial contract form state
 * @returns Initial wizard state
 */
export function createInitialWizardState(contract: ContractFormState): WizardState {
  return {
    contract,
  };
}

/**
 * Wizard Reducer
 * 
 * Manages contract state transitions.
 * Delegates to existing utility functions - no business logic duplication.
 * 
 * @param state - Current wizard state
 * @param action - Action to process
 * @returns Updated wizard state
 */
export function wizardReducer(
  state: WizardState,
  action: WizardAction
): WizardState {
  switch (action.type) {
    case 'SET_CONTRACT_STATE':
      return {
        ...state,
        contract: action.payload,
      };

    case 'UPDATE_FIELD':
      return {
        ...state,
        contract: {
          ...state.contract,
          [action.payload.field]: action.payload.value,
        },
      };

    case 'UPDATE_FIELD_WITH_CALCULATIONS':
      return {
        ...state,
        contract: applyMoneyDerivedValues({
          ...state.contract,
          [action.payload.field]: action.payload.value,
        }),
      };

    case 'UPDATE_TOUR_DATE':
      return {
        ...state,
        contract: applyMoneyDerivedValues(
          syncTourDates(state.contract, action.payload.side, action.payload.value)
        ),
      };

    case 'ADD_COMPANION':
      return {
        ...state,
        contract: addCompanionUtil(state.contract),
      };

    case 'REMOVE_COMPANION':
      return {
        ...state,
        contract: removeCompanionUtil(state.contract, action.payload.id),
      };

    case 'UPDATE_COMPANION':
      return {
        ...state,
        contract: updateCompanionUtil(
          state.contract,
          action.payload.id,
          action.payload.field,
          action.payload.value
        ),
      };

    case 'ADD_MINOR':
      return {
        ...state,
        contract: addMinorUtil(state.contract),
      };

    case 'REMOVE_MINOR':
      return {
        ...state,
        contract: removeMinorUtil(state.contract, action.payload.id),
      };

    case 'UPDATE_MINOR':
      return {
        ...state,
        contract: updateMinorUtil(
          state.contract,
          action.payload.id,
          action.payload.field,
          action.payload.value
        ),
      };

    case 'ADD_ITINERARY_ITEM':
      return {
        ...state,
        contract: addCustomItineraryItem(state.contract),
      };

    case 'REMOVE_ITINERARY_ITEM':
      return {
        ...state,
        contract: removeCustomItineraryItem(state.contract, action.payload.id),
      };

    case 'UPDATE_ITINERARY_ITEM':
      return {
        ...state,
        contract: updateItineraryItemUtil(
          state.contract,
          action.payload.id,
          action.payload.field,
          action.payload.value
        ),
      };

    default:
      return state;
  }
}

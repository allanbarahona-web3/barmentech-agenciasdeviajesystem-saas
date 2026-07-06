import { ReactNode, useReducer, useMemo, useCallback } from 'react';
import type { ContractFormState, Companion, Minor } from '@/features/contracts-form/types';
import { WizardContext } from './WizardContext';
import { wizardReducer, createInitialWizardState } from './wizard-reducer';

/**
 * Wizard Provider Props
 */
interface WizardProviderProps {
  children: ReactNode;
  initialState: ContractFormState;
}

/**
 * Wizard Provider
 * 
 * Provides wizard context to child components.
 * Manages contract state using a reducer pattern.
 * 
 * Delegates all business logic to existing utilities - no duplication.
 * Helper functions provide a clean, stable API for consumers.
 * 
 * @param props - Provider props
 * @returns Provider component
 */
export function WizardProvider({ children, initialState }: WizardProviderProps) {
  const [wizardState, dispatch] = useReducer(
    wizardReducer,
    createInitialWizardState(initialState)
  );

  // Helper functions - memoized for stable references
  const updateField = useCallback((field: keyof ContractFormState, value: any) => {
    dispatch({ type: 'UPDATE_FIELD', payload: { field, value } });
  }, []);

  const updateFieldWithCalculations = useCallback((field: keyof ContractFormState, value: any) => {
    dispatch({ type: 'UPDATE_FIELD_WITH_CALCULATIONS', payload: { field, value } });
  }, []);

  const updateTourDate = useCallback((side: 'start' | 'end', value: string) => {
    dispatch({ type: 'UPDATE_TOUR_DATE', payload: { side, value } });
  }, []);

  const setContractState = useCallback((state: ContractFormState) => {
    dispatch({ type: 'SET_CONTRACT_STATE', payload: state });
  }, []);

  // Companion operations
  const addCompanion = useCallback(() => {
    dispatch({ type: 'ADD_COMPANION' });
  }, []);

  const removeCompanion = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_COMPANION', payload: { id } });
  }, []);

  const updateCompanion = useCallback((id: string, field: keyof Companion, value: string) => {
    dispatch({ type: 'UPDATE_COMPANION', payload: { id, field, value } });
  }, []);

  // Minor operations
  const addMinor = useCallback(() => {
    dispatch({ type: 'ADD_MINOR' });
  }, []);

  const removeMinor = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_MINOR', payload: { id } });
  }, []);

  const updateMinor = useCallback((id: string, field: keyof Minor, value: string) => {
    dispatch({ type: 'UPDATE_MINOR', payload: { id, field, value } });
  }, []);

  // Itinerary operations
  const addItineraryItem = useCallback(() => {
    dispatch({ type: 'ADD_ITINERARY_ITEM' });
  }, []);

  const removeItineraryItem = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_ITINERARY_ITEM', payload: { id } });
  }, []);

  const updateItineraryItem = useCallback((id: string, field: 'date' | 'detail', value: string) => {
    dispatch({ type: 'UPDATE_ITINERARY_ITEM', payload: { id, field, value } });
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      state: wizardState.contract,
      dispatch,
      updateField,
      updateFieldWithCalculations,
      updateTourDate,
      setContractState,
      addCompanion,
      removeCompanion,
      updateCompanion,
      addMinor,
      removeMinor,
      updateMinor,
      addItineraryItem,
      removeItineraryItem,
      updateItineraryItem,
    }),
    [
      wizardState.contract,
      updateField,
      updateFieldWithCalculations,
      updateTourDate,
      setContractState,
      addCompanion,
      removeCompanion,
      updateCompanion,
      addMinor,
      removeMinor,
      updateMinor,
      addItineraryItem,
      removeItineraryItem,
      updateItineraryItem,
    ]
  );

  return (
    <WizardContext.Provider value={value}>
      {children}
    </WizardContext.Provider>
  );
}

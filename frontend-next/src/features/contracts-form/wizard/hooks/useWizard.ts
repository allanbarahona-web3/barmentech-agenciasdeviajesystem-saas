import { useContext } from 'react';
import { WizardContext, WizardContextType } from '../provider/WizardContext';

/**
 * useWizard Hook
 * 
 * Custom hook to consume the Wizard Context.
 * Ensures the hook is used within a WizardProvider.
 * 
 * @throws Error if used outside WizardProvider
 * @returns Wizard context value
 */
export function useWizard(): WizardContextType {
  const context = useContext(WizardContext);

  if (context === undefined) {
    throw new Error(
      'useWizard must be used within a WizardProvider. ' +
      'Ensure the component is wrapped with <WizardProvider>.'
    );
  }

  return context;
}

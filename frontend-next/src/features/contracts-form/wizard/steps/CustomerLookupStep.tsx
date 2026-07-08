import type { ContractFormState } from "@/features/contracts-form/types";

export interface CustomerLookupStepProps {
  state: ContractFormState;
  setState: React.Dispatch<React.SetStateAction<ContractFormState>>;
}

/**
 * CustomerLookupStep - Customer Search and Selection
 * 
 * Structural placeholder for customer lookup functionality.
 * This step will enable agents to search for existing customers
 * or create new ones before proceeding to holder details.
 * 
 * Future implementation will include:
 * - Customer search interface
 * - Customer creation modal
 * - Customer selection and pre-fill logic
 */
export function CustomerLookupStep({
  state,
  setState,
}: CustomerLookupStepProps) {
  return (
    <div className="form-section-card">
      <h2 className="section-title">Buscar Cliente</h2>
      
      <div style={{ 
        padding: '40px 20px', 
        textAlign: 'center',
        background: '#f9fafb',
        borderRadius: '8px',
        border: '2px dashed #e5e7eb'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
        <h3 style={{ 
          fontSize: '18px', 
          fontWeight: '600', 
          color: '#374151', 
          marginBottom: '8px' 
        }}>
          Búsqueda de Clientes
        </h3>
        <p style={{ 
          color: '#6b7280', 
          fontSize: '14px',
          maxWidth: '500px',
          margin: '0 auto'
        }}>
          La funcionalidad de búsqueda y selección de clientes se implementará en la siguiente historia.
          Por ahora, puede continuar al siguiente paso para ingresar los datos del titular.
        </p>
      </div>
    </div>
  );
}

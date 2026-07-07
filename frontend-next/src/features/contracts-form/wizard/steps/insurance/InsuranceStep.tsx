import type { ContractFormState } from "@/features/contracts-form/types";

export interface InsuranceStepProps {
  state: ContractFormState;
  setState: React.Dispatch<React.SetStateAction<ContractFormState>>;
}

/**
 * InsuranceStep - Insurance Decision Section
 * 
 * Captures the traveler's decision regarding travel insurance purchase.
 * This is a simple yes/no decision step that stores the result in the contract state.
 * 
 * The decision is persisted as part of the contract payload and survives:
 * - Draft saving/loading
 * - Contract archival
 * - Browser refresh
 * - URL navigation
 */
export function InsuranceStep({
  state,
  setState,
}: InsuranceStepProps) {
  return (
    <div className="form-section-card">
      <h2 className="section-title">Seguro de Viaje</h2>

      <div className="contracts-grid">
        <label className="col-span-full">
          ¿El viajero adquiere seguro de viaje con la agencia?
          <div style={{ marginTop: '12px', display: 'flex', gap: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="insurance-purchased"
                checked={state.insurance.purchased === true}
                onChange={() => setState((prev) => ({
                  ...prev,
                  insurance: { purchased: true }
                }))}
                style={{ cursor: 'pointer' }}
              />
              <span>Sí</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="insurance-purchased"
                checked={state.insurance.purchased === false}
                onChange={() => setState((prev) => ({
                  ...prev,
                  insurance: { purchased: false }
                }))}
                style={{ cursor: 'pointer' }}
              />
              <span>No</span>
            </label>
          </div>
        </label>
      </div>
    </div>
  );
}

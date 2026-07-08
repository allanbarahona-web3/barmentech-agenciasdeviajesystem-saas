import type { ContractFormState } from "@/features/contracts-form/types";

export interface InsuranceStepProps {
  state: ContractFormState;
  setState: React.Dispatch<React.SetStateAction<ContractFormState>>;
}

/**
 * InsuranceStep - Insurance Decision Section
 * 
 * Captures per-traveler insurance decisions for all registered travelers.
 * Displays holder, companions, and minors already registered in the wizard.
 * 
 * This is a READ-ONLY view of travelers - no creation, editing, or deletion.
 * Traveler information comes exclusively from previous steps.
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
  const applyToAll = (value: boolean) => {
    setState((prev) => {
      const newCompanions: Record<string, boolean> = {};
      prev.companions.forEach(c => {
        newCompanions[c.id] = value;
      });
      
      const newMinors: Record<string, boolean> = {};
      prev.minors.forEach(m => {
        newMinors[m.id] = value;
      });

      return {
        ...prev,
        insurance: {
          holder: value,
          companions: newCompanions,
          minors: newMinors,
        },
      };
    });
  };

  const updateHolderInsurance = (value: boolean) => {
    setState((prev) => ({
      ...prev,
      insurance: {
        ...prev.insurance,
        holder: value,
      },
    }));
  };

  const updateCompanionInsurance = (companionId: string, value: boolean) => {
    setState((prev) => ({
      ...prev,
      insurance: {
        ...prev.insurance,
        companions: {
          ...prev.insurance.companions,
          [companionId]: value,
        },
      },
    }));
  };

  const updateMinorInsurance = (minorId: string, value: boolean) => {
    setState((prev) => ({
      ...prev,
      insurance: {
        ...prev.insurance,
        minors: {
          ...prev.insurance.minors,
          [minorId]: value,
        },
      },
    }));
  };

  return (
    <div className="form-section-card">
      <h2 className="section-title">Seguro de Viaje</h2>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => applyToAll(true)}
        >
          Aplicar SÍ a todos
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => applyToAll(false)}
        >
          Aplicar NO a todos
        </button>
      </div>

      <div className="itinerary-box">
        <div className="itinerary-list">
          {/* Holder */}
          <article className="subcard">
            <h3 className="text-base font-semibold mb-3">Titular</h3>
            <div className="contracts-grid">
              <label className="col-span-full">
                <strong>{state.clientFullName || "(Sin nombre)"}</strong>
                <div style={{ marginTop: '12px', display: 'flex', gap: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="insurance-holder"
                      checked={state.insurance.holder === true}
                      onChange={() => updateHolderInsurance(true)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>Sí</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="insurance-holder"
                      checked={state.insurance.holder === false}
                      onChange={() => updateHolderInsurance(false)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>No</span>
                  </label>
                </div>
              </label>
            </div>
          </article>

          {/* Companions */}
          {state.companions.map((companion, index) => (
            <article key={companion.id} className="subcard">
              <h3 className="text-base font-semibold mb-3">Acompañante {index + 1}</h3>
              <div className="contracts-grid">
                <label className="col-span-full">
                  <strong>{companion.fullName || "(Sin nombre)"}</strong>
                  <div style={{ marginTop: '12px', display: 'flex', gap: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`insurance-companion-${companion.id}`}
                        checked={state.insurance.companions[companion.id] === true}
                        onChange={() => updateCompanionInsurance(companion.id, true)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>Sí</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`insurance-companion-${companion.id}`}
                        checked={state.insurance.companions[companion.id] === false}
                        onChange={() => updateCompanionInsurance(companion.id, false)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>No</span>
                    </label>
                  </div>
                </label>
              </div>
            </article>
          ))}

          {/* Minors */}
          {state.minors.map((minor, index) => (
            <article key={minor.id} className="subcard">
              <h3 className="text-base font-semibold mb-3">Menor {index + 1}</h3>
              <div className="contracts-grid">
                <label className="col-span-full">
                  <strong>{minor.minorName || "(Sin nombre)"}</strong>
                  <div style={{ marginTop: '12px', display: 'flex', gap: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`insurance-minor-${minor.id}`}
                        checked={state.insurance.minors[minor.id] === true}
                        onChange={() => updateMinorInsurance(minor.id, true)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>Sí</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`insurance-minor-${minor.id}`}
                        checked={state.insurance.minors[minor.id] === false}
                        onChange={() => updateMinorInsurance(minor.id, false)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>No</span>
                    </label>
                  </div>
                </label>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

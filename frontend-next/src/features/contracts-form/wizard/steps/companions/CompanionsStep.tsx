import type { ContractFormState } from "@/features/contracts-form/types";
import { addCompanion, removeCompanion, updateCompanion } from "@/features/contracts-form/utils";

export interface CompanionsStepProps {
  state: ContractFormState;
  setState: React.Dispatch<React.SetStateAction<ContractFormState>>;
  isInternalTrip: boolean;
  companionDocs: Record<string, { idFront: File | null; idBack: File | null; passport: File | null }>;
  setCompanionDocs: React.Dispatch<React.SetStateAction<Record<string, { idFront: File | null; idBack: File | null; passport: File | null }>>>;
  nationalityOptions: string[];
  requiredDocumentLabelClass: (hasAttachment: boolean) => string;
  updateFileInputState: (input: HTMLInputElement, hasFile: boolean) => void;
}

/**
 * CompanionsStep - Companions/Travel Companions Section
 * 
 * Extracted from ContractsForm as part of incremental component extraction.
 * Contains the complete "Acompanantes" section including:
 * - Companion list management
 * - Add/remove companion functionality
 * - Companion personal information
 * - Companion identification and contact details
 * - Companion document uploads (ID, passport for international trips)
 * - Conditional rendering for international vs internal trips
 * 
 * This component manages the list of adults traveling with the holder.
 * Each companion shares similar fields to HolderStep but can be added/removed dynamically.
 * 
 * This is a pure extraction with zero functional changes.
 */
export function CompanionsStep({
  state,
  setState,
  isInternalTrip,
  companionDocs,
  setCompanionDocs,
  nationalityOptions,
  requiredDocumentLabelClass,
  updateFileInputState,
}: CompanionsStepProps) {
  return (
    <div className="itinerary-box">
      <div className="itinerary-head">
        <h2>Acompanantes</h2>
        <button 
          type="button" 
          className="btn-secondary" 
          onClick={() => setState((prev) => addCompanion(prev))}
        >
          + Agregar acompanante
        </button>
      </div>

      <div className="itinerary-list">
        {state.companions.length === 0 ? <p className="m-0 text-[#4b6790] text-sm">Aun no hay acompanantes.</p> : null}
        {state.companions.map((companion, index) => (
          <article key={companion.id} className="subcard">
            <div className="itinerary-head">
              <h3>Acompanante {index + 1}</h3>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setCompanionDocs((prev) => {
                    const next = { ...prev };
                    delete next[companion.id];
                    return next;
                  });
                  setState((prev) => removeCompanion(prev, companion.id));
                }}
              >
                Eliminar
              </button>
            </div>

            <div className="contracts-grid">
              <label>
                Nombre completo
                <input
                  value={companion.fullName}
                  onChange={(event) =>
                    setState((prev) => updateCompanion(prev, companion.id, "fullName", event.target.value))
                  }
                />
              </label>
              <label>
                Tipo ID
                <select
                  value={companion.idType}
                  onChange={(event) =>
                    setState((prev) => updateCompanion(prev, companion.id, "idType", event.target.value))
                  }
                >
                  <option value="Cédula">Cédula</option>
                  <option value="Pasaporte">Pasaporte</option>
                  <option value="DIMEX">DIMEX</option>
                </select>
              </label>
              <label>
                Numero ID
                <input
                  value={companion.idNumber}
                  onChange={(event) =>
                    setState((prev) => updateCompanion(prev, companion.id, "idNumber", event.target.value))
                  }
                />
              </label>
              <label>
                Correo
                <input
                  type="email"
                  value={companion.email}
                  onChange={(event) =>
                    setState((prev) => updateCompanion(prev, companion.id, "email", event.target.value))
                  }
                />
              </label>
              <label>
                Telefono
                <input
                  value={companion.phone}
                  onChange={(event) =>
                    setState((prev) => updateCompanion(prev, companion.id, "phone", event.target.value))
                  }
                />
              </label>
              <label>
                Contacto emergencia
                <input
                  value={companion.emergencyContactName}
                  onChange={(event) =>
                    setState((prev) =>
                      updateCompanion(prev, companion.id, "emergencyContactName", event.target.value)
                    )
                  }
                />
              </label>
              <label>
                Telefono emergencia
                <input
                  value={companion.emergencyContactPhone}
                  onChange={(event) =>
                    setState((prev) =>
                      updateCompanion(prev, companion.id, "emergencyContactPhone", event.target.value)
                    )
                  }
                />
              </label>
              <label>
                Direccion
                <input
                  value={companion.address}
                  onChange={(event) =>
                    setState((prev) => updateCompanion(prev, companion.id, "address", event.target.value))
                  }
                />
              </label>
              <label>
                Estado civil
                <select
                  value={companion.civilStatus}
                  onChange={(event) =>
                    setState((prev) => updateCompanion(prev, companion.id, "civilStatus", event.target.value))
                  }
                >
                  <option value="Soltero">Soltero</option>
                  <option value="Casado">Casado</option>
                  <option value="Divorciado">Divorciado</option>
                  <option value="Viudo">Viudo</option>
                </select>
              </label>
              <label>
                Profesion
                <input
                  value={companion.profession}
                  onChange={(event) =>
                    setState((prev) => updateCompanion(prev, companion.id, "profession", event.target.value))
                  }
                />
              </label>
              <label>
                Nacionalidad
                <select
                  value={companion.nationality}
                  onChange={(event) =>
                    setState((prev) => updateCompanion(prev, companion.id, "nationality", event.target.value))
                  }
                >
                  {nationalityOptions.map((country, idx) => (
                    <option key={idx} value={country} disabled={country === "──────────"}>
                      {country}
                    </option>
                  ))}
                </select>
              </label>
              <label className={requiredDocumentLabelClass(Boolean(companionDocs[companion.id]?.idFront))}>
                Cédula frente
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  key={companionDocs[companion.id]?.idFront ? companionDocs[companion.id].idFront!.name : `empty-${companion.id}-idFront`}
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    updateFileInputState(event.target, !!file);
                    setCompanionDocs((prev) => ({
                      ...prev,
                      [companion.id]: {
                        idFront: file,
                        idBack: prev[companion.id]?.idBack || null,
                        passport: prev[companion.id]?.passport || null,
                      },
                    }));
                    setState((prev) => updateCompanion(prev, companion.id, "idFrontDocumentName", file?.name || ""));
                  }}
                />
                {companionDocs[companion.id]?.idFront && (
                  <small style={{ color: '#1a8a4e', fontWeight: 600 }}>✓ {companionDocs[companion.id].idFront!.name}</small>
                )}
              </label>
              <label className={requiredDocumentLabelClass(Boolean(companionDocs[companion.id]?.idBack))}>
                Cédula reverso
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  key={companionDocs[companion.id]?.idBack ? companionDocs[companion.id].idBack!.name : `empty-${companion.id}-idBack`}
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    updateFileInputState(event.target, !!file);
                    setCompanionDocs((prev) => ({
                      ...prev,
                      [companion.id]: {
                        idFront: prev[companion.id]?.idFront || null,
                        idBack: file,
                        passport: prev[companion.id]?.passport || null,
                      },
                    }));
                    setState((prev) => updateCompanion(prev, companion.id, "idBackDocumentName", file?.name || ""));
                  }}
                />
                {companionDocs[companion.id]?.idBack && (
                  <small style={{ color: '#1a8a4e', fontWeight: 600 }}>✓ {companionDocs[companion.id].idBack!.name}</small>
                )}
              </label>
              {/* Pasaporte acompañante: SOLO internacional */}
              {!isInternalTrip && (
              <label className={requiredDocumentLabelClass(Boolean(companionDocs[companion.id]?.passport))}>
                Pasaporte
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  key={companionDocs[companion.id]?.passport ? companionDocs[companion.id].passport!.name : `empty-${companion.id}-passport`}
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    updateFileInputState(event.target, !!file);
                    setCompanionDocs((prev) => ({
                      ...prev,
                      [companion.id]: {
                        idFront: prev[companion.id]?.idFront || null,
                        idBack: prev[companion.id]?.idBack || null,
                        passport: file,
                      },
                    }));
                    setState((prev) => updateCompanion(prev, companion.id, "passportDocumentName", file?.name || ""));
                  }}
                />
                {companionDocs[companion.id]?.passport && (
                  <small style={{ color: '#1a8a4e', fontWeight: 600 }}>✓ {companionDocs[companion.id].passport!.name}</small>
                )}
              </label>
              )}
            </div>
          </article>
        ))}
      </div>

      {/* Minor Traveler Activation - Restored from previous implementation */}
      <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <label className="check-inline" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={state.hasMinorCompanion}
            onChange={(event) => {
              const enabled = event.target.checked;
              setState((prev) => ({
                ...prev,
                hasMinorCompanion: enabled,
                minors: enabled ? prev.minors : [],
              }));
            }}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ fontWeight: 600, color: '#1e293b' }}>¿Viajan menores de edad en este viaje?</span>
        </label>
        {state.hasMinorCompanion && (
          <p style={{ marginTop: '8px', marginBottom: 0, fontSize: '0.875rem', color: '#64748b' }}>
            Los datos de los menores se capturarán en el siguiente paso.
          </p>
        )}
      </div>
    </div>
  );
}

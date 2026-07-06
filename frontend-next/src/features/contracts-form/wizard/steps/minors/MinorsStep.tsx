import { addMinor, removeMinor, updateMinor } from "@/features/contracts-form/utils";
import type { ContractFormState } from "@/features/contracts-form/types";

export interface MinorsStepProps {
  state: ContractFormState;
  setState: React.Dispatch<React.SetStateAction<ContractFormState>>;
  isInternalTrip: boolean;
  minorDocs: Record<
    string,
    {
      minorPassport: File | null;
      tutorIdFront: File | null;
      tutorIdBack: File | null;
      tutorPassport: File | null;
    }
  >;
  setMinorDocs: React.Dispatch<
    React.SetStateAction<
      Record<
        string,
        {
          minorPassport: File | null;
          tutorIdFront: File | null;
          tutorIdBack: File | null;
          tutorPassport: File | null;
        }
      >
    >
  >;
  responsibleAdults: string[];
  requiredDocumentLabelClass: (hasAttachment: boolean) => string;
  updateFileInputState: (input: HTMLInputElement, hasFile: boolean) => void;
}

export function MinorsStep({
  state,
  setState,
  isInternalTrip,
  minorDocs,
  setMinorDocs,
  responsibleAdults,
  requiredDocumentLabelClass,
  updateFileInputState,
}: MinorsStepProps) {
  return (
    <div className="itinerary-box">
      <div className="itinerary-head">
        <h2>Menores</h2>
        <div className="inline-actions">
          <label className="check-inline">
            <input
              type="checkbox"
              checked={state.hasMinorCompanion}
              onChange={(event) => {
                const enabled = event.target.checked;
                setState((prev) => ({
                  ...prev,
                  hasMinorCompanion: enabled,
                  minors: enabled ? (prev.minors.length ? prev.minors : prev.minors) : [],
                }));
              }}
            />
            Viajan menores
          </label>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setState((prev) => addMinor(prev))}
            disabled={!state.hasMinorCompanion}
          >
            + Agregar menor
          </button>
        </div>
      </div>

      {!state.hasMinorCompanion ? <p className="m-0 text-[#4b6790] text-sm">Marca la casilla si hay menores en el viaje.</p> : null}

      <div className="itinerary-list">
        {state.hasMinorCompanion && state.minors.length === 0 ? <p className="m-0 text-[#4b6790] text-sm">Aun no hay menores.</p> : null}
        {state.minors.map((minor, index) => (
          <article key={minor.id} className="subcard">
            <div className="itinerary-head">
              <h3>Menor {index + 1}</h3>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setMinorDocs((prev) => {
                    const next = { ...prev };
                    delete next[minor.id];
                    return next;
                  });
                  setState((prev) => removeMinor(prev, minor.id));
                }}
              >
                Eliminar
              </button>
            </div>

            <div className="contracts-grid">
              <label>
                Nombre del menor
                <input
                  value={minor.minorName}
                  onChange={(event) => setState((prev) => updateMinor(prev, minor.id, "minorName", event.target.value))}
                />
              </label>
              <label>
                Identificacion del menor
                <input
                  value={minor.minorId}
                  onChange={(event) => setState((prev) => updateMinor(prev, minor.id, "minorId", event.target.value))}
                />
              </label>
              <label>
                Nombre tutor legal
                <input
                  value={minor.tutorName}
                  onChange={(event) => setState((prev) => updateMinor(prev, minor.id, "tutorName", event.target.value))}
                />
              </label>
              <label>
                Tipo ID tutor
                <select
                  value={minor.tutorIdType}
                  onChange={(event) => setState((prev) => updateMinor(prev, minor.id, "tutorIdType", event.target.value))}
                >
                  <option value="Cédula">Cédula</option>
                  <option value="Pasaporte">Pasaporte</option>
                  <option value="DIMEX">DIMEX</option>
                </select>
              </label>
              <label>
                ID tutor
                <input
                  value={minor.tutorId}
                  onChange={(event) => setState((prev) => updateMinor(prev, minor.id, "tutorId", event.target.value))}
                />
              </label>
              <label>
                Adulto que viaja con el menor
                <select
                  value={minor.travelingWith}
                  onChange={(event) =>
                    setState((prev) => updateMinor(prev, minor.id, "travelingWith", event.target.value))
                  }
                >
                  <option value="">Seleccionar</option>
                  {responsibleAdults.map((name) => (
                    <option key={`${minor.id}-${name}`} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              {/* Pasaporte menor: SOLO internacional */}
              {!isInternalTrip && (
              <label className={requiredDocumentLabelClass(Boolean(minorDocs[minor.id]?.minorPassport))}>
                Pasaporte menor
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    updateFileInputState(event.target, !!file);
                    setMinorDocs((prev) => ({
                      ...prev,
                      [minor.id]: {
                        minorPassport: file,
                        tutorIdFront: prev[minor.id]?.tutorIdFront || null,
                        tutorIdBack: prev[minor.id]?.tutorIdBack || null,
                        tutorPassport: prev[minor.id]?.tutorPassport || null,
                      },
                    }));
                    setState((prev) => updateMinor(prev, minor.id, "minorPassportDocumentName", file?.name || ""));
                  }}
                />
              </label>
              )}
              <label className={requiredDocumentLabelClass(Boolean(minorDocs[minor.id]?.tutorIdFront))}>
                Cedula tutor frente
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    updateFileInputState(event.target, !!file);
                    setMinorDocs((prev) => ({
                      ...prev,
                      [minor.id]: {
                        minorPassport: prev[minor.id]?.minorPassport || null,
                        tutorIdFront: file,
                        tutorIdBack: prev[minor.id]?.tutorIdBack || null,
                        tutorPassport: prev[minor.id]?.tutorPassport || null,
                      },
                    }));
                    setState((prev) => updateMinor(prev, minor.id, "tutorIdFrontDocumentName", file?.name || ""));
                  }}
                />
              </label>
              <label className={requiredDocumentLabelClass(Boolean(minorDocs[minor.id]?.tutorIdBack))}>
                Cedula tutor reverso
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    updateFileInputState(event.target, !!file);
                    setMinorDocs((prev) => ({
                      ...prev,
                      [minor.id]: {
                        minorPassport: prev[minor.id]?.minorPassport || null,
                        tutorIdFront: prev[minor.id]?.tutorIdFront || null,
                        tutorIdBack: file,
                        tutorPassport: prev[minor.id]?.tutorPassport || null,
                      },
                    }));
                    setState((prev) => updateMinor(prev, minor.id, "tutorIdBackDocumentName", file?.name || ""));
                  }}
                />
              </label>
              {/* Pasaporte tutor: SOLO internacional */}
              {!isInternalTrip && (
              <label className={requiredDocumentLabelClass(Boolean(minorDocs[minor.id]?.tutorPassport))}>
                Pasaporte tutor
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    updateFileInputState(event.target, !!file);
                    setMinorDocs((prev) => ({
                      ...prev,
                      [minor.id]: {
                        minorPassport: prev[minor.id]?.minorPassport || null,
                        tutorIdFront: prev[minor.id]?.tutorIdFront || null,
                        tutorIdBack: prev[minor.id]?.tutorIdBack || null,
                        tutorPassport: file,
                      },
                    }));
                    setState((prev) => updateMinor(prev, minor.id, "tutorPassportDocumentName", file?.name || ""));
                  }}
                />
              </label>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

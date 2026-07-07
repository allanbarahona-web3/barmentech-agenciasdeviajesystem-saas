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
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setState((prev) => addMinor(prev))}
        >
          + Agregar menor
        </button>
      </div>

      <div className="itinerary-list">
        {state.minors.length === 0 ? <p className="m-0 text-[#4b6790] text-sm">Aun no hay menores.</p> : null}
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
                  key={minorDocs[minor.id]?.minorPassport ? minorDocs[minor.id].minorPassport!.name : `empty-${minor.id}-minorPassport`}
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    updateFileInputState(event.target, !!file);
                    setMinorDocs((prev) => ({
                      ...prev,
                      [minor.id]: {
                        minorPassport: file,
                        tutorIdFront: prev[minor.id]?.tutorIdFront || null,
                        tutorIdBack: prev[minor.id]?.tutorIdBack || null,
                      },
                    }));
                    setState((prev) => updateMinor(prev, minor.id, "minorPassportDocumentName", file?.name || ""));
                  }}
                />
                {minorDocs[minor.id]?.minorPassport && (
                  <small style={{ color: '#1a8a4e', fontWeight: 600 }}>✓ {minorDocs[minor.id].minorPassport!.name}</small>
                )}
              </label>
              )}
              <label className={requiredDocumentLabelClass(Boolean(minorDocs[minor.id]?.tutorIdFront))}>
                Cedula tutor frente
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  key={minorDocs[minor.id]?.tutorIdFront ? minorDocs[minor.id].tutorIdFront!.name : `empty-${minor.id}-tutorIdFront`}
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    updateFileInputState(event.target, !!file);
                    setMinorDocs((prev) => ({
                      ...prev,
                      [minor.id]: {
                        minorPassport: prev[minor.id]?.minorPassport || null,
                        tutorIdFront: file,
                        tutorIdBack: prev[minor.id]?.tutorIdBack || null,
                      },
                    }));
                    setState((prev) => updateMinor(prev, minor.id, "tutorIdFrontDocumentName", file?.name || ""));
                  }}
                />
                {minorDocs[minor.id]?.tutorIdFront && (
                  <small style={{ color: '#1a8a4e', fontWeight: 600 }}>✓ {minorDocs[minor.id].tutorIdFront!.name}</small>
                )}
              </label>
              <label className={requiredDocumentLabelClass(Boolean(minorDocs[minor.id]?.tutorIdBack))}>
                Cedula tutor reverso
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  key={minorDocs[minor.id]?.tutorIdBack ? minorDocs[minor.id].tutorIdBack!.name : `empty-${minor.id}-tutorIdBack`}
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    updateFileInputState(event.target, !!file);
                    setMinorDocs((prev) => ({
                      ...prev,
                      [minor.id]: {
                        minorPassport: prev[minor.id]?.minorPassport || null,
                        tutorIdFront: prev[minor.id]?.tutorIdFront || null,
                        tutorIdBack: file,
                      },
                    }));
                    setState((prev) => updateMinor(prev, minor.id, "tutorIdBackDocumentName", file?.name || ""));
                  }}
                />
                {minorDocs[minor.id]?.tutorIdBack && (
                  <small style={{ color: '#1a8a4e', fontWeight: 600 }}>✓ {minorDocs[minor.id].tutorIdBack!.name}</small>
                )}
              </label>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

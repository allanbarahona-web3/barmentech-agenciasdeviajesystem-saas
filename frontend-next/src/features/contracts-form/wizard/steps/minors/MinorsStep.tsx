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
              {/* Minor basic information */}
              <label>
                Nombre del menor
                <input
                  value={minor.minorName}
                  onChange={(event) => setState((prev) => updateMinor(prev, minor.id, "minorName", event.target.value))}
                />
              </label>
              <label>
                Tipo de identificación del menor
                <select
                  value={minor.minorIdType}
                  onChange={(event) =>
                    setState((prev) =>
                      updateMinor(
                        prev,
                        minor.id,
                        "minorIdType",
                        event.target.value,
                      )
                    )
                  }
                >
                  <option value="Cedula">Cédula</option>
                  <option value="Pasaporte">Pasaporte</option>
                  <option value="DIMEX">DIMEX</option>
                </select>
              </label>
              <label>
                Identificacion del menor
                <input
                  value={minor.minorId}
                  onChange={(event) => setState((prev) => updateMinor(prev, minor.id, "minorId", event.target.value))}
                />
              </label>
              
              {/* Minor passport: international trips only */}
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

              {/* Parent/Tutor decision */}
              <label className="col-span-full" style={{ marginTop: '16px' }}>
                ¿El menor viaja con su padre o madre?
                <div style={{ marginTop: '8px', display: 'flex', gap: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={`travels-with-parent-${minor.id}`}
                      checked={minor.travelsWithParent === true}
                      onChange={() => {
                        setState((prev) => updateMinor(prev, minor.id, "travelsWithParent", "true"));
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>Sí</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={`travels-with-parent-${minor.id}`}
                      checked={minor.travelsWithParent === false}
                      onChange={() => {
                        setState((prev) => updateMinor(prev, minor.id, "travelsWithParent", "false"));
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>No</span>
                  </label>
                </div>
              </label>

              {/* If YES: show parent selector */}
              {minor.travelsWithParent && (
                <label className="col-span-full">
                  Padre/Madre que viaja con el menor
                  <select
                    value={minor.travelingWith}
                    onChange={(event) =>
                      setState((prev) => updateMinor(prev, minor.id, "travelingWith", event.target.value))
                    }
                  >
                    <option value="">Seleccionar</option>
                    {responsibleAdults.map((name) => (
                      <option key={`${minor.id}-parent-${name}`} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* If NO: show tutor information and documents */}
              {!minor.travelsWithParent && (
                <>
                  {/* Tutor Information Section */}
                  <div className="col-span-full" style={{ marginTop: '20px', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #e5e7eb' }}>
                    <h4 style={{ margin: 0, fontWeight: 600, color: '#374151', fontSize: '0.95rem' }}>
                      Información del tutor legal
                    </h4>
                  </div>
                  
                  <label>
                    Nombre completo del tutor
                    <input
                      value={minor.tutorName}
                      onChange={(event) => setState((prev) => updateMinor(prev, minor.id, "tutorName", event.target.value))}
                      placeholder="Nombre completo"
                    />
                  </label>
                  
                  <label>
                    Email del tutor
                    <input
                      type="email"
                      value={minor.tutorEmail}
                      onChange={(event) => setState((prev) => updateMinor(prev, minor.id, "tutorEmail", event.target.value))}
                      placeholder="correo@ejemplo.com"
                    />
                  </label>
                  
                  <label>
                    Tipo de identificacion
                    <select
                      value={minor.tutorIdType}
                      onChange={(event) => setState((prev) => updateMinor(prev, minor.id, "tutorIdType", event.target.value))}
                    >
                      <option value="Cedula">Cédula</option>
                      <option value="Pasaporte">Pasaporte</option>
                      <option value="DIMEX">DIMEX</option>
                    </select>
                  </label>
                  
                  <label>
                    Numero de identificacion
                    <input
                      value={minor.tutorId}
                      onChange={(event) => setState((prev) => updateMinor(prev, minor.id, "tutorId", event.target.value))}
                      placeholder="Número de identificación"
                    />
                  </label>

                  {/* Tutor Documents Section */}
                  <div className="col-span-full" style={{ marginTop: '20px', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #e5e7eb' }}>
                    <h4 style={{ margin: 0, fontWeight: 600, color: '#374151', fontSize: '0.95rem' }}>
                      Documentos del tutor
                    </h4>
                  </div>

                  <label className={requiredDocumentLabelClass(Boolean(minorDocs[minor.id]?.tutorIdFront))}>
                    Identificacion frente
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
                    Identificacion reverso
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

                  {/* Responsible Adult Section */}
                  <div className="col-span-full" style={{ marginTop: '20px', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #e5e7eb' }}>
                    <h4 style={{ margin: 0, fontWeight: 600, color: '#374151', fontSize: '0.95rem' }}>
                      Adulto responsable durante el viaje
                    </h4>
                  </div>

                  <label className="col-span-full">
                    Adulto que viaja con el menor
                    <select
                      value={minor.travelingWith}
                      onChange={(event) =>
                        setState((prev) => updateMinor(prev, minor.id, "travelingWith", event.target.value))
                      }
                    >
                      <option value="">Seleccionar</option>
                      {responsibleAdults.map((name) => (
                        <option key={`${minor.id}-adult-${name}`} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

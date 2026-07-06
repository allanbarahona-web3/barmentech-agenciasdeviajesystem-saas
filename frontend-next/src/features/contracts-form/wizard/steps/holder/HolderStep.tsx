import type { ContractFormState, IdType } from "@/features/contracts-form/types";

export interface HolderStepProps {
  state: ContractFormState;
  setState: React.Dispatch<React.SetStateAction<ContractFormState>>;
  isInternalTrip: boolean;
  holderDocs: { idFront: File | null; idBack: File | null; passport: File | null };
  setHolderDocs: React.Dispatch<React.SetStateAction<{ idFront: File | null; idBack: File | null; passport: File | null }>>;
  nationalityOptions: string[];
  requiredDocumentLabelClass: (hasAttachment: boolean) => string;
  updateFileInputState: (input: HTMLInputElement, hasFile: boolean) => void;
  handleValidateCustomerIdentity: () => Promise<void>;
}

/**
 * HolderStep - Customer/Holder Information Section
 * 
 * Extracted from ContractsForm as part of incremental component extraction.
 * Contains the complete "Datos del Cliente" section including:
 * - Personal information (name, ID, email, phone, address)
 * - Emergency contact information
 * - Civil status and profession
 * - Nationality
 * - Document uploads (ID front/back, passport)
 * - Identity validation
 * 
 * This component is designed for high reusability across:
 * - Contract Wizard
 * - CRM modules
 * - Customer Management
 * - Reservation systems
 * 
 * This is a pure extraction with zero functional changes.
 */
export function HolderStep({
  state,
  setState,
  isInternalTrip,
  holderDocs,
  setHolderDocs,
  nationalityOptions,
  requiredDocumentLabelClass,
  updateFileInputState,
  handleValidateCustomerIdentity,
}: HolderStepProps) {
  return (
    <div className="form-section-card">
      <h2 className="section-title">Datos del Cliente</h2>

      <div className="contracts-grid">
        <label>
          Nombre completo
          <input
            value={state.clientFullName}
            onChange={(event) => setState((prev) => ({ ...prev, clientFullName: event.target.value }))}
          />
        </label>

        <label>
          Tipo ID
          <select
            value={state.clientIdType}
            onChange={(event) => setState((prev) => ({ ...prev, clientIdType: event.target.value as IdType }))}
          >
            <option value="Cedula">Cédula</option>
            <option value="Pasaporte">Pasaporte</option>
            <option value="DIMEX">DIMEX</option>
          </select>
        </label>

        <label>
          Numero ID
          <input
            value={state.clientIdNumber}
            onChange={(event) => setState((prev) => ({ ...prev, clientIdNumber: event.target.value }))}
            onBlur={handleValidateCustomerIdentity}
          />
        </label>

        <label>
          Correo
          <input
            type="email"
            value={state.clientEmail}
            onChange={(event) => setState((prev) => ({ ...prev, clientEmail: event.target.value }))}
          />
        </label>

        <label>
          Telefono
          <input
            value={state.clientPhone}
            onChange={(event) => setState((prev) => ({ ...prev, clientPhone: event.target.value }))}
          />
        </label>

        <label>
          Direccion
          <input
            value={state.clientAddress}
            onChange={(event) => setState((prev) => ({ ...prev, clientAddress: event.target.value }))}
          />
        </label>

        <label>
          Contacto emergencia
          <input
            value={state.emergencyContactName}
            onChange={(event) => setState((prev) => ({ ...prev, emergencyContactName: event.target.value }))}
          />
        </label>

        <label>
          Telefono emergencia
          <input
            value={state.emergencyContactPhone}
            onChange={(event) => setState((prev) => ({ ...prev, emergencyContactPhone: event.target.value }))}
          />
        </label>

        <label>
          Estado civil
          <select
            value={state.civilStatus}
            onChange={(event) =>
              setState((prev) => ({
                ...prev,
                civilStatus: event.target.value as "Soltero" | "Casado" | "Divorciado" | "Viudo",
              }))
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
            value={state.profession}
            onChange={(event) => setState((prev) => ({ ...prev, profession: event.target.value }))}
          />
        </label>

        <label>
          Nacionalidad
          <select
            value={state.clientNationality}
            onChange={(event) => setState((prev) => ({ ...prev, clientNationality: event.target.value }))}
          >
            {nationalityOptions.map((country, idx) => (
              <option key={idx} value={country} disabled={country === "──────────"}>
                {country}
              </option>
            ))}
          </select>
        </label>

        <label className={requiredDocumentLabelClass(Boolean(holderDocs.idFront))}>
          Cédula titular (frente)
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              updateFileInputState(event.target, !!file);
              setHolderDocs((prev) => ({ ...prev, idFront: file }));
              setState((prev) => ({
                ...prev,
                idFrontDocumentName: file?.name || "",
              }));
            }}
          />
        </label>

        <label className={requiredDocumentLabelClass(Boolean(holderDocs.idBack))}>
          Cédula titular (reverso)
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              updateFileInputState(event.target, !!file);
              setHolderDocs((prev) => ({ ...prev, idBack: file }));
              setState((prev) => ({
                ...prev,
                idBackDocumentName: file?.name || "",
              }));
            }}
          />
        </label>

        {/* Pasaporte: SOLO para viajes internacionales */}
        {!isInternalTrip && (
          <label className={requiredDocumentLabelClass(Boolean(holderDocs.passport))}>
            Pasaporte titular
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                updateFileInputState(event.target, !!file);
                setHolderDocs((prev) => ({ ...prev, passport: file }));
                setState((prev) => ({
                  ...prev,
                  passportDocumentName: file?.name || "",
                }));
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

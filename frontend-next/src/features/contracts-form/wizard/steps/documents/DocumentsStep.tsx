import type { ContractFormState } from "@/features/contracts-form/types";

export interface DocumentsStepProps {
  state: ContractFormState;
  setState: React.Dispatch<React.SetStateAction<ContractFormState>>;
  reservationProof: File | null;
  setReservationProof: React.Dispatch<React.SetStateAction<File | null>>;
  supportDocs: File[];
  setSupportDocs: React.Dispatch<React.SetStateAction<File[]>>;
  updateFileInputState: (input: HTMLInputElement, hasFile: boolean) => void;
}

export function DocumentsStep({
  state,
  setState,
  reservationProof,
  setReservationProof,
  supportDocs,
  setSupportDocs,
  updateFileInputState,
}: DocumentsStepProps) {
  return (
    <div className="form-section-card">
      <h2 className="section-title">Adjuntos del Contrato</h2>
      <div className="contracts-grid">
        <label className="col-span-full">
          Comprobante de pago de reserva
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            key={reservationProof ? reservationProof.name : 'empty-reservationProof'}
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              updateFileInputState(event.target, !!file);
              setReservationProof(file);
            }}
          />
          {reservationProof ? (
            <ul className="simple-list">
              <li>{reservationProof.name}</li>
            </ul>
          ) : (
            <small>Sube el comprobante del dep&#243;sito de reserva. Ser&#225; visible para el admin al momento de aprobar.</small>
          )}
        </label>
        <label className="col-span-full">
          Documentos de soporte adicionales (opcional, m&#250;ltiple)
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            multiple
            key={supportDocs.length > 0 ? supportDocs.map(f => f.name).join(',') : 'empty-supportDocs'}
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              updateFileInputState(event.target, files.length > 0);
              setSupportDocs(files);
              setState((prev) => ({
                ...prev,
                contractDocumentsNames: files.map((file) => file.name),
              }));
            }}
          />
          {state.contractDocumentsNames.length ? (
            <ul className="simple-list">
              {state.contractDocumentsNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ) : (
            <small>No hay adjuntos aun.</small>
          )}
        </label>
      </div>
    </div>
  );
}

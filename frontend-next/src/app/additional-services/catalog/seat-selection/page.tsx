'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdditionalServicesContextHeader } from '@/components/additional-services-context-header';
import {
  addTemporarySeatSelectionLine,
  cancelTemporaryAdditionalServiceLineEdit,
  getSelectedAdditionalServicesParticipants,
  getTemporaryAdditionalServiceLineBeingEdited,
  replaceTemporaryAdditionalServiceLine,
  type SeatPreference,
} from '@/lib/additional-services-temporary-store';
import { useTemporaryAdditionalServiceEditCleanup } from '@/lib/use-temporary-additional-service-edit-cleanup';
import styles from '../baggage/baggage-form.module.css';

const SEAT_PREFERENCE_OPTIONS: Array<{
  value: SeatPreference;
  label: string;
}> = [
  { value: 'WINDOW', label: 'Ventana' },
  { value: 'AISLE', label: 'Pasillo' },
  { value: 'MIDDLE', label: 'Centro' },
  { value: 'EXIT_ROW', label: 'Fila de salida' },
  { value: 'FRONT_CABIN', label: 'Parte delantera de la cabina' },
  { value: 'EXTRA_LEGROOM', label: 'Espacio adicional para las piernas' },
  { value: 'NO_PREFERENCE', label: 'Sin preferencia' },
  { value: 'OTHER', label: 'Otra' },
];

type ValidationError = {
  field: 'seatPreference' | 'otherPreferenceDescription' | 'quantity';
  message: string;
};

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  background: '#fff',
  color: '#172554',
  font: 'inherit',
};

export default function SeatSelectionAdditionalFormPage() {
  useTemporaryAdditionalServiceEditCleanup();
  const router = useRouter();
  const [selectedParticipantIds] = useState(() =>
    getSelectedAdditionalServicesParticipants(),
  );
  const [editingLine] = useState(() =>
    getTemporaryAdditionalServiceLineBeingEdited('SEAT_SELECTION'),
  );
  const [seatPreference, setSeatPreference] =
    useState<SeatPreference | null>(
      () => editingLine?.seatPreference ?? null,
    );
  const [otherPreferenceDescription, setOtherPreferenceDescription] =
    useState(() => editingLine?.otherPreferenceDescription ?? '');
  const [quantity, setQuantity] = useState(() =>
    String(editingLine?.quantity ?? Math.max(1, selectedParticipantIds.length)),
  );
  const [notes, setNotes] = useState(() => editingLine?.notes ?? '');
  const [validationError, setValidationError] =
    useState<ValidationError | null>(null);

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedParticipantIds.length === 0) {
      return;
    }

    if (!seatPreference) {
      setValidationError({
        field: 'seatPreference',
        message: 'Seleccione una preferencia de asiento.',
      });
      return;
    }

    if (
      seatPreference === 'OTHER' &&
      !otherPreferenceDescription.trim()
    ) {
      setValidationError({
        field: 'otherPreferenceDescription',
        message: 'Ingrese la descripción de la preferencia de asiento.',
      });
      return;
    }

    const numericQuantity = Number(quantity);
    if (!Number.isInteger(numericQuantity) || numericQuantity < 1) {
      setValidationError({
        field: 'quantity',
        message: 'Ingrese una cantidad entera mayor o igual a 1.',
      });
      return;
    }

    const updatedLine = {
      participantId: editingLine?.participantId ?? '',
      serviceType: 'SEAT_SELECTION' as const,
      seatPreference,
      otherPreferenceDescription:
        seatPreference === 'OTHER'
          ? otherPreferenceDescription.trim()
          : null,
      quantity: numericQuantity,
      notes: notes.trim(),
    };

    if (editingLine) {
      replaceTemporaryAdditionalServiceLine(editingLine, updatedLine);
      router.push('/additional-services/order-summary');
      return;
    }

    selectedParticipantIds.forEach((participantId) => {
      addTemporarySeatSelectionLine({
        ...updatedLine,
        participantId,
      });
    });

    router.push('/additional-services/catalog');
  }

  return (
    <main className="app-shell">
      <div className={styles.page}>
        <AdditionalServicesContextHeader />
        <header className={styles.header}>
          <h1 className={styles.title}>Formulario de Selección de Asiento</h1>
          <p className={styles.subtitle}>
            Configure la preferencia para los participantes seleccionados.
          </p>
        </header>

        <section className="form-section-card" style={{ marginTop: 0 }}>
          {selectedParticipantIds.length === 0 ? (
            <div className={styles.participantError} role="alert">
              Debe seleccionar un participante antes de configurar la
              selección de asiento.
            </div>
          ) : (
            <form className={styles.form} onSubmit={submitForm} noValidate>
              <fieldset className={styles.fieldGroup}>
                <legend className={styles.label}>
                  Preferencia de asiento{' '}
                  <span className={styles.required}>*</span>
                </legend>
                <div className={styles.options}>
                  {SEAT_PREFERENCE_OPTIONS.map((option) => (
                    <label className={styles.option} key={option.value}>
                      <input
                        className={styles.checkbox}
                        type="radio"
                        name="seatPreference"
                        value={option.value}
                        checked={seatPreference === option.value}
                        onChange={() => {
                          setSeatPreference(option.value);
                          if (option.value !== 'OTHER') {
                            setOtherPreferenceDescription('');
                          }
                          setValidationError(null);
                        }}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                {validationError?.field === 'seatPreference' && (
                  <p className={styles.error} role="alert">
                    {validationError.message}
                  </p>
                )}
              </fieldset>

              {seatPreference === 'OTHER' && (
                <label className={styles.fieldGroup}>
                  <span className={styles.label}>
                    Descripción de preferencia de asiento{' '}
                    <span className={styles.required}>*</span>
                  </span>
                  <input
                    type="text"
                    value={otherPreferenceDescription}
                    onChange={(event) => {
                      setOtherPreferenceDescription(event.target.value);
                      setValidationError(null);
                    }}
                    style={inputStyle}
                  />
                  {validationError?.field ===
                    'otherPreferenceDescription' && (
                    <p className={styles.error} role="alert">
                      {validationError.message}
                    </p>
                  )}
                </label>
              )}

              <label className={styles.fieldGroup}>
                <span className={styles.label}>
                  Cantidad <span className={styles.required}>*</span>
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(event) => {
                    setQuantity(event.target.value);
                    setValidationError(null);
                  }}
                  style={inputStyle}
                />
                {validationError?.field === 'quantity' && (
                  <p className={styles.error} role="alert">
                    {validationError.message}
                  </p>
                )}
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.label}>Observaciones</span>
                <textarea
                  className={styles.textarea}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={5}
                />
              </label>

              <div className={styles.actions}>
                <Link
                  href={
                    editingLine
                      ? '/additional-services/order-summary'
                      : '/additional-services/catalog'
                  }
                  onClick={cancelTemporaryAdditionalServiceLineEdit}
                  className={`btn-secondary ${styles.actionLink}`}
                >
                  Cancelar
                </Link>
                <button type="submit" className="btn-primary">
                  {editingLine ? 'Guardar cambios' : 'Agregar a la orden'}
                </button>
              </div>
            </form>
          )}

          {selectedParticipantIds.length === 0 && (
            <div className={styles.actions}>
              <Link
                href="/additional-services"
                className={`btn-primary ${styles.actionLink}`}
              >
                Seleccionar participante
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

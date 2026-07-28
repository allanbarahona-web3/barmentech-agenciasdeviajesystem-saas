'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdditionalServicesContextHeader } from '@/components/additional-services-context-header';
import {
  addTemporaryTripReductionLine,
  cancelTemporaryAdditionalServiceLineEdit,
  getTemporaryAdditionalServiceEditReturnPath,
  getSelectedAdditionalServicesParticipants,
  getTemporaryAdditionalServiceLineBeingEdited,
  replaceTemporaryAdditionalServiceLine,
} from '@/lib/additional-services-temporary-store';
import { useTemporaryAdditionalServiceEditCleanup } from '@/lib/use-temporary-additional-service-edit-cleanup';
import { formatBusinessDate } from '@/shared/regional';
import styles from '../baggage/baggage-form.module.css';

type ValidationError = {
  field: 'newReturnDate' | 'quantity';
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

export default function TripReductionAdditionalFormPage() {
  useTemporaryAdditionalServiceEditCleanup();
  const router = useRouter();
  const [selectedParticipantIds] = useState(() =>
    getSelectedAdditionalServicesParticipants(),
  );
  const [editingLine] = useState(() =>
    getTemporaryAdditionalServiceLineBeingEdited('TRIP_REDUCTION'),
  );
  const [newReturnDate, setNewReturnDate] = useState(
    () => editingLine?.newReturnDate ?? '',
  );
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

    if (!newReturnDate) {
      setValidationError({
        field: 'newReturnDate',
        message: 'Seleccione la nueva fecha de regreso.',
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
      serviceType: 'TRIP_REDUCTION' as const,
      newReturnDate,
      quantity: numericQuantity,
      notes: notes.trim(),
    };

    if (editingLine) {
      replaceTemporaryAdditionalServiceLine(editingLine, updatedLine);
      router.push(getTemporaryAdditionalServiceEditReturnPath());
      return;
    }

    selectedParticipantIds.forEach((participantId) => {
      addTemporaryTripReductionLine({
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
          <h1 className={styles.title}>Formulario para Acortar Viaje</h1>
          <p className={styles.subtitle}>
            Configure la reducción para los participantes seleccionados.
          </p>
        </header>

        <section className="form-section-card" style={{ marginTop: 0 }}>
          {selectedParticipantIds.length === 0 ? (
            <div className={styles.participantError} role="alert">
              Debe seleccionar un participante antes de configurar la
              reducción del viaje.
            </div>
          ) : (
            <form className={styles.form} onSubmit={submitForm} noValidate>
              <label className={styles.fieldGroup}>
                <span className={styles.label}>
                  Nueva fecha de regreso{' '}
                  <span className={styles.required}>*</span>
                </span>
                <input
                  type="date"
                  value={newReturnDate}
                  onChange={(event) => {
                    setNewReturnDate(event.target.value);
                    setValidationError(null);
                  }}
                  style={inputStyle}
                />
                {newReturnDate && (
                  <small className={styles.subtitle}>
                    Fecha seleccionada: {formatBusinessDate(newReturnDate)}
                  </small>
                )}
                {validationError?.field === 'newReturnDate' && (
                  <p className={styles.error} role="alert">
                    {validationError.message}
                  </p>
                )}
              </label>

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

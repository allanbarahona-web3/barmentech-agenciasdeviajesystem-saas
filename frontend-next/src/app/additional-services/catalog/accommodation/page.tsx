'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdditionalServicesContextHeader } from '@/components/additional-services-context-header';
import {
  AdditionalServiceParticipantAssignment,
  useAdditionalServiceParticipantAssignment,
} from '@/components/additional-service-participant-assignment';
import {
  addTemporaryLodgingLine,
  cancelTemporaryAdditionalServiceLineEdit,
  getTemporaryAdditionalServiceEditReturnPath,
  getSelectedAdditionalServicesParticipants,
  getTemporaryAdditionalServiceLineBeingEdited,
  replaceTemporaryAdditionalServiceLine,
  type LodgingType,
} from '@/lib/additional-services-temporary-store';
import { useTemporaryAdditionalServiceEditCleanup } from '@/lib/use-temporary-additional-service-edit-cleanup';
import styles from '../baggage/baggage-form.module.css';

const LODGING_OPTIONS: Array<{ value: LodgingType; label: string }> = [
  { value: 'HOTEL_WITH_BREAKFAST', label: 'Hotel with Breakfast' },
  { value: 'HOTEL_WITHOUT_BREAKFAST', label: 'Hotel without Breakfast' },
  { value: 'HOSTEL', label: 'Hostel' },
  { value: 'AIRBNB', label: 'Airbnb' },
];

export default function LodgingAdditionalFormPage() {
  useTemporaryAdditionalServiceEditCleanup();
  const router = useRouter();
  const [quotationParticipantIds] = useState(() =>
    getSelectedAdditionalServicesParticipants(),
  );
  const [editingLine] = useState(() =>
    getTemporaryAdditionalServiceLineBeingEdited('LODGING'),
  );
  const participantAssignment = useAdditionalServiceParticipantAssignment(
    editingLine?.participantId,
  );
  const [lodgingType, setLodgingType] = useState<LodgingType | null>(
    () => editingLine?.lodgingType ?? null,
  );
  const [checkInDate, setCheckInDate] = useState(
    () => editingLine?.checkInDate ?? '',
  );
  const [checkOutDate, setCheckOutDate] = useState(
    () => editingLine?.checkOutDate ?? '',
  );
  const [notes, setNotes] = useState(() => editingLine?.notes ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingLine && !participantAssignment.validateSelection()) {
      return;
    }

    if (!lodgingType) {
      setValidationError('Seleccione un tipo de hospedaje.');
      return;
    }

    if (!checkInDate || !checkOutDate) {
      setValidationError('Seleccione las fechas de check-in y check-out.');
      return;
    }

    if (checkOutDate <= checkInDate) {
      setValidationError('La fecha de check-out debe ser posterior al check-in.');
      return;
    }

    if (editingLine) {
      replaceTemporaryAdditionalServiceLine(editingLine, {
        participantId: editingLine.participantId,
        serviceType: 'LODGING',
        lodgingType,
        checkInDate,
        checkOutDate,
        notes: notes.trim(),
      });
      router.push(getTemporaryAdditionalServiceEditReturnPath());
      return;
    }

    participantAssignment.selectedParticipantIds.forEach((participantId) => {
      addTemporaryLodgingLine({
        participantId,
        serviceType: 'LODGING',
        lodgingType,
        checkInDate,
        checkOutDate,
        notes: notes.trim(),
      });
    });
    router.push('/additional-services/catalog');
  }

  return (
    <main className="app-shell">
      <div className={styles.page}>
        <AdditionalServicesContextHeader />
        <header className={styles.header}>
          <h1 className={styles.title}>Formulario de Hospedaje</h1>
          <p className={styles.subtitle}>
            Configure el hospedaje para los participantes seleccionados.
          </p>
        </header>

        <section className="form-section-card" style={{ marginTop: 0 }}>
          {quotationParticipantIds.length === 0 ? (
            <div className={styles.participantError} role="alert">
              Debe seleccionar un participante antes de configurar el
              hospedaje.
            </div>
          ) : (
            <form className={styles.form} onSubmit={submitForm} noValidate>
              <fieldset className={styles.fieldGroup}>
                <legend className={styles.label}>
                  Tipo de hospedaje <span className={styles.required}>*</span>
                </legend>
                <div className={styles.options}>
                  {LODGING_OPTIONS.map((option) => (
                    <label className={styles.option} key={option.value}>
                      <input
                        className={styles.checkbox}
                        type="radio"
                        name="lodgingType"
                        value={option.value}
                        checked={lodgingType === option.value}
                        onChange={() => {
                          setLodgingType(option.value);
                          setValidationError(null);
                        }}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                {validationError && (
                  <p className={styles.error} role="alert">
                    {validationError}
                  </p>
                )}
              </fieldset>

              <label className={styles.fieldGroup}>
                <span className={styles.label}>
                  Fecha de check-in <span className={styles.required}>*</span>
                </span>
                <input
                  className={styles.input}
                  type="date"
                  value={checkInDate}
                  onChange={(event) => {
                    setCheckInDate(event.target.value);
                    setValidationError(null);
                  }}
                />
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.label}>
                  Fecha de check-out <span className={styles.required}>*</span>
                </span>
                <input
                  className={styles.input}
                  type="date"
                  min={checkInDate || undefined}
                  value={checkOutDate}
                  onChange={(event) => {
                    setCheckOutDate(event.target.value);
                    setValidationError(null);
                  }}
                />
                {validationError && (
                  <p className={styles.error} role="alert">
                    {validationError}
                  </p>
                )}
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.label}>Notes</span>
                <textarea
                  className={styles.textarea}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={5}
                />
              </label>

              <AdditionalServiceParticipantAssignment
                assignment={participantAssignment}
                readOnly={Boolean(editingLine)}
              />
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
                  Cancel
                </Link>
                <button type="submit" className="btn-primary">
                  {editingLine ? 'Guardar cambios' : 'Add to Order'}
                </button>
              </div>
            </form>
          )}

          {quotationParticipantIds.length === 0 && (
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

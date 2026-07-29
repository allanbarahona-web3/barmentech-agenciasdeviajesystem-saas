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
  addTemporaryAccommodationTypeLine,
  cancelTemporaryAdditionalServiceLineEdit,
  getTemporaryAdditionalServiceEditReturnPath,
  type AccommodationType,
  getSelectedAdditionalServicesParticipants,
  getTemporaryAdditionalServiceLineBeingEdited,
  replaceTemporaryAdditionalServiceLine,
} from '@/lib/additional-services-temporary-store';
import { useTemporaryAdditionalServiceEditCleanup } from '@/lib/use-temporary-additional-service-edit-cleanup';
import styles from '../baggage/baggage-form.module.css';

const ACCOMMODATION_TYPE_OPTIONS: Array<{
  value: AccommodationType;
  label: string;
}> = [
  { value: 'SINGLE', label: 'Sencilla' },
  { value: 'DOUBLE', label: 'Doble' },
  { value: 'TRIPLE', label: 'Triple' },
  { value: 'QUADRUPLE', label: 'Cuádruple' },
];

export default function AccommodationTypeAdditionalFormPage() {
  useTemporaryAdditionalServiceEditCleanup();
  const router = useRouter();
  const [quotationParticipantIds] = useState(() =>
    getSelectedAdditionalServicesParticipants(),
  );
  const [editingLine] = useState(() =>
    getTemporaryAdditionalServiceLineBeingEdited('ACCOMMODATION_TYPE'),
  );
  const participantAssignment = useAdditionalServiceParticipantAssignment(
    editingLine?.participantId,
  );
  const [accommodationType, setAccommodationType] =
    useState<AccommodationType | null>(
      () => editingLine?.accommodationType ?? null,
    );
  const [notes, setNotes] = useState(() => editingLine?.notes ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingLine && !participantAssignment.validateSelection()) {
      return;
    }

    if (!accommodationType) {
      setValidationError('Seleccione un tipo de acomodación.');
      return;
    }

    if (editingLine) {
      replaceTemporaryAdditionalServiceLine(editingLine, {
        participantId: editingLine.participantId,
        serviceType: 'ACCOMMODATION_TYPE',
        accommodationType,
        notes: notes.trim(),
      });
      router.push(getTemporaryAdditionalServiceEditReturnPath());
      return;
    }

    participantAssignment.selectedParticipantIds.forEach((participantId) => {
      addTemporaryAccommodationTypeLine({
        participantId,
        serviceType: 'ACCOMMODATION_TYPE',
        accommodationType,
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
          <h1 className={styles.title}>Formulario de Acomodación</h1>
          <p className={styles.subtitle}>
            Configure el tipo de acomodación para los participantes
            seleccionados.
          </p>
        </header>

        <section className="form-section-card" style={{ marginTop: 0 }}>
          {quotationParticipantIds.length === 0 ? (
            <div className={styles.participantError} role="alert">
              Debe seleccionar un participante antes de configurar la
              acomodación.
            </div>
          ) : (
            <form className={styles.form} onSubmit={submitForm} noValidate>
              <fieldset className={styles.fieldGroup}>
                <legend className={styles.label}>
                  Tipo de acomodación{' '}
                  <span className={styles.required}>*</span>
                </legend>
                <div className={styles.options}>
                  {ACCOMMODATION_TYPE_OPTIONS.map((option) => (
                    <label className={styles.option} key={option.value}>
                      <input
                        className={styles.checkbox}
                        type="radio"
                        name="accommodationType"
                        value={option.value}
                        checked={accommodationType === option.value}
                        onChange={() => {
                          setAccommodationType(option.value);
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
                <span className={styles.label}>Observaciones</span>
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
                  Cancelar
                </Link>
                <button type="submit" className="btn-primary">
                  {editingLine ? 'Guardar cambios' : 'Agregar a la orden'}
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

'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdditionalServicesContextHeader } from '@/components/additional-services-context-header';
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
  const [selectedParticipantIds] = useState(() =>
    getSelectedAdditionalServicesParticipants(),
  );
  const [editingLine] = useState(() =>
    getTemporaryAdditionalServiceLineBeingEdited('LODGING'),
  );
  const [lodgingType, setLodgingType] = useState<LodgingType | null>(
    () => editingLine?.lodgingType ?? null,
  );
  const [notes, setNotes] = useState(() => editingLine?.notes ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedParticipantIds.length === 0) {
      return;
    }

    if (!lodgingType) {
      setValidationError('Seleccione un tipo de hospedaje.');
      return;
    }

    if (editingLine) {
      replaceTemporaryAdditionalServiceLine(editingLine, {
        participantId: editingLine.participantId,
        serviceType: 'LODGING',
        lodgingType,
        notes: notes.trim(),
      });
      router.push(getTemporaryAdditionalServiceEditReturnPath());
      return;
    }

    selectedParticipantIds.forEach((participantId) => {
      addTemporaryLodgingLine({
        participantId,
        serviceType: 'LODGING',
        lodgingType,
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
          {selectedParticipantIds.length === 0 ? (
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
                <span className={styles.label}>Notes</span>
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
                  Cancel
                </Link>
                <button type="submit" className="btn-primary">
                  {editingLine ? 'Guardar cambios' : 'Add to Order'}
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

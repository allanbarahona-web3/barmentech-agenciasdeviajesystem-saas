'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdditionalServicesContextHeader } from '@/components/additional-services-context-header';
import {
  addTemporaryBaggageLine,
  cancelTemporaryAdditionalServiceLineEdit,
  getTemporaryAdditionalServiceLineBeingEdited,
  replaceTemporaryAdditionalServiceLine,
  type BaggageType,
  getSelectedAdditionalServicesParticipants,
} from '@/lib/additional-services-temporary-store';
import { useTemporaryAdditionalServiceEditCleanup } from '@/lib/use-temporary-additional-service-edit-cleanup';
import styles from './baggage-form.module.css';

const BAGGAGE_OPTIONS: Array<{ value: BaggageType; label: string }> = [
  { value: 'CARRY_ON', label: 'Carry On' },
  { value: 'HAND_BAGGAGE', label: 'Equipaje de Mano' },
  { value: 'CHECKED_BAGGAGE', label: 'Equipaje Documentado' },
];

export default function BaggageAdditionalFormPage() {
  useTemporaryAdditionalServiceEditCleanup();
  const router = useRouter();
  const [selectedParticipantIds] = useState(() =>
    getSelectedAdditionalServicesParticipants(),
  );
  const [editingLine] = useState(() =>
    getTemporaryAdditionalServiceLineBeingEdited('BAGGAGE'),
  );
  const [baggageTypes, setBaggageTypes] = useState<BaggageType[]>(
    () => editingLine?.baggageTypes ?? [],
  );
  const [notes, setNotes] = useState(() => editingLine?.notes ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  function toggleBaggageType(type: BaggageType) {
    setBaggageTypes((current) =>
      current.includes(type)
        ? current.filter((currentType) => currentType !== type)
        : [...current, type],
    );
    setValidationError(null);
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedParticipantIds.length === 0) {
      return;
    }

    if (baggageTypes.length === 0) {
      setValidationError('Seleccione al menos un tipo de equipaje.');
      return;
    }

    if (editingLine) {
      replaceTemporaryAdditionalServiceLine(editingLine, {
        participantId: editingLine.participantId,
        serviceType: 'BAGGAGE',
        baggageTypes: [...baggageTypes],
        notes: notes.trim(),
      });
      router.push('/additional-services/order-summary');
      return;
    }

    selectedParticipantIds.forEach((participantId) => {
      addTemporaryBaggageLine({
        participantId,
        serviceType: 'BAGGAGE',
        baggageTypes: [...baggageTypes],
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
          <h1 className={styles.title}>Formulario de Equipaje</h1>
          <p className={styles.subtitle}>
            Configure el equipaje adicional para el participante seleccionado.
          </p>
        </header>

        <section className="form-section-card" style={{ marginTop: 0 }}>
          {selectedParticipantIds.length === 0 ? (
            <div className={styles.participantError} role="alert">
              Debe seleccionar un participante antes de configurar el equipaje.
            </div>
          ) : (
            <form className={styles.form} onSubmit={submitForm} noValidate>
              <fieldset className={styles.fieldGroup}>
                <legend className={styles.label}>
                  Tipo de equipaje <span className={styles.required}>*</span>
                </legend>
                <div className={styles.options}>
                  {BAGGAGE_OPTIONS.map((option) => (
                    <label className={styles.option} key={option.value}>
                      <input
                        className={styles.checkbox}
                        type="checkbox"
                        checked={baggageTypes.includes(option.value)}
                        onChange={() => toggleBaggageType(option.value)}
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

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
  addTemporaryBaggageLine,
  cancelTemporaryAdditionalServiceLineEdit,
  getTemporaryAdditionalServiceEditReturnPath,
  getTemporaryAdditionalServiceLineBeingEdited,
  replaceTemporaryAdditionalServiceLine,
  type BaggageTripScope,
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

const TRIP_SCOPE_OPTIONS: Array<{
  value: BaggageTripScope;
  label: string;
}> = [
  { value: 'SINGLE_TRIP', label: 'Un solo trayecto' },
  { value: 'MULTIPLE_TRIPS', label: 'Múltiples trayectos' },
];

export default function BaggageAdditionalFormPage() {
  useTemporaryAdditionalServiceEditCleanup();
  const router = useRouter();
  const [quotationParticipantIds] = useState(() =>
    getSelectedAdditionalServicesParticipants(),
  );
  const [editingLine] = useState(() =>
    getTemporaryAdditionalServiceLineBeingEdited('BAGGAGE'),
  );
  const participantAssignment = useAdditionalServiceParticipantAssignment(
    editingLine?.participantId,
  );
  const [baggageTypes, setBaggageTypes] = useState<BaggageType[]>(
    () => editingLine?.baggageTypes ?? [],
  );
  const [tripScope, setTripScope] = useState<BaggageTripScope | null>(
    () => editingLine?.tripScope ?? null,
  );
  const [pieceQuantity, setPieceQuantity] = useState(
    () => String(editingLine?.pieceQuantity ?? ''),
  );
  const [weightKg, setWeightKg] = useState(
    () => String(editingLine?.weightKg ?? ''),
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

    if (!editingLine && !participantAssignment.validateSelection()) {
      return;
    }

    if (baggageTypes.length === 0) {
      setValidationError('Seleccione al menos un tipo de equipaje.');
      return;
    }

    if (!tripScope) {
      setValidationError('Seleccione el alcance del equipaje.');
      return;
    }

    const numericPieceQuantity = Number(pieceQuantity);
    if (!Number.isInteger(numericPieceQuantity) || numericPieceQuantity < 1) {
      setValidationError('Ingrese una cantidad de piezas entera mayor o igual a 1.');
      return;
    }

    const numericWeightKg = Number(weightKg);
    if (!Number.isFinite(numericWeightKg) || numericWeightKg <= 0) {
      setValidationError('Ingrese un peso mayor que 0 kg.');
      return;
    }

    if (editingLine) {
      replaceTemporaryAdditionalServiceLine(editingLine, {
        participantId: editingLine.participantId,
        serviceType: 'BAGGAGE',
        baggageTypes: [...baggageTypes],
        tripScope,
        pieceQuantity: numericPieceQuantity,
        weightKg: numericWeightKg,
        notes: notes.trim(),
      });
      router.push(getTemporaryAdditionalServiceEditReturnPath());
      return;
    }

    participantAssignment.selectedParticipantIds.forEach((participantId) => {
      addTemporaryBaggageLine({
        participantId,
        serviceType: 'BAGGAGE',
        baggageTypes: [...baggageTypes],
        tripScope,
        pieceQuantity: numericPieceQuantity,
        weightKg: numericWeightKg,
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
          {quotationParticipantIds.length === 0 ? (
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

              <fieldset className={styles.fieldGroup}>
                <legend className={styles.label}>
                  Alcance del equipaje{' '}
                  <span className={styles.required}>*</span>
                </legend>
                <div className={styles.options}>
                  {TRIP_SCOPE_OPTIONS.map((option) => (
                    <label className={styles.option} key={option.value}>
                      <input
                        className={styles.checkbox}
                        type="radio"
                        name="tripScope"
                        value={option.value}
                        checked={tripScope === option.value}
                        onChange={() => {
                          setTripScope(option.value);
                          setValidationError(null);
                        }}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className={styles.fieldGroup}>
                <span className={styles.label}>
                  Cantidad de piezas <span className={styles.required}>*</span>
                </span>
                <input
                  className={styles.input}
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={pieceQuantity}
                  onChange={(event) => {
                    setPieceQuantity(event.target.value);
                    setValidationError(null);
                  }}
                />
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.label}>
                  Peso (kg) <span className={styles.required}>*</span>
                </span>
                <input
                  className={styles.input}
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={weightKg}
                  onChange={(event) => {
                    setWeightKg(event.target.value);
                    setValidationError(null);
                  }}
                />
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

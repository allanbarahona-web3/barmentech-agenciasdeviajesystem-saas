'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdditionalServicesContextHeader } from '@/components/additional-services-context-header';
import {
  addTemporaryInsuranceLine,
  cancelTemporaryAdditionalServiceLineEdit,
  getSelectedAdditionalServicesParticipants,
  getTemporaryAdditionalServiceLineBeingEdited,
  replaceTemporaryAdditionalServiceLine,
  type InsuranceCoverage,
} from '@/lib/additional-services-temporary-store';
import { useTemporaryAdditionalServiceEditCleanup } from '@/lib/use-temporary-additional-service-edit-cleanup';
import sharedStyles from '../baggage/baggage-form.module.css';
import styles from './insurance-form.module.css';

const TENANT_CURRENCY = 'USD' as const;

const COVERAGE_OPTIONS: Array<{
  value: InsuranceCoverage;
  label: string;
}> = [
  { value: 'USD_35000', label: 'USD 35,000.00' },
  { value: 'USD_60000', label: 'USD 60,000.00' },
  { value: 'OTHER', label: 'Otro' },
];

function formatCoverageAmount(value: string) {
  if (!value) return '';

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export default function InsuranceAdditionalFormPage() {
  useTemporaryAdditionalServiceEditCleanup();
  const router = useRouter();
  const [selectedParticipantIds] = useState(() =>
    getSelectedAdditionalServicesParticipants(),
  );
  const [editingLine] = useState(() =>
    getTemporaryAdditionalServiceLineBeingEdited('INSURANCE'),
  );
  const [coverage, setCoverage] = useState<InsuranceCoverage | null>(
    () => editingLine?.coverage ?? null,
  );
  const [customCoverageDigits, setCustomCoverageDigits] = useState(() =>
    editingLine?.customCoverageAmount
      ? String(editingLine.customCoverageAmount)
      : '',
  );
  const [editingCustomCoverage, setEditingCustomCoverage] = useState(false);
  const [notes, setNotes] = useState(() => editingLine?.notes ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  function selectCoverage(value: InsuranceCoverage) {
    setCoverage(value);
    setValidationError(null);

    if (value !== 'OTHER') {
      setCustomCoverageDigits('');
      setEditingCustomCoverage(false);
    }
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedParticipantIds.length === 0) {
      return;
    }

    if (!coverage) {
      setValidationError('Seleccione una cobertura.');
      return;
    }

    if (
      coverage === 'OTHER' &&
      (!customCoverageDigits || Number(customCoverageDigits) <= 0)
    ) {
      setValidationError('Ingrese el monto de cobertura.');
      return;
    }

    const customCoverageAmount =
      coverage === 'OTHER' ? Number(customCoverageDigits) : null;

    if (editingLine) {
      replaceTemporaryAdditionalServiceLine(editingLine, {
        participantId: editingLine.participantId,
        serviceType: 'INSURANCE',
        coverage,
        customCoverageAmount,
        currency: TENANT_CURRENCY,
        notes: notes.trim(),
      });
      router.push('/additional-services/order-summary');
      return;
    }

    selectedParticipantIds.forEach((participantId) => {
      addTemporaryInsuranceLine({
        participantId,
        serviceType: 'INSURANCE',
        coverage,
        customCoverageAmount,
        currency: TENANT_CURRENCY,
        notes: notes.trim(),
      });
    });
    router.push('/additional-services/catalog');
  }

  return (
    <main className="app-shell">
      <div className={sharedStyles.page}>
        <AdditionalServicesContextHeader />
        <header className={sharedStyles.header}>
          <h1 className={sharedStyles.title}>Formulario de Seguro de Viaje</h1>
          <p className={sharedStyles.subtitle}>
            Configure la cobertura para los participantes seleccionados.
          </p>
        </header>

        <section className="form-section-card" style={{ marginTop: 0 }}>
          {selectedParticipantIds.length === 0 ? (
            <div className={sharedStyles.participantError} role="alert">
              Debe seleccionar un participante antes de configurar el seguro.
            </div>
          ) : (
            <form
              className={sharedStyles.form}
              onSubmit={submitForm}
              noValidate
            >
              <fieldset className={sharedStyles.fieldGroup}>
                <legend className={sharedStyles.label}>
                  Cobertura <span className={sharedStyles.required}>*</span>
                </legend>
                <div className={sharedStyles.options}>
                  {COVERAGE_OPTIONS.map((option) => (
                    <label className={sharedStyles.option} key={option.value}>
                      <input
                        className={sharedStyles.checkbox}
                        type="radio"
                        name="coverage"
                        value={option.value}
                        checked={coverage === option.value}
                        onChange={() => selectCoverage(option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                {validationError && coverage !== 'OTHER' && (
                  <p className={sharedStyles.error} role="alert">
                    {validationError}
                  </p>
                )}
              </fieldset>

              {coverage === 'OTHER' && (
                <label className={sharedStyles.fieldGroup}>
                  <span className={sharedStyles.label}>
                    Monto de cobertura{' '}
                    <span className={sharedStyles.required}>*</span>
                  </span>
                  <span className={styles.currencyField}>
                    <span className={styles.currencyCode}>
                      {TENANT_CURRENCY}
                    </span>
                    <input
                      className={styles.amountInput}
                      type="text"
                      inputMode="numeric"
                      value={
                        editingCustomCoverage
                          ? customCoverageDigits
                          : formatCoverageAmount(customCoverageDigits)
                      }
                      onFocus={() => setEditingCustomCoverage(true)}
                      onBlur={() => setEditingCustomCoverage(false)}
                      onChange={(event) => {
                        setCustomCoverageDigits(
                          event.target.value.replace(/\D/g, ''),
                        );
                        setValidationError(null);
                      }}
                      aria-describedby="custom-coverage-help"
                    />
                  </span>
                  <small
                    id="custom-coverage-help"
                    className={sharedStyles.subtitle}
                  >
                    Ingrese un monto entero.
                  </small>
                  {validationError && (
                    <p className={sharedStyles.error} role="alert">
                      {validationError}
                    </p>
                  )}
                </label>
              )}

              <label className={sharedStyles.fieldGroup}>
                <span className={sharedStyles.label}>Observaciones</span>
                <textarea
                  className={sharedStyles.textarea}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={5}
                />
              </label>

              <div className={sharedStyles.actions}>
                <Link
                  href={
                    editingLine
                      ? '/additional-services/order-summary'
                      : '/additional-services/catalog'
                  }
                  onClick={cancelTemporaryAdditionalServiceLineEdit}
                  className={`btn-secondary ${sharedStyles.actionLink}`}
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
            <div className={sharedStyles.actions}>
              <Link
                href="/additional-services"
                className={`btn-primary ${sharedStyles.actionLink}`}
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

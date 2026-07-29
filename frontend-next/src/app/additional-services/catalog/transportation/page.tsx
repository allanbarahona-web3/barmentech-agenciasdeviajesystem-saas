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
  addTemporaryTransportationLine,
  cancelTemporaryAdditionalServiceLineEdit,
  getTemporaryAdditionalServiceEditReturnPath,
  getSelectedAdditionalServicesParticipants,
  getTemporaryAdditionalServiceLineBeingEdited,
  replaceTemporaryAdditionalServiceLine,
  type TransportationType,
} from '@/lib/additional-services-temporary-store';
import { useTemporaryAdditionalServiceEditCleanup } from '@/lib/use-temporary-additional-service-edit-cleanup';
import { formatBusinessDate } from '@/shared/regional';
import styles from '../baggage/baggage-form.module.css';

const TRANSPORTATION_OPTIONS: Array<{
  value: TransportationType;
  label: string;
}> = [
  { value: 'AIRPLANE', label: 'Avión' },
  { value: 'UBER', label: 'Uber' },
  { value: 'TAXI', label: 'Taxi' },
  { value: 'TRAIN', label: 'Tren' },
  { value: 'FERRY', label: 'Ferry' },
  { value: 'SHUTTLE_BUS', label: 'Buseta (Bus)' },
  { value: 'PRIVATE_TRANSPORT', label: 'Transporte privado' },
];

type ValidationError = {
  field: 'transportationType' | 'serviceDate';
  message: string;
};

export default function TransportationAdditionalFormPage() {
  useTemporaryAdditionalServiceEditCleanup();
  const router = useRouter();
  const [quotationParticipantIds] = useState(() =>
    getSelectedAdditionalServicesParticipants(),
  );
  const [editingLine] = useState(() =>
    getTemporaryAdditionalServiceLineBeingEdited('TRANSPORTATION'),
  );
  const participantAssignment = useAdditionalServiceParticipantAssignment(
    editingLine?.participantId,
  );
  const [transportationType, setTransportationType] =
    useState<TransportationType | null>(
      () => editingLine?.transportationType ?? null,
    );
  const [serviceDate, setServiceDate] = useState(
    () => editingLine?.serviceDate ?? '',
  );
  const [notes, setNotes] = useState(() => editingLine?.notes ?? '');
  const [validationError, setValidationError] =
    useState<ValidationError | null>(null);

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingLine && !participantAssignment.validateSelection()) {
      return;
    }

    if (!transportationType) {
      setValidationError({
        field: 'transportationType',
        message: 'Seleccione un tipo de transporte.',
      });
      return;
    }

    if (!serviceDate) {
      setValidationError({
        field: 'serviceDate',
        message: 'Seleccione la fecha del servicio.',
      });
      return;
    }

    if (editingLine) {
      replaceTemporaryAdditionalServiceLine(editingLine, {
        participantId: editingLine.participantId,
        serviceType: 'TRANSPORTATION',
        transportationType,
        serviceDate,
        notes: notes.trim(),
      });
      router.push(getTemporaryAdditionalServiceEditReturnPath());
      return;
    }

    participantAssignment.selectedParticipantIds.forEach((participantId) => {
      addTemporaryTransportationLine({
        participantId,
        serviceType: 'TRANSPORTATION',
        transportationType,
        serviceDate,
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
          <h1 className={styles.title}>Formulario de Transporte</h1>
          <p className={styles.subtitle}>
            Configure el transporte para los participantes seleccionados.
          </p>
        </header>

        <section className="form-section-card" style={{ marginTop: 0 }}>
          {quotationParticipantIds.length === 0 ? (
            <div className={styles.participantError} role="alert">
              Debe seleccionar un participante antes de configurar el
              transporte.
            </div>
          ) : (
            <form className={styles.form} onSubmit={submitForm} noValidate>
              <fieldset className={styles.fieldGroup}>
                <legend className={styles.label}>
                  Tipo de transporte <span className={styles.required}>*</span>
                </legend>
                <div className={styles.options}>
                  {TRANSPORTATION_OPTIONS.map((option) => (
                    <label className={styles.option} key={option.value}>
                      <input
                        className={styles.checkbox}
                        type="radio"
                        name="transportationType"
                        value={option.value}
                        checked={transportationType === option.value}
                        onChange={() => {
                          setTransportationType(option.value);
                          setValidationError(null);
                        }}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                {validationError?.field === 'transportationType' && (
                  <p className={styles.error} role="alert">
                    {validationError.message}
                  </p>
                )}
              </fieldset>

              <label className={styles.fieldGroup}>
                <span className={styles.label}>
                  Fecha del servicio <span className={styles.required}>*</span>
                </span>
                <input
                  type="date"
                  value={serviceDate}
                  onChange={(event) => {
                    setServiceDate(event.target.value);
                    setValidationError(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    background: '#fff',
                    color: '#172554',
                    font: 'inherit',
                  }}
                />
                {serviceDate && (
                  <small className={styles.subtitle}>
                    Fecha seleccionada: {formatBusinessDate(serviceDate)}
                  </small>
                )}
                {validationError?.field === 'serviceDate' && (
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

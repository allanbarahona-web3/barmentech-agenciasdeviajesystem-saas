'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdditionalServicesContextHeader } from '@/components/additional-services-context-header';
import {
  addTemporaryTourLine,
  getSelectedAdditionalServicesParticipants,
} from '@/lib/additional-services-temporary-store';
import { formatBusinessDate } from '@/shared/regional';
import styles from '../baggage/baggage-form.module.css';

type ValidationError = {
  field: 'tourName' | 'serviceDate';
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

export default function TourAdditionalFormPage() {
  const router = useRouter();
  const [selectedParticipantIds] = useState(() =>
    getSelectedAdditionalServicesParticipants(),
  );
  const [tourName, setTourName] = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] =
    useState<ValidationError | null>(null);

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedParticipantIds.length === 0) {
      return;
    }

    if (!tourName.trim()) {
      setValidationError({
        field: 'tourName',
        message: 'Ingrese el nombre del tour.',
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

    selectedParticipantIds.forEach((participantId) => {
      addTemporaryTourLine({
        participantId,
        serviceType: 'TOUR',
        tourName: tourName.trim(),
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
          <h1 className={styles.title}>Formulario de Tour</h1>
          <p className={styles.subtitle}>
            Configure el tour para los participantes seleccionados.
          </p>
        </header>

        <section className="form-section-card" style={{ marginTop: 0 }}>
          {selectedParticipantIds.length === 0 ? (
            <div className={styles.participantError} role="alert">
              Debe seleccionar un participante antes de configurar el tour.
            </div>
          ) : (
            <form className={styles.form} onSubmit={submitForm} noValidate>
              <label className={styles.fieldGroup}>
                <span className={styles.label}>
                  Nombre del tour <span className={styles.required}>*</span>
                </span>
                <input
                  type="text"
                  value={tourName}
                  onChange={(event) => {
                    setTourName(event.target.value);
                    setValidationError(null);
                  }}
                  style={inputStyle}
                />
                {validationError?.field === 'tourName' && (
                  <p className={styles.error} role="alert">
                    {validationError.message}
                  </p>
                )}
              </label>

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
                  style={inputStyle}
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

              <div className={styles.actions}>
                <Link
                  href="/additional-services/catalog"
                  className={`btn-secondary ${styles.actionLink}`}
                >
                  Cancelar
                </Link>
                <button type="submit" className="btn-primary">
                  Agregar a la orden
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

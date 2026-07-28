'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdditionalServicesContextHeader } from '@/components/additional-services-context-header';
import {
  addTemporaryEventTicketLine,
  getSelectedAdditionalServicesParticipants,
} from '@/lib/additional-services-temporary-store';
import { formatBusinessDate } from '@/shared/regional';
import styles from '../baggage/baggage-form.module.css';

type ValidationError = {
  field: 'eventName' | 'serviceDate' | 'quantity';
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

export default function EventTicketsAdditionalFormPage() {
  const router = useRouter();
  const [selectedParticipantIds] = useState(() =>
    getSelectedAdditionalServicesParticipants(),
  );
  const [eventName, setEventName] = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [quantity, setQuantity] = useState(() =>
    String(Math.max(1, selectedParticipantIds.length)),
  );
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] =
    useState<ValidationError | null>(null);

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedParticipantIds.length === 0) {
      return;
    }

    if (!eventName.trim()) {
      setValidationError({
        field: 'eventName',
        message: 'Ingrese el nombre del evento o atracción.',
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

    const numericQuantity = Number(quantity);
    if (!Number.isInteger(numericQuantity) || numericQuantity < 1) {
      setValidationError({
        field: 'quantity',
        message: 'Ingrese una cantidad entera mayor o igual a 1.',
      });
      return;
    }

    selectedParticipantIds.forEach((participantId) => {
      addTemporaryEventTicketLine({
        participantId,
        serviceType: 'EVENT_TICKET',
        eventName: eventName.trim(),
        serviceDate,
        quantity: numericQuantity,
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
          <h1 className={styles.title}>Formulario de Boletos para Eventos</h1>
          <p className={styles.subtitle}>
            Configure los boletos para los participantes seleccionados.
          </p>
        </header>

        <section className="form-section-card" style={{ marginTop: 0 }}>
          {selectedParticipantIds.length === 0 ? (
            <div className={styles.participantError} role="alert">
              Debe seleccionar un participante antes de configurar los
              boletos para eventos.
            </div>
          ) : (
            <form className={styles.form} onSubmit={submitForm} noValidate>
              <label className={styles.fieldGroup}>
                <span className={styles.label}>
                  Nombre del evento <span className={styles.required}>*</span>
                </span>
                <input
                  type="text"
                  value={eventName}
                  onChange={(event) => {
                    setEventName(event.target.value);
                    setValidationError(null);
                  }}
                  style={inputStyle}
                />
                {validationError?.field === 'eventName' && (
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

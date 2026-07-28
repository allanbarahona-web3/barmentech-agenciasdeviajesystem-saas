'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AirportSearchField } from '@/components/airport-search-field';
import { AdditionalServicesContextHeader } from '@/components/additional-services-context-header';
import {
  addTemporaryFlightTicketLine,
  cancelTemporaryAdditionalServiceLineEdit,
  getSelectedAdditionalServicesParticipants,
  getTemporaryAdditionalServiceLineBeingEdited,
  replaceTemporaryAdditionalServiceLine,
  type FlightTripType,
} from '@/lib/additional-services-temporary-store';
import { useTemporaryAdditionalServiceEditCleanup } from '@/lib/use-temporary-additional-service-edit-cleanup';
import type { Airport } from '@/shared/airports';
import { formatBusinessDate } from '@/shared/regional';
import styles from '../baggage/baggage-form.module.css';

type Field =
  | 'tripType'
  | 'originAirport'
  | 'destinationAirport'
  | 'departureDate'
  | 'returnDate'
  | 'quantity';

type ValidationError = {
  field: Field;
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

const TRIP_TYPE_OPTIONS: Array<{
  value: FlightTripType;
  label: string;
}> = [
  { value: 'ONE_WAY', label: 'Solo ida' },
  { value: 'ROUND_TRIP', label: 'Ida y vuelta' },
];

export default function FlightTicketsAdditionalFormPage() {
  useTemporaryAdditionalServiceEditCleanup();
  const router = useRouter();
  const [selectedParticipantIds] = useState(() =>
    getSelectedAdditionalServicesParticipants(),
  );
  const [editingLine] = useState(() =>
    getTemporaryAdditionalServiceLineBeingEdited('FLIGHT_TICKET'),
  );
  const [tripType, setTripType] = useState<FlightTripType | null>(
    () => editingLine?.tripType ?? null,
  );
  const [originAirport, setOriginAirport] = useState<Airport | null>(
    () => editingLine?.originAirport ?? null,
  );
  const [destinationAirport, setDestinationAirport] =
    useState<Airport | null>(() => editingLine?.destinationAirport ?? null);
  const [departureDate, setDepartureDate] = useState(
    () => editingLine?.departureDate ?? '',
  );
  const [returnDate, setReturnDate] = useState(
    () => editingLine?.returnDate ?? '',
  );
  const [quantity, setQuantity] = useState(() =>
    String(editingLine?.quantity ?? Math.max(1, selectedParticipantIds.length)),
  );
  const [notes, setNotes] = useState(() => editingLine?.notes ?? '');
  const [validationError, setValidationError] =
    useState<ValidationError | null>(null);

  function clearError(field: Field) {
    if (validationError?.field === field) {
      setValidationError(null);
    }
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedParticipantIds.length === 0) {
      return;
    }

    if (!tripType) {
      setValidationError({
        field: 'tripType',
        message: 'Seleccione el tipo de viaje.',
      });
      return;
    }

    if (!originAirport) {
      setValidationError({
        field: 'originAirport',
        message: 'Seleccione un aeropuerto de origen de la lista.',
      });
      return;
    }

    if (!destinationAirport) {
      setValidationError({
        field: 'destinationAirport',
        message: 'Seleccione un aeropuerto de destino de la lista.',
      });
      return;
    }

    if (!departureDate) {
      setValidationError({
        field: 'departureDate',
        message: 'Seleccione la fecha de salida.',
      });
      return;
    }

    if (tripType === 'ROUND_TRIP' && !returnDate) {
      setValidationError({
        field: 'returnDate',
        message: 'Seleccione la fecha de regreso.',
      });
      return;
    }

    const numericQuantity = Number(quantity);
    if (
      !Number.isInteger(numericQuantity) ||
      numericQuantity < 1
    ) {
      setValidationError({
        field: 'quantity',
        message: 'Ingrese una cantidad entera mayor o igual a 1.',
      });
      return;
    }

    const updatedLine = {
      participantId: editingLine?.participantId ?? '',
      serviceType: 'FLIGHT_TICKET' as const,
      tripType,
      originAirport,
      destinationAirport,
      departureDate,
      returnDate: tripType === 'ROUND_TRIP' ? returnDate : null,
      quantity: numericQuantity,
      notes: notes.trim(),
    };

    if (editingLine) {
      replaceTemporaryAdditionalServiceLine(editingLine, updatedLine);
      router.push('/additional-services/order-summary');
      return;
    }

    selectedParticipantIds.forEach((participantId) => {
      addTemporaryFlightTicketLine({
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
          <h1 className={styles.title}>Formulario de Boletos Aéreos</h1>
          <p className={styles.subtitle}>
            Configure los boletos para los participantes seleccionados.
          </p>
        </header>

        <section className="form-section-card" style={{ marginTop: 0 }}>
          {selectedParticipantIds.length === 0 ? (
            <div className={styles.participantError} role="alert">
              Debe seleccionar un participante antes de configurar los
              boletos aéreos.
            </div>
          ) : (
            <form className={styles.form} onSubmit={submitForm} noValidate>
              <fieldset className={styles.fieldGroup}>
                <legend className={styles.label}>
                  Tipo de viaje <span className={styles.required}>*</span>
                </legend>
                <div className={styles.options}>
                  {TRIP_TYPE_OPTIONS.map((option) => (
                    <label className={styles.option} key={option.value}>
                      <input
                        className={styles.checkbox}
                        type="radio"
                        name="tripType"
                        value={option.value}
                        checked={tripType === option.value}
                        onChange={() => {
                          setTripType(option.value);
                          if (option.value === 'ONE_WAY') {
                            setReturnDate('');
                          }
                          clearError('tripType');
                        }}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                {validationError?.field === 'tripType' && (
                  <p className={styles.error} role="alert">
                    {validationError.message}
                  </p>
                )}
              </fieldset>

              <AirportSearchField
                label="Aeropuerto de origen"
                value={originAirport}
                onChange={(airport) => {
                  setOriginAirport(airport);
                  if (airport) clearError('originAirport');
                }}
                error={
                  validationError?.field === 'originAirport'
                    ? validationError.message
                    : undefined
                }
              />

              <AirportSearchField
                label="Aeropuerto de destino"
                value={destinationAirport}
                onChange={(airport) => {
                  setDestinationAirport(airport);
                  if (airport) clearError('destinationAirport');
                }}
                error={
                  validationError?.field === 'destinationAirport'
                    ? validationError.message
                    : undefined
                }
              />

              <label className={styles.fieldGroup}>
                <span className={styles.label}>
                  Fecha de salida <span className={styles.required}>*</span>
                </span>
                <input
                  type="date"
                  value={departureDate}
                  onChange={(event) => {
                    setDepartureDate(event.target.value);
                    clearError('departureDate');
                  }}
                  style={inputStyle}
                />
                {departureDate && (
                  <small className={styles.subtitle}>
                    Fecha seleccionada: {formatBusinessDate(departureDate)}
                  </small>
                )}
                {validationError?.field === 'departureDate' && (
                  <p className={styles.error} role="alert">
                    {validationError.message}
                  </p>
                )}
              </label>

              {tripType === 'ROUND_TRIP' && (
                <label className={styles.fieldGroup}>
                  <span className={styles.label}>
                    Fecha de regreso{' '}
                    <span className={styles.required}>*</span>
                  </span>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(event) => {
                      setReturnDate(event.target.value);
                      clearError('returnDate');
                    }}
                    style={inputStyle}
                  />
                  {returnDate && (
                    <small className={styles.subtitle}>
                      Fecha seleccionada: {formatBusinessDate(returnDate)}
                    </small>
                  )}
                  {validationError?.field === 'returnDate' && (
                    <p className={styles.error} role="alert">
                      {validationError.message}
                    </p>
                  )}
                </label>
              )}

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
                    clearError('quantity');
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

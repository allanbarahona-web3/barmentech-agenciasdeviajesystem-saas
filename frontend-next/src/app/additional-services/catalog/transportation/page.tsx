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
  type FlightTripType,
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

const TRIP_TYPE_OPTIONS: Array<{
  value: FlightTripType;
  label: string;
}> = [
  { value: 'ONE_WAY', label: 'Solo ida' },
  { value: 'ROUND_TRIP', label: 'Ida y vuelta' },
];

type ValidationError = {
  field:
    | 'transportationType'
    | 'tripType'
    | 'serviceDate'
    | 'returnDate'
    | 'origin'
    | 'destination';
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
  const [tripType, setTripType] = useState<FlightTripType | null>(
    () => editingLine?.tripType ?? null,
  );
  const [serviceDate, setServiceDate] = useState(
    () => editingLine?.serviceDate ?? '',
  );
  const [returnDate, setReturnDate] = useState(
    () => editingLine?.returnDate ?? '',
  );
  const [origin, setOrigin] = useState(() => editingLine?.origin ?? '');
  const [destination, setDestination] = useState(
    () => editingLine?.destination ?? '',
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

    if (!tripType) {
      setValidationError({
        field: 'tripType',
        message: 'Seleccione el tipo de viaje.',
      });
      return;
    }

    if (!serviceDate) {
      setValidationError({
        field: 'serviceDate',
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

    if (
      tripType === 'ROUND_TRIP' &&
      returnDate &&
      returnDate < serviceDate
    ) {
      setValidationError({
        field: 'returnDate',
        message: 'La fecha de regreso no puede ser anterior a la fecha de salida.',
      });
      return;
    }

    if (!origin.trim()) {
      setValidationError({ field: 'origin', message: 'Ingrese el origen.' });
      return;
    }

    if (!destination.trim()) {
      setValidationError({
        field: 'destination',
        message: 'Ingrese el destino.',
      });
      return;
    }

    if (editingLine) {
      replaceTemporaryAdditionalServiceLine(editingLine, {
        participantId: editingLine.participantId,
        serviceType: 'TRANSPORTATION',
        transportationType,
        tripType,
        serviceDate,
        returnDate: tripType === 'ROUND_TRIP' ? returnDate : null,
        origin: origin.trim(),
        destination: destination.trim(),
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
        tripType,
        serviceDate,
        returnDate: tripType === 'ROUND_TRIP' ? returnDate : null,
        origin: origin.trim(),
        destination: destination.trim(),
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
                          setReturnDate('');
                          setValidationError(null);
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

              <label className={styles.fieldGroup}>
                <span className={styles.label}>
                  Fecha de salida <span className={styles.required}>*</span>
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

              {tripType === 'ROUND_TRIP' && (
                <label className={styles.fieldGroup}>
                  <span className={styles.label}>
                    Fecha de regreso{' '}
                    <span className={styles.required}>*</span>
                  </span>
                  <input
                    type="date"
                    min={serviceDate || undefined}
                    value={returnDate}
                    onChange={(event) => {
                      setReturnDate(event.target.value);
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
                  Origen <span className={styles.required}>*</span>
                </span>
                <input
                  className={styles.input}
                  type="text"
                  value={origin}
                  onChange={(event) => {
                    setOrigin(event.target.value);
                    setValidationError(null);
                  }}
                />
                {validationError?.field === 'origin' && (
                  <p className={styles.error} role="alert">
                    {validationError.message}
                  </p>
                )}
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.label}>
                  Destino <span className={styles.required}>*</span>
                </span>
                <input
                  className={styles.input}
                  type="text"
                  value={destination}
                  onChange={(event) => {
                    setDestination(event.target.value);
                    setValidationError(null);
                  }}
                />
                {validationError?.field === 'destination' && (
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

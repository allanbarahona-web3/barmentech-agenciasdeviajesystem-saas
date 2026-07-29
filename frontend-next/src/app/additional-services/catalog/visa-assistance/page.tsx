'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdditionalServicesContextHeader } from '@/components/additional-services-context-header';
import {
  AdditionalServiceParticipantAssignment,
  useAdditionalServiceParticipantAssignment,
} from '@/components/additional-service-participant-assignment';
import { CountrySelect } from '@/components/country-select';
import {
  addTemporaryVisaAssistanceLine,
  cancelTemporaryAdditionalServiceLineEdit,
  getSelectedAdditionalServicesParticipants,
  getTemporaryAdditionalServiceEditReturnPath,
  getTemporaryAdditionalServiceLineBeingEdited,
  replaceTemporaryAdditionalServiceLine,
  type VisaType,
} from '@/lib/additional-services-temporary-store';
import { useTemporaryAdditionalServiceEditCleanup } from '@/lib/use-temporary-additional-service-edit-cleanup';
import { formatBusinessDate } from '@/shared/regional';
import styles from '../baggage/baggage-form.module.css';

type ValidationError = {
  field: 'destinationCountry' | 'visaType';
  message: string;
};

const VISA_TYPES: { value: VisaType; label: string }[] = [
  { value: 'TOURISM', label: 'Turismo' },
  { value: 'BUSINESS', label: 'Negocios' },
  { value: 'STUDENT', label: 'Estudiante' },
  { value: 'WORK', label: 'Trabajo' },
  { value: 'TRANSIT', label: 'Tránsito' },
  { value: 'OTHER', label: 'Otro' },
];

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  background: '#fff',
  color: '#172554',
  font: 'inherit',
};

export default function VisaAssistanceFormPage() {
  useTemporaryAdditionalServiceEditCleanup();
  const router = useRouter();
  const [quotationParticipantIds] = useState(() =>
    getSelectedAdditionalServicesParticipants(),
  );
  const [editingLine] = useState(() =>
    getTemporaryAdditionalServiceLineBeingEdited('VISA_ASSISTANCE'),
  );
  const participantAssignment = useAdditionalServiceParticipantAssignment(
    editingLine?.participantId,
  );
  const [destinationCountry, setDestinationCountry] = useState(
    () => editingLine?.destinationCountry ?? '',
  );
  const [visaType, setVisaType] = useState<VisaType | ''>(
    () => editingLine?.visaType ?? '',
  );
  const [expectedTravelDate, setExpectedTravelDate] = useState(
    () => editingLine?.expectedTravelDate ?? '',
  );
  const [notes, setNotes] = useState(() => editingLine?.notes ?? '');
  const [validationError, setValidationError] =
    useState<ValidationError | null>(null);

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingLine && !participantAssignment.validateSelection()) {
      return;
    }

    if (!destinationCountry) {
      setValidationError({
        field: 'destinationCountry',
        message: 'Ingrese el país de destino.',
      });
      return;
    }

    if (!visaType) {
      setValidationError({
        field: 'visaType',
        message: 'Seleccione el tipo de visa.',
      });
      return;
    }

    const line = {
      serviceType: 'VISA_ASSISTANCE' as const,
      destinationCountry,
      visaType,
      expectedTravelDate: expectedTravelDate || null,
      notes: notes.trim(),
    };

    if (editingLine) {
      replaceTemporaryAdditionalServiceLine(editingLine, {
        participantId: editingLine.participantId,
        ...line,
      });
      router.push(getTemporaryAdditionalServiceEditReturnPath());
      return;
    }

    participantAssignment.selectedParticipantIds.forEach((participantId) => {
      addTemporaryVisaAssistanceLine({ participantId, ...line });
    });
    router.push('/additional-services/catalog');
  }

  return (
    <main className="app-shell">
      <div className={styles.page}>
        <AdditionalServicesContextHeader />
        <header className={styles.header}>
          <h1 className={styles.title}>Asistencia para Visas</h1>
          <p className={styles.subtitle}>
            Configure la asistencia para los participantes seleccionados.
          </p>
        </header>

        <section className="form-section-card" style={{ marginTop: 0 }}>
          {quotationParticipantIds.length === 0 ? (
            <div className={styles.participantError} role="alert">
              Debe seleccionar un participante antes de configurar la
              asistencia para visas.
            </div>
          ) : (
            <form className={styles.form} onSubmit={submitForm} noValidate>
              <CountrySelect
                label="País de destino"
                value={destinationCountry}
                required
                error={
                  validationError?.field === 'destinationCountry'
                    ? validationError.message
                    : undefined
                }
                onChange={(countryCode) => {
                  setDestinationCountry(countryCode);
                  setValidationError(null);
                }}
              />

              <label className={styles.fieldGroup}>
                <span className={styles.label}>
                  Tipo de visa <span className={styles.required}>*</span>
                </span>
                <select
                  value={visaType}
                  onChange={(event) => {
                    setVisaType(event.target.value as VisaType | '');
                    setValidationError(null);
                  }}
                  style={inputStyle}
                >
                  <option value="">Seleccione un tipo de visa</option>
                  {VISA_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {validationError?.field === 'visaType' && (
                  <p className={styles.error} role="alert">
                    {validationError.message}
                  </p>
                )}
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.label}>Fecha prevista del viaje</span>
                <input
                  type="date"
                  value={expectedTravelDate}
                  onChange={(event) =>
                    setExpectedTravelDate(event.target.value)
                  }
                  style={inputStyle}
                />
                {expectedTravelDate && (
                  <small className={styles.subtitle}>
                    Fecha seleccionada:{' '}
                    {formatBusinessDate(expectedTravelDate)}
                  </small>
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

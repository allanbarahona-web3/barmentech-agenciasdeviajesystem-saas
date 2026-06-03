'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmModal } from '@/components/confirm-modal';
import { LoadingModal } from '@/components/loading-modal';

interface CreateTripFormProps {
  title: string;
  description: string;
  tripType: 'internal' | 'international';
  onSubmit: (data: any) => Promise<void>;
  redirectUrl: string;
  showTransportType?: boolean;
  showItinerary?: boolean;
}

export function CreateTripForm({
  title,
  description,
  tripType,
  onSubmit,
  redirectUrl,
  showTransportType = false,
  showItinerary = false,
}: CreateTripFormProps) {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<'loading' | 'success' | 'error'>('loading');
  const [loadingModalMessage, setLoadingModalMessage] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'primary' | 'danger' | 'warning';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Form state
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [descriptionText, setDescriptionText] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [capacity, setCapacity] = useState('');
  const [price, setPrice] = useState('');
  const [minReservation, setMinReservation] = useState('');
  const [currency, setCurrency] = useState<'CRC' | 'USD'>('USD');
  const [transportType, setTransportType] = useState<'AIR' | 'BUS' | 'PRIVATE' | 'CRUISE' | 'WALKING' | 'MIXED'>('AIR');
  const [itinerary, setItinerary] = useState('');

  const showConfirm = (config: Omit<typeof confirmModal, 'isOpen'>) => {
    setConfirmModal({ ...config, isOpen: true });
  };

  const closeConfirm = () => {
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  };

  const closeLoadingModal = () => {
    setShowLoadingModal(false);
    setLoadingModalState('loading');
    setLoadingModalMessage('');
  };

  const showLoadingState = (message: string) => {
    setLoadingModalMessage(message);
    setLoadingModalState('loading');
    setShowLoadingModal(true);
  };

  const showLoadingSuccess = (message: string) => {
    setLoadingModalMessage(message);
    setLoadingModalState('success');
    setShowLoadingModal(true);
  };

  const extractErrorMessage = (error: unknown, fallback: string) => {
    const rawMessage = String((error as any)?.message || '').trim();
    if (!rawMessage) {
      return fallback;
    }
    return rawMessage.replace(/^Error\s+\d+\s*:\s*/i, '').trim() || fallback;
  };

  const showWarningModal = (titleText: string, message: string) => {
    showConfirm({
      title: titleText,
      message,
      confirmText: 'Entendido',
      cancelText: 'Cerrar',
      variant: 'warning',
      onConfirm: () => closeConfirm(),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validaciones básicas
      if (!name.trim() || !destination.trim() || !departureDate || !returnDate || !capacity || !price) {
        showWarningModal('Campos requeridos', 'Por favor completa todos los campos requeridos');
        return;
      }

      const departureDateTime = new Date(departureDate);
      const returnDateTime = new Date(returnDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (departureDateTime <= today) {
        showWarningModal('Fecha inválida', 'La fecha de salida debe ser en el futuro');
        return;
      }

      if (returnDateTime <= departureDateTime) {
        showWarningModal('Fecha inválida', 'La fecha de regreso debe ser después de la salida');
        return;
      }

      if (parseInt(capacity) <= 0) {
        showWarningModal('Capacidad inválida', 'La capacidad debe ser mayor a 0');
        return;
      }

      if (parseFloat(price) <= 0) {
        showWarningModal('Precio inválido', 'El precio debe ser mayor a 0');
        return;
      }

      setSaving(true);
      showLoadingState('Creando viaje...');

      const data = {
        name: name.trim(),
        destination: destination.trim(),
        description: descriptionText.trim() || undefined,
        departureDate: departureDateTime.toISOString(),
        returnDate: returnDateTime.toISOString(),
        departureTime: departureTime || undefined,
        returnTime: returnTime || undefined,
        capacity: parseInt(capacity),
        price: parseFloat(price),
        minReservation: minReservation ? parseFloat(minReservation) : undefined,
        currency,
        ...(showTransportType && { transportType }),
        ...(showItinerary && { itinerary: itinerary.trim() || 'Itinerario a detalle' }),
      };

      await onSubmit(data);
      showLoadingSuccess('Viaje creado exitosamente');

      setTimeout(() => {
        router.push(redirectUrl);
      }, 1500);
    } catch (error) {
      closeLoadingModal();
      showWarningModal('Error al crear viaje', extractErrorMessage(error, 'Error desconocido'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        confirmVariant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
      />
      <LoadingModal
        isOpen={showLoadingModal}
        state={loadingModalState}
        loadingMessage={loadingModalMessage}
        successMessage={loadingModalMessage}
        errorMessage={loadingModalMessage}
        onClose={closeLoadingModal}
      />
      <main className="app-shell" style={{ padding: '20px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ marginBottom: 30 }}>
          <button
            onClick={() => router.back()}
            style={{
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              cursor: 'pointer',
              padding: 0,
              fontSize: 14,
              marginBottom: 10,
            }}
          >
            ← Volver
          </button>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#111827', margin: 0 }}>
            {title}
          </h1>
          <p style={{ color: '#6b7280', marginTop: 8 }}>
            {description}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Información básica */}
          <fieldset
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: 20,
              marginBottom: 20,
              background: '#fff',
            }}
          >
            <legend style={{ fontSize: 14, fontWeight: 600, color: '#111827', padding: '0 8px' }}>
              Información Básica
            </legend>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: '#111827', display: 'block', marginBottom: 6 }}>
                Nombre del Viaje *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej: Tour Montaña Azul"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: '#111827', display: 'block', marginBottom: 6 }}>
                Destino *
              </label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="ej: Arenal, La Fortuna"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: '#111827', display: 'block', marginBottom: 6 }}>
                Descripción
              </label>
              <textarea
                value={descriptionText}
                onChange={(e) => setDescriptionText(e.target.value)}
                placeholder="Descripción del viaje..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>
          </fieldset>

          {/* Fechas y horarios */}
          <fieldset
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: 20,
              marginBottom: 20,
              background: '#fff',
            }}
          >
            <legend style={{ fontSize: 14, fontWeight: 600, color: '#111827', padding: '0 8px' }}>
              Fechas y Horarios
            </legend>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 14, fontWeight: 500, color: '#111827', display: 'block', marginBottom: 6 }}>
                  Fecha de Salida *
                </label>
                <input
                  type="date"
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    fontFamily: 'inherit',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 14, fontWeight: 500, color: '#111827', display: 'block', marginBottom: 6 }}>
                  Hora de Salida
                </label>
                <input
                  type="time"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 14, fontWeight: 500, color: '#111827', display: 'block', marginBottom: 6 }}>
                  Fecha de Regreso *
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    fontFamily: 'inherit',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 14, fontWeight: 500, color: '#111827', display: 'block', marginBottom: 6 }}>
                  Hora de Regreso
                </label>
                <input
                  type="time"
                  value={returnTime}
                  onChange={(e) => setReturnTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>
          </fieldset>

          {/* Capacidad y Precio */}
          <fieldset
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: 20,
              marginBottom: 20,
              background: '#fff',
            }}
          >
            <legend style={{ fontSize: 14, fontWeight: 600, color: '#111827', padding: '0 8px' }}>
              Capacidad y Precio
            </legend>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 14, fontWeight: 500, color: '#111827', display: 'block', marginBottom: 6 }}>
                  Capacidad (cupos) *
                </label>
                <input
                  type="number"
                  min="1"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="ej: 30"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 14, fontWeight: 500, color: '#111827', display: 'block', marginBottom: 6 }}>
                  Precio por Persona *
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="ej: 150"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 14, fontWeight: 500, color: '#111827', display: 'block', marginBottom: 6 }}>
                  Moneda
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'CRC' | 'USD')}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="CRC">CRC (₡)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 14, fontWeight: 500, color: '#111827', display: 'block', marginBottom: 6 }}>
                Monto de Reserva (opcional)
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={minReservation}
                onChange={(e) => setMinReservation(e.target.value)}
                placeholder="ej: 50 (adelanto para confirmar reserva)"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </fieldset>

          {/* Tipo de Transporte y Itinerario (solo para viajes internos) */}
          {showTransportType && (
            <fieldset
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: 20,
                marginBottom: 20,
                background: '#fff',
              }}
            >
              <legend style={{ fontSize: 14, fontWeight: 600, color: '#111827', padding: '0 8px' }}>
                Detalles del Transporte
              </legend>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 14, fontWeight: 500, color: '#111827', display: 'block', marginBottom: 6 }}>
                  Tipo de Transporte
                </label>
                <select
                  value={transportType}
                  onChange={(e) => setTransportType(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="BUS">🚌 Autobús</option>
                  <option value="AIR">✈️ Avión</option>
                  <option value="PRIVATE">🚗 Privado</option>
                  <option value="CRUISE">🛥️ Crucero</option>
                  <option value="WALKING">🚶 A Pie</option>
                  <option value="MIXED">🔄 Mixto</option>
                </select>
              </div>

              {showItinerary && (
                <div>
                  <label style={{ fontSize: 14, fontWeight: 500, color: '#111827', display: 'block', marginBottom: 6 }}>
                    Itinerario
                  </label>
                  <textarea
                    value={itinerary}
                    onChange={(e) => setItinerary(e.target.value)}
                    placeholder="Describe el itinerario detallado del viaje..."
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 6,
                      fontSize: 14,
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                </div>
              )}
            </fieldset>
          )}

          {/* Botones */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => router.back()}
              disabled={saving}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                background: '#fff',
                color: '#374151',
                fontSize: 14,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.5 : 1,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: 6,
                background: '#3b82f6',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? 'Creando...' : '✓ Crear Viaje'}
            </button>
          </div>
        </form>
      </div>

    </main>
    </>
  );
}

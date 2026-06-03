'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmModal } from '@/components/confirm-modal';
import { LoadingModal } from '@/components/loading-modal';

interface CreateTripModalProps {
  title: string;
  tripType: 'internal' | 'international';
  onSubmit: (data: any) => Promise<void>;
  redirectUrl: string;
}

const getProgressColor = (percentage: number): string => {
  if (percentage >= 86) return '#ef4444'; // Rojo
  if (percentage >= 61) return '#f59e0b'; // Amarillo
  return '#10b981'; // Verde
};

export function CreateTripModal({
  title,
  tripType,
  onSubmit,
  redirectUrl,
}: CreateTripModalProps) {
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
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [capacity, setCapacity] = useState('');
  const [price, setPrice] = useState('');
  const [minReservation, setMinReservation] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'CRC'>('USD');
  const [transportType, setTransportType] = useState<'BUS' | 'PRIVATE' | 'WALKING' | 'MIXED'>('BUS');
  const [status, setStatus] = useState<'OPEN' | 'CLOSED' | 'CANCELLED'>('OPEN');

  // Calcular el porcentaje basado en capacidad máxima de 50 personas
  const capacityNum = capacity ? parseInt(capacity) : 0;
  const maxCapacity = 50;
  const percentage = Math.round((capacityNum / maxCapacity) * 100);
  const progressColor = getProgressColor(percentage);

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

      // Para viajes internacionales, monto mínimo es opcional
      if (tripType === 'international' && minReservation && parseFloat(minReservation) <= 0) {
        showWarningModal('Monto inválido', 'El monto de reserva mínima debe ser mayor a 0');
        return;
      }

      setSaving(true);
      showLoadingState('Creando viaje...');

      const baseData = {
        name: name.trim(),
        destination: destination.trim(),
        departureDate: departureDateTime.toISOString(),
        returnDate: returnDateTime.toISOString(),
        capacity: parseInt(capacity),
        status,
      };

      const data: any =
        tripType === 'internal'
          ? {
              ...baseData,
              price: parseFloat(price),
              currency,
              description: `Viaje Interno: ${name.trim()}`,
              itinerary: `Viaje a ${destination.trim()}`,
              transportType,
              ...(minReservation ? { minReservation: parseFloat(minReservation) } : {}),
            }
          : {
              ...baseData,
              packagePrice: parseFloat(price),
              priceCurrency: currency,
              ...(minReservation ? { minReservation: parseFloat(minReservation) } : {}),
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

  const handleClose = () => {
    router.back();
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
      <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          maxWidth: 640,
          width: '100%',
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'hidden',
          boxShadow: '0 20px 25px rgba(0, 0, 0, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: 16, position: 'relative' }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>
            {title}
          </h2>
          <button
            onClick={handleClose}
            style={{
              position: 'absolute',
              top: -5,
              right: 0,
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: '#6b7280',
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Nombre */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#111827', display: 'block', marginBottom: 4 }}>
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
                fontSize: 13,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Destino */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#111827', display: 'block', marginBottom: 4 }}>
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
                fontSize: 13,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Fechas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#111827', display: 'block', marginBottom: 4 }}>
                Salida *
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
                  fontSize: 13,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#111827', display: 'block', marginBottom: 4 }}>
                Regreso *
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
                  fontSize: 13,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Capacidad con barra visual */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#111827', display: 'block', marginBottom: 4 }}>
              Capacidad (personas) *
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
                fontSize: 13,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                marginBottom: 8,
              }}
            />
            {/* Barra de progreso idéntica a las tarjetas */}
            <div
              style={{
                height: 8,
                background: '#f3f4f6',
                borderRadius: 4,
                overflow: 'hidden',
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(percentage, 100)}%`,
                  background: progressColor,
                  transition: 'width 0.3s ease, background 0.3s ease',
                }}
              />
            </div>
            <div
              style={{
                fontSize: '0.85rem',
                color: '#6b7280',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>
                {capacityNum}/{maxCapacity} personas
              </span>
              <span style={{ fontWeight: 600, color: progressColor }}>{percentage}%</span>
            </div>
          </div>

          {/* Precio + Moneda */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#111827', display: 'block', marginBottom: 4 }}>
                Precio por Persona ({currency}) *
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
                  fontSize: 13,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#111827', display: 'block', marginBottom: 4 }}>
                Moneda
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as 'USD' | 'CRC')}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              >
                <option value="USD">USD ($)</option>
                <option value="CRC">CRC (₡)</option>
              </select>
            </div>
          </div>

          {/* Monto de reserva mínima (para ambos tipos) */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#111827', display: 'block', marginBottom: 4 }}>
              Monto de Reserva Mínima ({currency})
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={minReservation}
              onChange={(e) => setMinReservation(e.target.value)}
              placeholder="ej: 50 (opcional)"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 13,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: tripType === 'internal' ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#111827', display: 'block', marginBottom: 4 }}>
                Estado del Viaje
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'OPEN' | 'CLOSED' | 'CANCELLED')}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              >
                <option value="OPEN">✅ Activo</option>
                <option value="CLOSED">⏸ Stand By</option>
                <option value="CANCELLED">❌ Inactivo</option>
              </select>
            </div>

            {tripType === 'internal' && (
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#111827', display: 'block', marginBottom: 4 }}>
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
                    fontSize: 13,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="BUS">🚌 Autobús</option>
                  <option value="PRIVATE">🚗 Privado</option>
                  <option value="WALKING">🚶 A Pie</option>
                  <option value="MIXED">🔄 Mixto</option>
                </select>
              </div>
            )}
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                background: '#fff',
                color: '#374151',
                fontSize: 13,
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
                fontSize: 13,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? 'Creando...' : '✓ Crear'}
            </button>
          </div>
        </form>
      </div>

    </div>
    </>
  );
}

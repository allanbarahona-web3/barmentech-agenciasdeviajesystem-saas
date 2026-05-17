'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ToastNotification, useToast } from '@/components/toast-notification';

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
  const { toasts, showSuccess, showError, dismissToast } = useToast();

  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [capacity, setCapacity] = useState('');
  const [price, setPrice] = useState('');
  const [minReservation, setMinReservation] = useState('');
  const [transportType, setTransportType] = useState<'BUS' | 'PRIVATE' | 'WALKING' | 'MIXED'>('BUS');
  const [status, setStatus] = useState<'OPEN' | 'CLOSED' | 'CANCELLED'>('OPEN');

  // Calcular el porcentaje basado en capacidad máxima de 50 personas
  const capacityNum = capacity ? parseInt(capacity) : 0;
  const maxCapacity = 50;
  const percentage = Math.round((capacityNum / maxCapacity) * 100);
  const progressColor = getProgressColor(percentage);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Validaciones básicas
      if (!name.trim() || !destination.trim() || !departureDate || !returnDate || !capacity || !price) {
        showError('Por favor completa todos los campos requeridos');
        setSaving(false);
        return;
      }

      const departureDateTime = new Date(departureDate);
      const returnDateTime = new Date(returnDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (departureDateTime <= today) {
        showError('La fecha de salida debe ser en el futuro');
        setSaving(false);
        return;
      }

      if (returnDateTime <= departureDateTime) {
        showError('La fecha de regreso debe ser después de la salida');
        setSaving(false);
        return;
      }

      if (parseInt(capacity) <= 0) {
        showError('La capacidad debe ser mayor a 0');
        setSaving(false);
        return;
      }

      if (parseFloat(price) <= 0) {
        showError('El precio debe ser mayor a 0');
        setSaving(false);
        return;
      }

      // Para viajes internacionales, monto mínimo es opcional
      if (tripType === 'international' && minReservation && parseFloat(minReservation) <= 0) {
        showError('El monto de reserva mínima debe ser mayor a 0');
        setSaving(false);
        return;
      }

      const data: any = {
        name: name.trim(),
        destination: destination.trim(),
        departureDate: departureDateTime.toISOString(),
        returnDate: returnDateTime.toISOString(),
        capacity: parseInt(capacity),
        price: parseFloat(price),
        currency: 'USD',
        status: status,
        description: `${tripType === 'internal' ? 'Viaje Interno' : 'Viaje Internacional'}: ${name.trim()}`,
        itinerary: `Viaje a ${destination.trim()}`,
      };

      // Para viajes internos, agregar tipo de transporte
      if (tripType === 'internal') {
        data.transportType = transportType;
      }

      // Para ambos tipos, agregar monto de reserva mínima si está definido
      if (minReservation) {
        data.minReservation = parseFloat(minReservation);
      }

      await onSubmit(data);
      showSuccess('✅ Viaje creado exitosamente');

      setTimeout(() => {
        router.push(redirectUrl);
      }, 1500);
    } catch (error) {
      showError(`❌ Error: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    router.back();
  };

  return (
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
          padding: 30,
          maxWidth: 500,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px rgba(0, 0, 0, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: 24, position: 'relative' }}>
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
          <div style={{ marginBottom: 16 }}>
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
          <div style={{ marginBottom: 16 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
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
          <div style={{ marginBottom: 16 }}>
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

          {/* Precio */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#111827', display: 'block', marginBottom: 4 }}>
              Precio por Persona (USD) *
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

          {/* Monto de reserva mínima (para ambos tipos) */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#111827', display: 'block', marginBottom: 4 }}>
              Monto de Reserva Mínima (USD)
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

          {/* Estado del Viaje */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#111827', display: 'block', marginBottom: 8 }}>
              Estado del Viaje
            </label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="status"
                  value="OPEN"
                  checked={status === 'OPEN'}
                  onChange={(e) => setStatus(e.target.value as any)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.9rem' }}>✅ Activo</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="status"
                  value="CLOSED"
                  checked={status === 'CLOSED'}
                  onChange={(e) => setStatus(e.target.value as any)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.9rem' }}>⏸ Stand By</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="status"
                  value="CANCELLED"
                  checked={status === 'CANCELLED'}
                  onChange={(e) => setStatus(e.target.value as any)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.9rem' }}>❌ Inactivo</span>
              </label>
            </div>
          </div>

          {/* Tipo de transporte (solo para internos) */}
          {tripType === 'internal' && (
            <div style={{ marginBottom: 16 }}>
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

          {/* Botones */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
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

      {/* Toasts */}
      <ToastNotification
        toasts={toasts}
        onDismiss={dismissToast}
      />
    </div>
  );
}

'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getStoredToken } from '@/lib/auth-api';
import { resolveApiBase } from '@/lib/runtime-config';
import { PageLoader } from '@/components/loading-spinner';
import { ToastNotification, useToast } from '@/components/toast-notification';

interface InternalTrip {
  id: string;
  tripCode: string;
  name: string;
  destination: string;
  description?: string;
  departureDate: string;
  returnDate: string;
  departureTime?: string;
  returnTime?: string;
  capacity: number;
  occupiedSlots: number;
  price: number;
  currency: string;
  minReservation?: number;
  transportType?: string;
  itinerary?: string;
  status: string;
}

export default function EditInternalTripPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params?.id as string;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trip, setTrip] = useState<InternalTrip | null>(null);
  const { toasts, showSuccess, showError, dismissToast } = useToast();

  // Form state
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [description, setDescription] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [capacity, setCapacity] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('CRC');
  const [minReservation, setMinReservation] = useState('');
  const [transportType, setTransportType] = useState('BUS');
  const [itinerary, setItinerary] = useState('');
  const [status, setStatus] = useState('OPEN');

  useEffect(() => {
    loadTrip();
  }, [tripId]);

  const loadTrip = async () => {
    try {
      setLoading(true);
      const token = getStoredToken();
      const apiBase = resolveApiBase();

      const response = await fetch(`${apiBase}/internal-trips/${tripId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTrip(data);
        
        // Populate form
        setName(data.name);
        setDestination(data.destination);
        setDescription(data.description || '');
        setDepartureDate(new Date(data.departureDate).toISOString().split('T')[0]);
        setReturnDate(new Date(data.returnDate).toISOString().split('T')[0]);
        setDepartureTime(data.departureTime || '');
        setReturnTime(data.returnTime || '');
        setCapacity(String(data.capacity));
        setPrice(String(data.price));
        setCurrency(data.currency);
        setMinReservation(data.minReservation ? String(data.minReservation) : '');
        setTransportType(data.transportType || 'BUS');
        setItinerary(data.itinerary || '');
        setStatus(data.status);
      } else {
        showError(`Error al cargar el viaje: ${response.statusText}`);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error loading trip');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (!name.trim() || !destination.trim() || !departureDate || !returnDate || !capacity || !price) {
      showError('Por favor completa todos los campos requeridos');
      return;
    }

    const departureDateTime = new Date(departureDate);
    const returnDateTime = new Date(returnDate);

    if (returnDateTime <= departureDateTime) {
      showError('La fecha de regreso debe ser después de la salida');
      return;
    }

    if (parseInt(capacity) <= 0) {
      showError('La capacidad debe ser mayor a 0');
      return;
    }

    if (parseFloat(price) <= 0) {
      showError('El precio debe ser mayor a 0');
      return;
    }

    try {
      setSaving(true);
      const token = getStoredToken();
      const apiBase = resolveApiBase();

      const updateData = {
        name: name.trim(),
        destination: destination.trim(),
        description: description.trim() || undefined,
        departureDate: departureDateTime.toISOString(),
        returnDate: returnDateTime.toISOString(),
        departureTime: departureTime || undefined,
        returnTime: returnTime || undefined,
        capacity: parseInt(capacity),
        price: parseFloat(price),
        currency,
        minReservation: minReservation ? parseFloat(minReservation) : undefined,
        transportType,
        itinerary: itinerary.trim() || undefined,
        status,
      };

      const response = await fetch(`${apiBase}/internal-trips/${tripId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        showSuccess('Viaje actualizado exitosamente');
        setTimeout(() => {
          router.push('/admin/internal-trips');
        }, 1000);
      } else {
        showError(`Error: ${response.statusText}`);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error updating trip');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  if (!trip) {
    return (
      <main className="app-shell" style={{ padding: '20px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ 
            background: 'white', 
            borderRadius: 12, 
            padding: 40, 
            textAlign: 'center',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>❌</div>
            <h1 style={{ marginBottom: 16, fontSize: '1.5rem', fontWeight: 600 }}>Viaje no encontrado</h1>
            <Link href="/admin/internal-trips">
              <button style={{
                padding: '10px 20px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}>
                Volver a viajes internos
              </button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell" style={{ padding: '20px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <ToastNotification toasts={toasts} onDismiss={dismissToast} />

        {/* Header */}
        <div style={{ marginBottom: 30 }}>
          <Link href="/admin/internal-trips">
            <button style={{
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              cursor: 'pointer',
              fontSize: '1rem',
              marginBottom: 16,
            }}>
              ← Volver
            </button>
          </Link>
          <h1 style={{ marginBottom: 8, fontSize: '1.8rem', fontWeight: 600 }}>Editar Viaje Interno</h1>
          <p style={{ color: '#6b7280' }}>Código: {trip.tripCode}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{
          background: 'white',
          borderRadius: 12,
          padding: 30,
          border: '1px solid #e5e7eb',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Nombre *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 12px', fontSize: '1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Destino *</label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 12px', fontSize: '1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: '10px 12px', fontSize: '1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Fecha de Salida *</label>
              <input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 12px', fontSize: '1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Fecha de Regreso *</label>
              <input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 12px', fontSize: '1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Capacidad *</label>
              <input
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                required
                min="1"
                style={{ width: '100%', padding: '10px 12px', fontSize: '1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Precio *</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                step="0.01"
                min="0"
                style={{ width: '100%', padding: '10px 12px', fontSize: '1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Moneda</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', fontSize: '1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
              >
                <option value="CRC">CRC</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Reserva Mínima</label>
              <input
                type="number"
                value={minReservation}
                onChange={(e) => setMinReservation(e.target.value)}
                step="0.01"
                min="0"
                style={{ width: '100%', padding: '10px 12px', fontSize: '1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Tipo de Transporte</label>
              <select
                value={transportType}
                onChange={(e) => setTransportType(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', fontSize: '1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
              >
                <option value="BUS">Bus</option>
                <option value="PRIVATE">Vehículo Privado</option>
                <option value="WALKING">Caminata</option>
                <option value="MIXED">Mixto</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Estado</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', fontSize: '1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
              >
                <option value="OPEN">Abierto</option>
                <option value="CLOSED">Suspendido</option>
                <option value="CANCELLED">Cancelado</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Itinerario</label>
            <textarea
              value={itinerary}
              onChange={(e) => setItinerary(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: '10px 12px', fontSize: '1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Link href="/admin/internal-trips">
              <button
                type="button"
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </Link>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '10px 20px',
                background: saving ? '#9ca3af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Guardando...' : '✓ Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

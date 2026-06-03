'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession, getStoredToken } from '@/lib/auth-api';
import { resolveApiBase } from '@/lib/runtime-config';
import { ConfirmModal } from '@/components/confirm-modal';
import { PageLoader } from '@/components/loading-spinner';

interface InternalTrip {
  id: string;
  tripCode: string;
  name: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  capacity: number;
  occupiedSlots: number;
  price: number;
  currency: string;
  minReservation: number | null;
  status: string;
  createdAt: string;
}

const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '-';
  }
};

const formatPrice = (price: number | string | null | undefined, currency: string): string => {
  if (price === null || price === undefined) return 'Sin precio';
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(numPrice)) return 'Sin precio';
  return `${currency} ${numPrice.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

const getProgressColor = (percentage: number): string => {
  if (percentage >= 86) return '#ef4444'; // Rojo
  if (percentage >= 61) return '#f59e0b'; // Amarillo
  return '#10b981'; // Verde
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'OPEN':
      return { label: '✅ DISPONIBLE', bg: '#d1fae5', color: '#065f46' };
    case 'FULL':
      return { label: '🔴 COMPLETO', bg: '#fee2e2', color: '#991b1b' };
    case 'CANCELLED':
      return { label: '⚫ CANCELADO', bg: '#f3f4f6', color: '#374151' };
    default:
      return { label: status, bg: '#f3f4f6', color: '#6b7280' };
  }
};

export default function InternalTripsAvailablePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<InternalTrip[]>([]);
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

  const showConfirm = (config: Omit<typeof confirmModal, 'isOpen'>) => {
    setConfirmModal({ ...config, isOpen: true });
  };

  const closeConfirm = () => {
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  };

  const extractErrorMessage = (error: unknown, fallback: string) => {
    const rawMessage = String((error as any)?.message || '').trim();
    if (!rawMessage) {
      return fallback;
    }
    return rawMessage.replace(/^Error\s+\d+\s*:\s*/i, '').trim() || fallback;
  };

  const showWarningModal = (title: string, message: string) => {
    showConfirm({
      title,
      message,
      confirmText: 'Entendido',
      cancelText: 'Cerrar',
      variant: 'warning',
      onConfirm: () => closeConfirm(),
    });
  };

  useEffect(() => {
    setMounted(true);
    const session = getStoredSession();
    const token = getStoredToken();

    if (!session?.user?.id || !token) {
      router.replace('/');
      return;
    }

    loadTrips(token);
  }, [router]);

  const loadTrips = async (token: string) => {
    try {
      setLoading(true);
      const apiBase = resolveApiBase();
      const response = await fetch(`${apiBase}/internal-trips`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Filter only OPEN trips for agents
        const openTrips = data.filter((trip: InternalTrip) => trip.status === 'OPEN');
        setTrips(openTrips);
      } else {
        showWarningModal('Error cargando viajes internos', `Error: ${response.status} ${response.statusText}`);
      }
    } catch (err: unknown) {
      showWarningModal('Error cargando viajes internos', extractErrorMessage(err, 'Error cargando viajes'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTrip = (trip: InternalTrip) => {
    // Navegar al formulario de reserva para viajes internos
    console.log('Selected trip:', trip);
    router.push(`/internal-trips/${trip.id}/book`);
  };

  if (!mounted || loading) {
    return <PageLoader />;
  }

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
      <main className="app-shell" style={{ padding: '20px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 30 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#111827', margin: 0 }}>
            🚌 Viajes Internos Disponibles
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', marginTop: 8 }}>
            Explora y reserva nuestros viajes domésticos
          </p>
        </div>

        {/* Cards Grid */}
        {trips.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 48,
              backgroundColor: '#f9fafb',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>🚌</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>
              No hay viajes disponibles
            </h3>
            <p style={{ fontSize: 14, color: '#6b7280', marginTop: 8 }}>
              Por favor vuelve más tarde para ver nuevos viajes
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 20,
            }}
          >
            {trips.map((trip) => {
              const occupancyPercentage = (trip.occupiedSlots / trip.capacity) * 100;
              const statusBadge = getStatusBadge(trip.status);

              return (
                <div
                  key={trip.id}
                  style={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: 16,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow =
                      '0 10px 15px rgba(0,0,0,0.1)';
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow =
                      '0 1px 2px rgba(0,0,0,0.05)';
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                  }}
                  onClick={() => handleSelectTrip(trip)}
                >
                  {/* Header */}
                  <div style={{ marginBottom: 12 }}>
                    {/* Trip Code Badge */}
                    <div style={{ marginBottom: 8 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          backgroundColor: '#f3f4f6',
                          color: '#374151',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          fontFamily: 'monospace',
                        }}
                      >
                        {trip.tripCode}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div>
                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>
                          {trip.name}
                        </h2>
                        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0 0' }}>
                          📍 {trip.destination}
                        </p>
                      </div>
                      <div
                        style={{
                          backgroundColor: statusBadge.bg,
                          color: statusBadge.color,
                          padding: '4px 8px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {statusBadge.label}
                      </div>
                    </div>
                  </div>

                  {/* Dates */}
                  <div style={{ marginBottom: 12, fontSize: 13, color: '#6b7280' }}>
                    <p style={{ margin: '0 0 4px 0' }}>
                      📅 Salida: <strong>{formatDate(trip.departureDate)}</strong>
                    </p>
                    <p style={{ margin: '0 0 4px 0' }}>
                      📅 Retorno: <strong>{formatDate(trip.returnDate)}</strong>
                    </p>
                  </div>

                  {/* Price */}
                  <div style={{ marginBottom: 12 }}>
                    <p
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: '#059669',
                        margin: 0,
                      }}
                    >
                      {formatPrice(trip.price, trip.currency)}
                    </p>
                    {trip.minReservation && (
                      <p
                        style={{
                          fontSize: 13,
                          color: '#d97706',
                          margin: '4px 0 0 0',
                        }}
                      >
                        🔖 Reserva: {formatPrice(trip.minReservation, trip.currency)}
                      </p>
                    )}
                  </div>

                  {/* Occupancy Progress Bar */}
                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: 12, color: '#6b7280' }}>Ocupación</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>
                        {trip.occupiedSlots}/{trip.capacity} cupos
                      </span>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: 8,
                        backgroundColor: '#e5e7eb',
                        borderRadius: 4,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${occupancyPercentage}%`,
                          backgroundColor: getProgressColor(occupancyPercentage),
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                  </div>

                  {/* Button */}
                  <button
                    onClick={() => trip.status === 'OPEN' && handleSelectTrip(trip)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: trip.status === 'OPEN' ? '#3b82f6' : '#d1d5db',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: trip.status === 'OPEN' ? 'pointer' : 'not-allowed',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (trip.status === 'OPEN') {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                          '#2563eb';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (trip.status === 'OPEN') {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                          '#3b82f6';
                      }
                    }}
                    disabled={trip.status !== 'OPEN'}
                  >
                    {trip.status === 'OPEN' ? '→ Reservar Ahora' : 'No Disponible'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
    </>
  );
}

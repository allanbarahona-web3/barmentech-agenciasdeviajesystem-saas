'use client';

import { useState } from 'react';
import { getStoredToken } from '@/lib/auth-api';
import { resolveApiBase } from '@/lib/runtime-config';
import { ConfirmModal } from '@/components/confirm-modal';
import { LoadingModal } from '@/components/loading-modal';

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
  status: string;
  description?: string;
  departureTime?: string;
  returnTime?: string;
  minReservation?: number;
  transportType?: string;
  itinerary?: string;
}

interface InternalTripsListProps {
  trips: InternalTrip[];
  onTripsUpdated?: () => void;
}

const formatDate_ = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "-";
  }
};

const formatPrice = (price: number | string | null | undefined, currency: string): string => {
  if (price === null || price === undefined) return "Sin precio";
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(numPrice)) return "Sin precio";
  return `${currency} ${numPrice.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};

const getProgressColor = (percentage: number): string => {
  if (percentage >= 86) return "#ef4444"; // Rojo
  if (percentage >= 61) return "#f59e0b"; // Amarillo
  return "#10b981"; // Verde
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "OPEN":
      return { label: "✅ ABIERTO", bg: "#d1fae5", color: "#065f46" };
    case "CLOSED":
      return { label: "⏸ SUSPENDIDO", bg: "#fef3c7", color: "#92400e" };
    case "CANCELLED":
      return { label: "⚫ CANCELADO", bg: "#f3f4f6", color: "#374151" };
    case "COMPLETED":
      return { label: "🏁 FINALIZADO", bg: "#e0e7ff", color: "#3730a3" };
    default:
      return { label: status, bg: "#f3f4f6", color: "#6b7280" };
  }
};

export function InternalTripsList({ trips, onTripsUpdated }: InternalTripsListProps) {
  const [editingTrip, setEditingTrip] = useState<InternalTrip | null>(null);
  const [saving, setSaving] = useState(false);
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<'loading' | 'success' | 'error'>('loading');
  const [loadingModalMessage, setLoadingModalMessage] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    destination: '',
    departureDate: '',
    returnDate: '',
    capacity: '',
    price: '',
    minReservation: '',
    currency: 'CRC',
    status: 'OPEN',
  });

  // Modal de confirmación
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "primary" | "danger" | "warning";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const showConfirm = (config: Omit<typeof confirmModal, "isOpen">) => {
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

  const openEditForm = (trip: InternalTrip) => {
    setEditingTrip(trip);
    setFormData({
      name: trip.name,
      destination: trip.destination,
      departureDate: new Date(trip.departureDate).toISOString().split('T')[0],
      returnDate: new Date(trip.returnDate).toISOString().split('T')[0],
      capacity: String(trip.capacity),
      price: String(trip.price),
      minReservation: trip.minReservation ? String(trip.minReservation) : '',
      currency: trip.currency,
      status: trip.status,
    });
  };

  const closeEditForm = () => {
    setEditingTrip(null);
    setFormData({
      name: '',
      destination: '',
      departureDate: '',
      returnDate: '',
      capacity: '',
      price: '',
      minReservation: '',
      currency: 'CRC',
      status: 'OPEN',
    });
  };

  const handleCancelTrip = (trip: InternalTrip) => {
    showConfirm({
      title: "Cancelar Viaje",
      message: `¿Estás seguro que deseas cancelar el viaje "${trip.name}"? Esta acción no se puede deshacer.`,
      confirmText: "Sí, cancelar viaje",
      cancelText: "No",
      variant: "danger",
      onConfirm: async () => {
        try {
          showLoadingState('Cancelando viaje interno...');
          const token = getStoredToken();
          const apiBase = resolveApiBase();

          const response = await fetch(`${apiBase}/internal-trips/${trip.id}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'CANCELLED' }),
          });

          if (response.ok) {
            showLoadingSuccess('Viaje cancelado exitosamente');
            if (onTripsUpdated) {
              onTripsUpdated();
            }
          } else {
            const error = await response.json();
            closeLoadingModal();
            showWarningModal('Error cancelando viaje', error.message || `Error: ${response.statusText}`);
          }
        } catch (err) {
          closeLoadingModal();
          showWarningModal('Error cancelando viaje', extractErrorMessage(err, 'Error cancelando viaje'));
        } finally {
          closeConfirm();
        }
      },
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrip) return;

    if (!formData.name.trim() || !formData.destination.trim()) {
      showWarningModal('Campos requeridos', 'Por favor completa todos los campos requeridos');
      return;
    }

    const departureDateTime = new Date(formData.departureDate);
    const returnDateTime = new Date(formData.returnDate);

    if (returnDateTime <= departureDateTime) {
      showWarningModal('Fecha inválida', 'La fecha de regreso debe ser después de la salida');
      return;
    }

    if (parseInt(formData.capacity) <= 0) {
      showWarningModal('Capacidad inválida', 'La capacidad debe ser mayor a 0');
      return;
    }

    if (parseFloat(formData.price) <= 0) {
      showWarningModal('Precio inválido', 'El precio debe ser mayor a 0');
      return;
    }

    try {
      setSaving(true);
      showLoadingState('Actualizando viaje interno...');
      const token = getStoredToken();
      const apiBase = resolveApiBase();

      const updateData = {
        name: formData.name.trim(),
        destination: formData.destination.trim(),
        departureDate: departureDateTime.toISOString(),
        returnDate: returnDateTime.toISOString(),
        capacity: parseInt(formData.capacity),
        price: parseFloat(formData.price),
        minReservation: formData.minReservation ? parseFloat(formData.minReservation) : undefined,
        currency: formData.currency,
        status: formData.status,
      };

      const response = await fetch(`${apiBase}/internal-trips/${editingTrip.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        showLoadingSuccess('Viaje actualizado exitosamente');
        closeEditForm();
        if (onTripsUpdated) {
          onTripsUpdated();
        }
      } else {
        closeLoadingModal();
        showWarningModal('Error actualizando viaje', `Error: ${response.statusText}`);
      }
    } catch (err) {
      closeLoadingModal();
      showWarningModal('Error actualizando viaje', extractErrorMessage(err, 'Error updating trip'));
    } finally {
      setSaving(false);
    }
  };

  if (trips.length === 0) {
    return (
      <div style={{
        background: "white",
        borderRadius: 12,
        padding: 60,
        textAlign: "center",
        border: "1px solid #e5e7eb",
      }}>
        <div style={{ fontSize: "3rem", marginBottom: 16 }}>🚌</div>
        <h3 style={{ marginBottom: 8, color: "#374151" }}>No hay viajes internos registrados</h3>
        <p style={{ color: "#6b7280", marginBottom: 24 }}>Accede desde el menú "Programar Viajes" → "Crear Viaje" para comenzar</p>
      </div>
    );
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
      <LoadingModal
        isOpen={showLoadingModal}
        state={loadingModalState}
        loadingMessage={loadingModalMessage}
        successMessage={loadingModalMessage}
        errorMessage={loadingModalMessage}
        onClose={closeLoadingModal}
      />
      
      <div className="internal-trips-grid" style={{ width: "100%" }}>
        {trips.map((trip) => {
          const percentage = Math.round((trip.occupiedSlots / trip.capacity) * 100);
          const statusInfo = getStatusBadge(trip.status);
          const isArchived = trip.status === 'CANCELLED' || trip.status === 'COMPLETED';

          return (
            <div
              key={trip.id}
              style={{
                background: "white",
                borderRadius: 14,
                border: "1px solid #e5e7eb",
                padding: 24,
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
                transition: "transform 0.2s, box-shadow 0.2s",
                cursor: isArchived ? "default" : "pointer",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                opacity: isArchived ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isArchived) {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.12)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isArchived) {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.04)";
                }
              }}
            >
            {/* Código del viaje */}
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#6b7280",
                fontFamily: "monospace",
                marginBottom: 12,
                letterSpacing: "0.5px",
              }}
            >
              {trip.tripCode}
            </div>

            {/* Nombre del viaje */}
            <h3
              style={{
                margin: "0 0 8px 0",
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "#111827",
                lineHeight: 1.3,
              }}
            >
              {trip.name}
            </h3>

            {/* Destino */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <span style={{ fontSize: "1rem" }}>📍</span>
              <span style={{ color: "#6b7280", fontSize: "0.95rem" }}>{trip.destination}</span>
            </div>

            {/* Fechas */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <span style={{ fontSize: "1rem" }}>📅</span>
              <span style={{ color: "#6b7280", fontSize: "0.9rem" }}>
                {formatDate_(trip.departureDate)} - {formatDate_(trip.returnDate)}
              </span>
            </div>

            {/* Precio */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: "1rem" }}>💰</span>
              <span style={{ color: "#111827", fontSize: "1rem", fontWeight: 600 }}>
                {formatPrice(trip.price, trip.currency)}
              </span>
            </div>

            {/* Monto de Reserva */}
            {trip.minReservation && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
                <span style={{ fontSize: "1rem" }}>🏷️</span>
                <span style={{ color: "#059669", fontSize: "0.9rem", fontWeight: 600 }}>
                  Reserva: {formatPrice(trip.minReservation, trip.currency)}
                </span>
              </div>
            )}

            {/* Barra de progreso */}
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  height: 8,
                  background: "#f3f4f6",
                  borderRadius: 4,
                  overflow: "hidden",
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${percentage}%`,
                    background: getProgressColor(percentage),
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "#6b7280",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>
                  {trip.occupiedSlots}/{trip.capacity} personas
                </span>
                <span style={{ fontWeight: 600, color: getProgressColor(percentage) }}>{percentage}%</span>
              </div>
            </div>

            {/* Badge de estado */}
            <div style={{ marginBottom: 16 }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "6px 14px",
                  borderRadius: 20,
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  background: statusInfo.bg,
                  color: statusInfo.color,
                }}
              >
                {statusInfo.label}
              </span>
            </div>

            {/* Botones de acción en una fila */}
            <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
              <button
                onClick={() => openEditForm(trip)}
                disabled={isArchived}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  background: isArchived ? "#d1d5db" : "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: isArchived ? "not-allowed" : "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => !isArchived && (e.currentTarget.style.background = "#2563eb")}
                onMouseLeave={(e) => !isArchived && (e.currentTarget.style.background = "#3b82f6")}
              >
                {isArchived ? "🔒 Bloqueado" : "Editar"}
              </button>
              {!isArchived && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancelTrip(trip);
                  }}
                  style={{
                    padding: "10px 16px",
                    background: "#fee2e2",
                    color: "#991b1b",
                    border: "none",
                    borderRadius: 8,
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#fecaca")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fee2e2")}
                >
                  ❌
                </button>
              )}
            </div>
            </div>
          );
        })}
      </div>

      {/* Modal de edición */}
      {editingTrip && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          animation: "fadeIn 0.2s ease-out",
        }}
          onClick={closeEditForm}>
          <div style={{
            background: "white",
            borderRadius: 16,
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            maxWidth: 600,
            width: "90%",
            maxHeight: "90vh",
            overflow: "auto",
            animation: "slideUp 0.3s ease-out",
          }}
            onClick={(e) => e.stopPropagation()}>
            
            {/* Header */}
            <div style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
              padding: "32px 32px 24px 32px",
              color: "white",
              position: "relative",
            }}>
              <button
                onClick={closeEditForm}
                style={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  background: "rgba(255, 255, 255, 0.2)",
                  border: "none",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: "1.5rem",
                  color: "white",
                }}>
                ×
              </button>
              <h2 style={{ margin: 0, fontSize: "1.75rem" }}>Editar Viaje Interno</h2>
            </div>

            {/* Form */}
            <form onSubmit={handleEditSubmit} style={{ padding: 32 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Nombre */}
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#374151" }}>
                    Nombre del Viaje <span style={{ color: "#ef4444" }}>*</span>
                  </span>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="Viaje a Tortuguero"
                    style={{
                      padding: "12px 16px",
                      border: "1px solid #d1d5db",
                      borderRadius: 8,
                      fontSize: "1rem",
                    }}
                  />
                </label>

                {/* Destino */}
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#374151" }}>
                    Destino <span style={{ color: "#ef4444" }}>*</span>
                  </span>
                  <input
                    type="text"
                    value={formData.destination}
                    onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                    required
                    placeholder="Tortuguero"
                    style={{
                      padding: "12px 16px",
                      border: "1px solid #d1d5db",
                      borderRadius: 8,
                      fontSize: "1rem",
                    }}
                  />
                </label>

                {/* Fechas */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#374151" }}>
                      Fecha de Salida <span style={{ color: "#ef4444" }}>*</span>
                    </span>
                    <input
                      type="date"
                      value={formData.departureDate}
                      onChange={(e) => setFormData({ ...formData, departureDate: e.target.value })}
                      required
                      style={{
                        padding: "12px 16px",
                        border: "1px solid #d1d5db",
                        borderRadius: 8,
                        fontSize: "1rem",
                      }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#374151" }}>
                      Fecha de Retorno <span style={{ color: "#ef4444" }}>*</span>
                    </span>
                    <input
                      type="date"
                      value={formData.returnDate}
                      onChange={(e) => setFormData({ ...formData, returnDate: e.target.value })}
                      required
                      style={{
                        padding: "12px 16px",
                        border: "1px solid #d1d5db",
                        borderRadius: 8,
                        fontSize: "1rem",
                      }}
                    />
                  </label>
                </div>

                {/* Capacidad */}
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#374151" }}>
                    Capacidad (personas) <span style={{ color: "#ef4444" }}>*</span>
                  </span>
                  <input
                    type="number"
                    value={formData.capacity}
                    onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                    required
                    min="1"
                    placeholder="30"
                    style={{
                      padding: "12px 16px",
                      border: "1px solid #d1d5db",
                      borderRadius: 8,
                      fontSize: "1rem",
                    }}
                  />
                </label>

                {/* Precio */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#374151" }}>
                      💰 Precio del Paquete
                    </span>
                    <input
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      required
                      step="0.01"
                      min="0"
                      placeholder="1500"
                      style={{
                        padding: "12px 16px",
                        border: "1px solid #d1d5db",
                        borderRadius: 8,
                        fontSize: "1rem",
                      }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#374151" }}>Moneda</span>
                    <select
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      style={{
                        padding: "12px 16px",
                        border: "1px solid #d1d5db",
                        borderRadius: 8,
                        fontSize: "1rem",
                        cursor: "pointer",
                      }}
                    >
                      <option value="USD">USD</option>
                      <option value="CRC">CRC</option>
                    </select>
                  </label>
                </div>

                {/* Monto de Reserva */}
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#374151" }}>
                    🏷️ Monto de Reserva (opcional)
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.minReservation}
                    onChange={(e) => setFormData({ ...formData, minReservation: e.target.value })}
                    placeholder="500 (adelanto para confirmar)"
                    style={{
                      padding: "12px 16px",
                      border: "1px solid #d1d5db",
                      borderRadius: 8,
                      fontSize: "1rem",
                    }}
                  />
                </label>

                {/* Mensaje informativo */}
                <div
                  style={{
                    background: "#eff6ff",
                    borderLeft: "4px solid #3b82f6",
                    borderRadius: 8,
                    padding: 12,
                    fontSize: "0.85rem",
                    color: "#1e40af",
                  }}
                >
                  ⓘ Este precio será calculado automáticamente en el futuro. Por ahora ingrésalo manualmente.
                </div>

                {/* Status */}
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#374151" }}>Status del Viaje</span>
                  <div style={{ display: "flex", gap: 16 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="status"
                        value="OPEN"
                        checked={formData.status === "OPEN"}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        style={{ cursor: "pointer" }}
                      />
                      <span style={{ fontSize: "0.95rem" }}>✅ Activo</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="status"
                        value="CLOSED"
                        checked={formData.status === "CLOSED"}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        style={{ cursor: "pointer" }}
                      />
                      <span style={{ fontSize: "0.95rem" }}>⏸ Stand By</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="status"
                        value="CANCELLED"
                        checked={formData.status === "CANCELLED"}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        style={{ cursor: "pointer" }}
                      />
                      <span style={{ fontSize: "0.95rem" }}>❌ Inactivo</span>
                    </label>
                  </div>
                </label>
              </div>

              {/* Botones */}
              <div style={{ marginTop: 32, display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={closeEditForm}
                  disabled={saving}
                  style={{
                    padding: "12px 24px",
                    background: "#f3f4f6",
                    color: "#374151",
                    border: "none",
                    borderRadius: 8,
                    fontSize: "1rem",
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.5 : 1,
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: "12px 24px",
                    background: saving ? "#9ca3af" : "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    fontSize: "1rem",
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  {saving ? "Guardando..." : "✓ Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

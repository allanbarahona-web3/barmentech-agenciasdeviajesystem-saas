"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, getHomeRouteForRole } from "@/lib/auth-api";
import {
  getAllTravelPackages,
  createTravelPackage,
  updateTravelPackage,
  deleteTravelPackage,
  type TravelPackage,
  type CreateTravelPackageInput,
} from "@/lib/travel-packages-api";
import { ConfirmModal } from "@/components/confirm-modal";
import { LoadingModal } from "@/components/loading-modal";
import { PageLoader } from "@/components/loading-spinner";

const formatDate = (dateString: string): string => {
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

interface TravelPackagesManagerProps {
  travelType: "INTERNATIONAL" | "MIGRATION";
  title: string;
  icon: string;
}

export function TravelPackagesManager({ travelType, title, icon }: TravelPackagesManagerProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [packages, setPackages] = useState<TravelPackage[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPackage, setEditingPackage] = useState<TravelPackage | null>(null);
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<"loading" | "success" | "error">("loading");
  const [loadingModalMessage, setLoadingModalMessage] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [capacity, setCapacity] = useState("");
  const [packagePrice, setPackagePrice] = useState("");
  const [minReservation, setMinReservation] = useState("");
  const [priceCurrency, setPriceCurrency] = useState<"USD" | "CRC">("USD");
  const [status, setStatus] = useState<"OPEN" | "CLOSED" | "CANCELLED" | "COMPLETED">("OPEN");

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
    setLoadingModalState("loading");
    setLoadingModalMessage("");
  };

  const showLoadingState = (message: string) => {
    setLoadingModalMessage(message);
    setLoadingModalState("loading");
    setShowLoadingModal(true);
  };

  const showLoadingSuccess = (message: string) => {
    setLoadingModalMessage(message);
    setLoadingModalState("success");
    setShowLoadingModal(true);
  };

  const extractErrorMessage = (error: unknown, fallback: string) => {
    const rawMessage = String((error as any)?.message || "").trim();
    if (!rawMessage) {
      return fallback;
    }
    return rawMessage.replace(/^Error\s+\d+\s*:\s*/i, "").trim() || fallback;
  };

  const showWarningModal = (title: string, message: string) => {
    showConfirm({
      title,
      message,
      confirmText: "Entendido",
      cancelText: "Cerrar",
      variant: "warning",
      onConfirm: () => closeConfirm(),
    });
  };

  useEffect(() => {
    setMounted(true);
    const session = getStoredSession();
    
    if (!session?.user?.id) {
      router.replace("/");
      return;
    }

    const role = String(session.user.role || "").toUpperCase();
    if (role !== "ADMIN") {
      router.replace(getHomeRouteForRole(role));
      return;
    }

    loadPackages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelType]);

  const loadPackages = async () => {
    try {
      setLoading(true);
      const data = await getAllTravelPackages(travelType);
      setPackages(data);
    } catch (err: unknown) {
      showWarningModal("Error cargando viajes", extractErrorMessage(err, "Error cargando viajes"));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setDestination("");
    setDepartureDate("");
    setReturnDate("");
    setCapacity("");
    setPackagePrice("");
    setMinReservation("");
    setPriceCurrency("USD");
    setStatus("OPEN");
    setEditingPackage(null);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (pkg: TravelPackage) => {
    setEditingPackage(pkg);
    setName(pkg.name);
    setDestination(pkg.destination);
    setDepartureDate(pkg.departureDate.split("T")[0]);
    setReturnDate(pkg.returnDate.split("T")[0]);
    setCapacity(String(pkg.capacity));
    setPackagePrice(pkg.packagePrice ? String(pkg.packagePrice) : "");
    setMinReservation(pkg.minReservation ? String(pkg.minReservation) : "");
    setPriceCurrency(pkg.priceCurrency as "USD" | "CRC");
    setStatus(pkg.status);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const handleSubmit = async () => {
    if (!name.trim() || !destination.trim() || !departureDate || !returnDate || !capacity) {
      showWarningModal("Campos requeridos", "Por favor completa todos los campos obligatorios");
      return;
    }

    const capacityNum = parseInt(capacity, 10);
    if (isNaN(capacityNum) || capacityNum < 1) {
      showWarningModal("Capacidad inválida", "La capacidad debe ser un número mayor a 0");
      return;
    }

    const priceNum = packagePrice.trim() ? parseFloat(packagePrice) : undefined;
    if (priceNum !== undefined && (isNaN(priceNum) || priceNum < 0)) {
      showWarningModal("Precio inválido", "El precio debe ser un número válido");
      return;
    }

    const minResNum = minReservation.trim() ? parseFloat(minReservation) : undefined;
    if (minResNum !== undefined && (isNaN(minResNum) || minResNum < 0)) {
      showWarningModal("Monto inválido", "El monto de reserva debe ser un número válido");
      return;
    }

    const data: CreateTravelPackageInput = {
      name: name.trim(),
      destination: destination.trim(),
      departureDate,
      returnDate,
      capacity: capacityNum,
      packagePrice: priceNum,
      minReservation: minResNum,
      priceCurrency,
      travelType,
      status,
    };

    try {
      setSaving(true);
      showLoadingState(editingPackage ? "Actualizando viaje..." : "Creando viaje...");
      if (editingPackage) {
        await updateTravelPackage(editingPackage.id, data);
        showLoadingSuccess("Viaje actualizado exitosamente");
      } else {
        await createTravelPackage(data);
        showLoadingSuccess("Viaje creado exitosamente");
      }
      closeForm();
      await loadPackages();
    } catch (err: unknown) {
      closeLoadingModal();
      showWarningModal("Error al guardar el viaje", extractErrorMessage(err, "Error al guardar el viaje"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (pkg: TravelPackage) => {
    showConfirm({
      title: "Cancelar Viaje",
      message: `¿Estás seguro que deseas cancelar el viaje "${pkg.name}"? Esta acción no se puede deshacer.`,
      confirmText: "Sí, cancelar viaje",
      cancelText: "No",
      variant: "danger",
      onConfirm: async () => {
        try {
          showLoadingState("Cancelando viaje...");
          await deleteTravelPackage(pkg.id);
          showLoadingSuccess("Viaje cancelado exitosamente");
          await loadPackages();
        } catch (err: unknown) {
          closeLoadingModal();
          showWarningModal("Error al cancelar el viaje", extractErrorMessage(err, "Error al cancelar el viaje"));
        } finally {
          closeConfirm();
        }
      },
    });
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
      <LoadingModal
        isOpen={showLoadingModal}
        state={loadingModalState}
        loadingMessage={loadingModalMessage}
        successMessage={loadingModalMessage}
        errorMessage={loadingModalMessage}
        onClose={closeLoadingModal}
      />

      <main className="app-shell" style={{ padding: "20px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ marginBottom: 30 }}>
            <h1 style={{ marginBottom: 8, fontSize: "1.8rem", fontWeight: 600 }}>{icon} {title}</h1>
            <p style={{ color: "#6b7280", margin: 0 }}>Gestiona los paquetes turísticos y sus cupos</p>
          </div>

          {/* Toggle Mostrar Archivo */}
          {packages.length > 0 && (
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.95rem', color: '#6b7280', fontWeight: 500 }}>
                  📦 Mostrar archivo (cancelados/finalizados)
                </span>
              </label>
            </div>
          )}

          {/* Botón Crear Viaje */}
          <div style={{ marginBottom: 24 }}>
            <button
              onClick={openCreateForm}
              style={{
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: 8,
                padding: "12px 24px",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(59, 130, 246, 0.25)",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 4px 16px rgba(59, 130, 246, 0.35)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(59, 130, 246, 0.25)";
              }}
            >
              + Crear Viaje
            </button>
          </div>

          {/* Grid de tarjetas */}
          {(() => {
            const filteredPackages = showArchived 
              ? packages.filter(pkg => pkg.status === 'CANCELLED' || pkg.status === 'COMPLETED')
              : packages.filter(pkg => pkg.status === 'OPEN' || pkg.status === 'CLOSED');
            
            if (filteredPackages.length === 0) {
              return (
                <div
                  style={{
                    background: "white",
                    borderRadius: 12,
                    padding: 60,
                    textAlign: "center",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div style={{ fontSize: "3rem", marginBottom: 16 }}>{icon}</div>
                  <h3 style={{ marginBottom: 8, color: "#374151" }}>
                    {showArchived ? "No hay viajes en archivo" : "No hay viajes activos"}
                  </h3>
                  <p style={{ color: "#6b7280", marginBottom: 24 }}>
                    {showArchived 
                      ? "Los viajes cancelados y finalizados aparecerán aquí" 
                      : "Usa el botón \"+ Crear Viaje\" para comenzar"}
                  </p>
                </div>
              );
            }

            return (
              <div
                className="travel-packages-grid"
                style={{
                  width: "100%",
                }}
              >
                {filteredPackages.map((pkg) => {
                  const percentage = Math.round((pkg.occupiedSlots / pkg.capacity) * 100);
                  const statusInfo = getStatusBadge(pkg.status);
                  const isArchived = pkg.status === 'CANCELLED' || pkg.status === 'COMPLETED';

                  return (
                    <div
                      key={pkg.id}
                      style={{
                        background: "white",
                        borderRadius: 14,
                        border: "1px solid #e5e7eb",
                        padding: 20,
                        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
                        transition: "transform 0.2s, box-shadow 0.2s",
                        cursor: isArchived ? "default" : "pointer",
                        minWidth: 0,
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
                      onClick={() => {
                        if (!isArchived) openEditForm(pkg);
                      }}
                    >
                      {/* Status Badge */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <span
                          style={{
                            background: statusInfo.bg,
                            color: statusInfo.color,
                            padding: "4px 10px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {statusInfo.label}
                        </span>
                        <span style={{ color: "#9ca3af", fontSize: 13, fontWeight: 500 }}>
                          {pkg.packageCode}
                        </span>
                      </div>

                      {/* Título */}
                      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8, lineHeight: 1.3 }}>
                        {pkg.name}
                      </h3>
                      <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 12 }}>
                        📍 {pkg.destination}
                      </p>

                      {/* Fechas */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
                        <div style={{ display: "flex", gap: 8, fontSize: 13, color: "#6b7280" }}>
                          <span style={{ fontWeight: 500 }}>📅 Salida:</span>
                          <span>{formatDate(pkg.departureDate)}</span>
                        </div>
                        <div style={{ display: "flex", gap: 8, fontSize: 13, color: "#6b7280" }}>
                          <span style={{ fontWeight: 500 }}>📅 Regreso:</span>
                          <span>{formatDate(pkg.returnDate)}</span>
                        </div>
                      </div>

                      {/* Precio */}
                      <div style={{ marginBottom: 16 }}>
                        <span style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>
                          {formatPrice(pkg.packagePrice, pkg.priceCurrency)}
                        </span>
                      </div>

                      {/* Progreso de Capacidad */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>
                            Ocupación
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: getProgressColor(percentage) }}>
                            {pkg.occupiedSlots} / {pkg.capacity} ({percentage}%)
                          </span>
                        </div>
                        <div
                          style={{
                            width: "100%",
                            height: 8,
                            background: "#f3f4f6",
                            borderRadius: 999,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(percentage, 100)}%`,
                              height: "100%",
                              background: getProgressColor(percentage),
                              borderRadius: 999,
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                      </div>

                      {/* Botón Cancelar (solo visible si está activo) */}
                      {!isArchived && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(pkg);
                          }}
                          style={{
                            marginTop: 12,
                            width: "100%",
                            background: "#fef2f2",
                            color: "#dc2626",
                            border: "1px solid #fecaca",
                            borderRadius: 6,
                            padding: "8px 0",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "background 0.2s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#fee2e2";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#fef2f2";
                          }}
                        >
                          Cancelar Viaje
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </main>

      {/* Modal de Formulario */}
      {showForm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
          onClick={closeForm}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 32,
              maxWidth: 600,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: 24, fontSize: 24, fontWeight: 700 }}>
              {editingPackage ? "Editar Viaje" : "Crear Nuevo Viaje"}
            </h2>

            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
                  Nombre del Viaje *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                  placeholder="Ej: París Romántico 2026"
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
                  Destino *
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                  placeholder="Ej: París, Francia"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
                    Fecha de Salida *
                  </label>
                  <input
                    type="date"
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid #d1d5db",
                      borderRadius: 6,
                      fontSize: 14,
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
                    Fecha de Regreso *
                  </label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid #d1d5db",
                      borderRadius: 6,
                      fontSize: 14,
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
                  Capacidad (personas) *
                </label>
                <input
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                  placeholder="Ej: 40"
                  min="1"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
                    Precio del Paquete
                  </label>
                  <input
                    type="number"
                    value={packagePrice}
                    onChange={(e) => setPackagePrice(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid #d1d5db",
                      borderRadius: 6,
                      fontSize: 14,
                    }}
                    placeholder="Ej: 2500"
                    min="0"
                    step="0.01"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
                    Moneda
                  </label>
                  <select
                    value={priceCurrency}
                    onChange={(e) => setPriceCurrency(e.target.value as "USD" | "CRC")}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid #d1d5db",
                      borderRadius: 6,
                      fontSize: 14,
                    }}
                  >
                    <option value="USD">USD</option>
                    <option value="CRC">CRC</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
                  Monto Mínimo de Reserva
                </label>
                <input
                  type="number"
                  value={minReservation}
                  onChange={(e) => setMinReservation(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                  placeholder="Ej: 500"
                  min="0"
                  step="0.01"
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
                  Estado
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                >
                  <option value="OPEN">Abierto</option>
                  <option value="CLOSED">Suspendido</option>
                  <option value="CANCELLED">Cancelado</option>
                  <option value="COMPLETED">Finalizado</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button
                onClick={handleSubmit}
                disabled={saving}
                style={{
                  flex: 1,
                  background: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  padding: "12px",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Guardando..." : editingPackage ? "Actualizar" : "Crear"}
              </button>
              <button
                onClick={closeForm}
                style={{
                  flex: 1,
                  background: "#f3f4f6",
                  color: "#6b7280",
                  border: "none",
                  borderRadius: 6,
                  padding: "12px",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

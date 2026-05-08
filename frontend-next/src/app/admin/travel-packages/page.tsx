"use client";

export const dynamic = 'force-dynamic';

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
import { ToastNotification, useToast } from "@/components/toast-notification";
import { ConfirmModal } from "@/components/confirm-modal";
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
    default:
      return { label: status, bg: "#f3f4f6", color: "#6b7280" };
  }
};

export default function TravelPackagesPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [packages, setPackages] = useState<TravelPackage[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPackage, setEditingPackage] = useState<TravelPackage | null>(null);
  const { toasts, showSuccess, showError, dismissToast } = useToast();

  // Form state
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [capacity, setCapacity] = useState("");
  const [packagePrice, setPackagePrice] = useState("");
  const [priceCurrency, setPriceCurrency] = useState<"USD" | "CRC">("USD");
  const [status, setStatus] = useState<"OPEN" | "CLOSED" | "CANCELLED">("OPEN");

  // Modal de confirmación
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
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
    setConfirmModal({ ...confirmModal, isOpen: false });
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
  }, []);

  const loadPackages = async () => {
    try {
      setLoading(true);
      const data = await getAllTravelPackages();
      setPackages(data);
    } catch (err: any) {
      showError(err.message || "Error cargando viajes");
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
      showError("Por favor completa todos los campos obligatorios");
      return;
    }

    const capacityNum = parseInt(capacity, 10);
    if (isNaN(capacityNum) || capacityNum < 1) {
      showError("La capacidad debe ser un número mayor a 0");
      return;
    }

    const priceNum = packagePrice.trim() ? parseFloat(packagePrice) : undefined;
    if (priceNum !== undefined && (isNaN(priceNum) || priceNum < 0)) {
      showError("El precio debe ser un número válido");
      return;
    }

    const data: CreateTravelPackageInput = {
      name: name.trim(),
      destination: destination.trim(),
      departureDate,
      returnDate,
      capacity: capacityNum,
      packagePrice: priceNum,
      priceCurrency,
      status,
    };

    try {
      setSaving(true);
      if (editingPackage) {
        await updateTravelPackage(editingPackage.id, data);
        showSuccess("Viaje actualizado exitosamente");
      } else {
        await createTravelPackage(data);
        showSuccess("Viaje creado exitosamente");
      }
      closeForm();
      await loadPackages();
    } catch (err: any) {
      showError(err.message || "Error al guardar el viaje");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (pkg: TravelPackage) => {
    showConfirm({
      title: "Cancelar Viaje",
      message: `¿Estás seguro que deseas cancelar el viaje "${pkg.name}"? Esta acción no se puede deshacer.`,
      confirmText: "Sí, cancelar viaje",
      variant: "danger",
      onConfirm: async () => {
        try {
          await deleteTravelPackage(pkg.id);
          showSuccess("Viaje cancelado exitosamente");
          await loadPackages();
        } catch (err: any) {
          showError(err.message || "Error al cancelar el viaje");
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
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        confirmVariant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
      />

      <main className="app-shell" style={{ padding: "20px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ marginBottom: 30, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h1 style={{ marginBottom: 8, fontSize: "1.8rem", fontWeight: 600 }}>✈️ Viajes Programados</h1>
            <p style={{ color: "#6b7280", margin: 0 }}>Gestiona los paquetes turísticos y sus cupos</p>
          </div>
          <button
            onClick={openCreateForm}
            style={{
              padding: "12px 24px",
              background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
              color: "white",
              border: "none",
              borderRadius: 10,
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
              transition: "transform 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
          >
            + Crear Viaje
          </button>
        </div>

        {/* Grid de tarjetas */}
        {packages.length === 0 ? (
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 60,
              textAlign: "center",
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>✈️</div>
            <h3 style={{ marginBottom: 8, color: "#374151" }}>No hay viajes programados</h3>
            <p style={{ color: "#6b7280", marginBottom: 24 }}>Crea tu primer viaje para comenzar</p>
            <button
              onClick={openCreateForm}
              style={{
                padding: "10px 20px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: "0.95rem",
                fontWeight: 600,
              }}
            >
              Crear Viaje
            </button>
          </div>
        ) : (
          <div
            className="travel-packages-grid"
            style={{
              width: "100%",
            }}
          >
            {packages.map((pkg) => {
              const percentage = Math.round((pkg.occupiedSlots / pkg.capacity) * 100);
              const statusInfo = getStatusBadge(pkg.status);

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
                    cursor: "pointer",
                    minWidth: 0, // Allow grid to shrink
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-4px)";
                    e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.12)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.04)";
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
                    {pkg.packageCode}
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
                    {pkg.name}
                  </h3>

                  {/* Destino */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                    <span style={{ fontSize: "1rem" }}>📍</span>
                    <span style={{ color: "#6b7280", fontSize: "0.95rem" }}>{pkg.destination}</span>
                  </div>

                  {/* Fechas */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                    <span style={{ fontSize: "1rem" }}>📅</span>
                    <span style={{ color: "#6b7280", fontSize: "0.9rem" }}>
                      {formatDate(pkg.departureDate)} - {formatDate(pkg.returnDate)}
                    </span>
                  </div>

                  {/* Precio */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
                    <span style={{ fontSize: "1rem" }}>💰</span>
                    <span style={{ color: "#111827", fontSize: "1rem", fontWeight: 600 }}>
                      {formatPrice(pkg.packagePrice, pkg.priceCurrency)}
                    </span>
                  </div>

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
                        {pkg.occupiedSlots}/{pkg.capacity} personas
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

                  {/* Botones de acción */}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditForm(pkg);
                      }}
                      style={{
                        flex: 1,
                        padding: "10px 16px",
                        background: "#3b82f6",
                        color: "white",
                        border: "none",
                        borderRadius: 8,
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "background 0.2s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#2563eb")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "#3b82f6")}
                    >
                      Editar
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(pkg);
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </main>

      {/* Modal Crear/Editar */}
      {showForm && (
        <div
          style={{
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
          onClick={closeForm}
        >
          <div
            style={{
              background: "white",
              borderRadius: 16,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
              maxWidth: 600,
              width: "90%",
              maxHeight: "90vh",
              overflow: "auto",
              animation: "slideUp 0.3s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header con gradiente */}
            <div
              style={{
                background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                padding: "32px 32px 24px 32px",
                color: "white",
                position: "relative",
              }}
            >
              <button
                onClick={closeForm}
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
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)")}
              >
                ×
              </button>
              <h2 style={{ margin: 0, fontSize: "1.75rem" }}>
                {editingPackage ? "Editar Viaje" : "Crear Nuevo Viaje"}
              </h2>
            </div>

            {/* Body del formulario */}
            <div style={{ padding: 32 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Nombre del viaje */}
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#374151" }}>
                    Nombre del Viaje <span style={{ color: "#ef4444" }}>*</span>
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tour Costa Rica Mayo 2026"
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
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Costa Rica"
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
                      value={departureDate}
                      onChange={(e) => setDepartureDate(e.target.value)}
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
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
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
                    min="1"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
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
                      min="0"
                      step="0.01"
                      value={packagePrice}
                      onChange={(e) => setPackagePrice(e.target.value)}
                      placeholder="1250.00"
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
                      value={priceCurrency}
                      onChange={(e) => setPriceCurrency(e.target.value as "USD" | "CRC")}
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

                <div
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #3b82f6",
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
                        checked={status === "OPEN"}
                        onChange={(e) => setStatus(e.target.value as "OPEN")}
                        style={{ cursor: "pointer" }}
                      />
                      <span style={{ fontSize: "0.95rem" }}>✅ Activo</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="status"
                        value="CLOSED"
                        checked={status === "CLOSED"}
                        onChange={(e) => setStatus(e.target.value as "CLOSED")}
                        style={{ cursor: "pointer" }}
                      />
                      <span style={{ fontSize: "0.95rem" }}>⏸ Stand By</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="status"
                        value="CANCELLED"
                        checked={status === "CANCELLED"}
                        onChange={(e) => setStatus(e.target.value as "CANCELLED")}
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
                  onClick={closeForm}
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
                  onClick={handleSubmit}
                  disabled={saving}
                  style={{
                    padding: "12px 24px",
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    fontSize: "1rem",
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                    boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? "Guardando..." : editingPackage ? "💾 Guardar Cambios" : "✨ Crear Viaje"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

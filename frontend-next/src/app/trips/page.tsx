"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, getHomeRouteForRole } from "@/lib/auth-api";
import { getAllTravelPackages, type TravelPackage } from "@/lib/travel-packages-api";
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
      return { label: "🔴 LLENO", bg: "#fee2e2", color: "#991b1b" };
    case "CANCELLED":
      return { label: "⚫ CANCELADO", bg: "#f3f4f6", color: "#374151" };    case "COMPLETED":
      return { label: "🏁 FINALIZADO", bg: "#e0e7ff", color: "#3730a3" };    default:
      return { label: status, bg: "#f3f4f6", color: "#6b7280" };
  }
};

export default function TripsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<TravelPackage[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
    const session = getStoredSession();

    if (!session?.user?.id) {
      router.replace("/");
      return;
    }

    const role = String(session.user.role || "").toUpperCase();
    // Solo agentes y roles operativos pueden ver esta página
    if (!["AGENT", "AGENTE", "OPERATIONS", "OPERACIONES", "VENTAS"].includes(role)) {
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
      setError(err.message || "Error cargando viajes");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTrip = (pkg: TravelPackage) => {
    // Solo permitir click si el viaje está OPEN
    if (pkg.status !== "OPEN") return;
    
    // Redirigir al formulario de contratos con el travelPackageId
    router.push(`/contracts?travelPackageId=${pkg.id}`);
  };

  if (!mounted || loading) {
    return <PageLoader />;
  }

  return (
    <main className="app-shell" style={{ padding: "20px" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 30 }}>
          <h1 style={{ marginBottom: 8, fontSize: "1.8rem", fontWeight: 600 }}>✈️ Viajes Disponibles</h1>
          <p style={{ color: "#6b7280", margin: 0 }}>Selecciona un viaje para crear un contrato</p>
        </div>

        {error && (
          <div
            style={{
              padding: "12px 16px",
              background: "#fee2e2",
              border: "1px solid #fca5a5",
              borderRadius: 8,
              color: "#991b1b",
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

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
            <p style={{ color: "#6b7280", marginBottom: 0 }}>Pronto habrá nuevos destinos disponibles</p>
          </div>
        ) : (
          <div className="travel-packages-grid" style={{ width: "100%" }}>
            {packages.map((pkg) => {
              const percentage = Math.round((pkg.occupiedSlots / pkg.capacity) * 100);
              const statusInfo = getStatusBadge(pkg.status);
              const isClickable = pkg.status === "OPEN";

              return (
                <div
                  key={pkg.id}
                  onClick={() => handleSelectTrip(pkg)}
                  style={{
                    background: "white",
                    borderRadius: 14,
                    border: isClickable ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                    padding: 20,
                    boxShadow: isClickable ? "0 4px 12px rgba(59, 130, 246, 0.15)" : "0 2px 8px rgba(0, 0, 0, 0.04)",
                    transition: "transform 0.2s, box-shadow 0.2s, border-color 0.2s",
                    cursor: isClickable ? "pointer" : "not-allowed",
                    opacity: isClickable ? 1 : 0.6,
                    minWidth: 0,
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    if (isClickable) {
                      e.currentTarget.style.transform = "translateY(-4px)";
                      e.currentTarget.style.boxShadow = "0 12px 28px rgba(59, 130, 246, 0.25)";
                      e.currentTarget.style.borderColor = "#2563eb";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isClickable) {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(59, 130, 246, 0.15)";
                      e.currentTarget.style.borderColor = "#3b82f6";
                    }
                  }}
                >
                  {/* Indicador de clickable */}
                  {isClickable && (
                    <div
                      style={{
                        position: "absolute",
                        top: 12,
                        right: 12,
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        color: "white",
                        padding: "4px 10px",
                        borderRadius: 8,
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
                      }}
                    >
                      👆 Click para seleccionar
                    </div>
                  )}

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
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: "1rem" }}>💰</span>
                    <span style={{ color: "#111827", fontSize: "1rem", fontWeight: 600 }}>
                      {formatPrice(pkg.packagePrice, pkg.priceCurrency)}
                    </span>
                  </div>

                  {/* Monto de Reserva */}
                  {pkg.minReservation && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
                      <span style={{ fontSize: "1rem" }}>🏷️</span>
                      <span style={{ color: "#059669", fontSize: "0.9rem", fontWeight: 600 }}>
                        Reserva: {formatPrice(pkg.minReservation, pkg.priceCurrency)}
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
                        {pkg.occupiedSlots}/{pkg.capacity} personas
                      </span>
                      <span style={{ fontWeight: 600, color: getProgressColor(percentage) }}>{percentage}%</span>
                    </div>
                  </div>

                  {/* Badge de estado */}
                  <div style={{ marginBottom: 0 }}>
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

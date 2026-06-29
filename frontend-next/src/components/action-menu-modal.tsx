"use client";

import { useEffect } from "react";

type ActionMenuModalProps = {
  isOpen: boolean;
  onSelectTrips: () => void;
  onSelectMigration: () => void;
  onSelectInternalTrips?: () => void;
  onSelectQuote: () => void;
  onSelectCustom: () => void;
};

export function ActionMenuModal({ isOpen, onSelectTrips, onSelectMigration, onSelectInternalTrips }: ActionMenuModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
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
        zIndex: 2000,
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 20,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          maxWidth: 500,
          width: "90%",
          padding: "40px",
          animation: "slideUp 0.3s ease-out",
        }}
      >
        <h2
          style={{
            margin: "0 0 12px 0",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "#1f2937",
            textAlign: "center",
          }}
        >
          ¿Qué necesitas hoy?
        </h2>

        <p
          style={{
            margin: "0 0 32px 0",
            fontSize: "0.95rem",
            color: "#6b7280",
            textAlign: "center",
          }}
        >
          Selecciona una opción para continuar
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Opción 1: Viajes Disponibles - HABILITADA */}
          <button
            onClick={onSelectTrips}
            style={{
              padding: "20px 24px",
              background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
              color: "white",
              border: "none",
              borderRadius: 12,
              fontSize: "1.05rem",
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: 16,
              boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 20px rgba(59, 130, 246, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(59, 130, 246, 0.3)";
            }}
          >
            <span style={{ fontSize: "2rem" }}>✈️</span>
            <div>
              <div style={{ fontWeight: 700 }}>Viajes Internacionales</div>
              <div style={{ fontSize: "0.85rem", opacity: 0.9, marginTop: 4 }}>
                Ver paquetes turísticos programados
              </div>
            </div>
          </button>

          {/* Opción 2: Migrar Contrato - HABILITADA */}
          <button
            onClick={onSelectMigration}
            style={{
              padding: "20px 24px",
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              color: "white",
              border: "none",
              borderRadius: 12,
              fontSize: "1.05rem",
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: 16,
              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 20px rgba(16, 185, 129, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(16, 185, 129, 0.3)";
            }}
          >
            <span style={{ fontSize: "2rem" }}>📄</span>
            <div>
              <div style={{ fontWeight: 700 }}>Contratos de Migración</div>
              <div style={{ fontSize: "0.85rem", opacity: 0.9, marginTop: 4 }}>
                Ver paquetes de migración programados
              </div>
            </div>
          </button>

          {/* Opción 3: Viajes Internos - HABILITADA */}
          {onSelectInternalTrips && (
            <button
              onClick={onSelectInternalTrips}
              style={{
                padding: "20px 24px",
                background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                color: "white",
                border: "none",
                borderRadius: 12,
                fontSize: "1.05rem",
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 16,
                boxShadow: "0 4px 12px rgba(245, 158, 11, 0.3)",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 8px 20px rgba(245, 158, 11, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(245, 158, 11, 0.3)";
              }}
            >
              <span style={{ fontSize: "2rem" }}>🚌</span>
              <div>
                <div style={{ fontWeight: 700 }}>Viaje Interno</div>
                <div style={{ fontSize: "0.85rem", opacity: 0.9, marginTop: 4 }}>
                  Gestionar viajes domésticos y reservas
                </div>
              </div>
            </button>
          )}

          {/* Opción 4: Cotización - DISABLED */}
          <button
            disabled
            style={{
              padding: "20px 24px",
              background: "#f3f4f6",
              color: "#9ca3af",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              fontSize: "1.05rem",
              fontWeight: 600,
              cursor: "not-allowed",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: 16,
              opacity: 0.6,
            }}
          >
            <span style={{ fontSize: "2rem" }}>📋</span>
            <div>
              <div style={{ fontWeight: 700 }}>Solicitud de Cotización</div>
              <div style={{ fontSize: "0.85rem", marginTop: 4 }}>Próximamente disponible</div>
            </div>
          </button>

          {/* Opción 5: Viaje Personalizado - DISABLED */}
          <button
            disabled
            style={{
              padding: "20px 24px",
              background: "#f3f4f6",
              color: "#9ca3af",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              fontSize: "1.05rem",
              fontWeight: 600,
              cursor: "not-allowed",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: 16,
              opacity: 0.6,
            }}
          >
            <span style={{ fontSize: "2rem" }}>🎒</span>
            <div>
              <div style={{ fontWeight: 700 }}>Viaje Personalizado</div>
              <div style={{ fontSize: "0.85rem", marginTop: 4 }}>Próximamente disponible</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

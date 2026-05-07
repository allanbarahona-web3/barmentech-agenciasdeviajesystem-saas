"use client";

import { useRouter } from "next/navigation";

type ExchangeRateAlertModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function ExchangeRateAlertModal({ isOpen, onClose }: ExchangeRateAlertModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const handleConfigureNow = () => {
    onClose();
    router.push("/admin/exchange-rate");
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
          borderRadius: 16,
          padding: 40,
          maxWidth: 500,
          width: "90%",
          boxShadow: "0 25px 50px rgba(0,0,0,0.4)",
          color: "white",
          textAlign: "center",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: "4rem", marginBottom: 20 }}>⚠️</div>
        <h3
          style={{
            margin: "0 0 12px 0",
            fontSize: "1.5rem",
            fontWeight: 700,
          }}
        >
          Tipo de Cambio No Configurado
        </h3>
        <p
          style={{
            marginBottom: 30,
            fontSize: "1.05rem",
            lineHeight: 1.6,
            opacity: 0.95,
          }}
        >
          No hay tipo de cambio configurado para hoy. <br />
          Esta es una tarea fundamental que debe completarse al inicio del día.
        </p>

        <button
          onClick={handleConfigureNow}
          style={{
            padding: "14px 32px",
            fontSize: "1rem",
            fontWeight: 700,
            background: "white",
            color: "#dc2626",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            transition: "transform 0.15s ease",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.transform = "scale(1.05)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.transform = "scale(1)")
          }
        >
          ✅ Entendido, configurar ahora
        </button>
      </div>
    </div>
  );
}

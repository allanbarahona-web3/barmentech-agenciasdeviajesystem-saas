"use client";

import { useEffect } from "react";

type ShiftModalProps = {
  isOpen: boolean;
  onStart: () => void;
  isLoading?: boolean;
  error?: string;
};

export function ShiftModal({ isOpen, onStart, isLoading = false, error }: ShiftModalProps) {
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
          maxWidth: 450,
          width: "90%",
          padding: "48px 40px",
          textAlign: "center",
          animation: "slideUp 0.3s ease-out",
        }}
      >
        {/* Icono de reloj animado */}
        <div
          style={{
            fontSize: "4rem",
            marginBottom: 24,
            animation: "pulse 2s ease-in-out infinite",
          }}
        >
          🕐
        </div>

        <h2
          style={{
            margin: "0 0 12px 0",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "#1f2937",
          }}
        >
          ¡Bienvenido!
        </h2>

        <p
          style={{
            margin: "0 0 32px 0",
            fontSize: "1rem",
            color: "#6b7280",
            lineHeight: 1.6,
          }}
        >
          Estás a punto de iniciar tu jornada de trabajo.
        </p>

        <button
          onClick={onStart}
          disabled={isLoading}
          style={{
            width: "100%",
            padding: "16px 32px",
            background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
            color: "white",
            border: "none",
            borderRadius: 12,
            fontSize: "1.1rem",
            fontWeight: 700,
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.75 : 1,
            boxShadow: "0 4px 16px rgba(16, 185, 129, 0.4)",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
          onMouseEnter={(e) => {
            if (isLoading) return;
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 8px 24px rgba(16, 185, 129, 0.5)";
          }}
          onMouseLeave={(e) => {
            if (isLoading) return;
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 16px rgba(16, 185, 129, 0.4)";
          }}
        >
          {isLoading ? "⏳ Marcando..." : "🚀 Iniciar Shift"}
        </button>

        {error ? (
          <p
            style={{
              margin: "12px 0 0 0",
              fontSize: "0.9rem",
              color: "#b91c1c",
            }}
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

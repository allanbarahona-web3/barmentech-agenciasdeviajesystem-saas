"use client";

export const dynamic = 'force-dynamic';

import { useRouter } from "next/navigation";

export default function TimeclockPage() {
  const router = useRouter();

  return (
    <div className="container">
      <div style={{
        maxWidth: "600px",
        margin: "80px auto",
        textAlign: "center",
        padding: "40px",
        background: "white",
        borderRadius: "12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
      }}>
        <div style={{ fontSize: "64px", marginBottom: "20px" }}>⏰</div>
        <h1 style={{ fontSize: "32px", marginBottom: "16px", color: "#333" }}>
          Control de Asistencia
        </h1>
        <p style={{ fontSize: "18px", color: "#666", marginBottom: "12px" }}>
          Próximamente...
        </p>
        <p style={{ fontSize: "14px", color: "#999", marginBottom: "32px" }}>
          Sistema avanzado de marcaje de entrada/salida con geolocalización y verificación biométrica.
        </p>
        <div style={{
          background: "#f8f9fa",
          padding: "20px",
          borderRadius: "8px",
          marginBottom: "32px",
          textAlign: "left"
        }}>
          <h3 style={{ fontSize: "16px", marginBottom: "12px", color: "#555" }}>
            Funcionalidades Planificadas:
          </h3>
          <ul style={{ fontSize: "14px", color: "#666", lineHeight: "1.8" }}>
            <li>📍 Marcaje con geolocalización GPS</li>
            <li>📸 Verificación con selfie (prevenir fraude)</li>
            <li>⏱️ Registro de horas trabajadas en tiempo real</li>
            <li>📊 Cálculo automático de horas extras</li>
            <li>📅 Gestión de turnos y horarios</li>
            <li>🚨 Alertas de ausencias y tardanzas</li>
            <li>💰 Integración directa con Planilla</li>
            <li>📱 App móvil para marcaje remoto</li>
          </ul>
          <div style={{
            marginTop: "16px",
            padding: "12px",
            background: "#fff3cd",
            borderRadius: "6px",
            fontSize: "13px",
            color: "#856404"
          }}>
            <strong>📝 Nota:</strong> Ver especificación completa en{" "}
            <code style={{ background: "#fff", padding: "2px 6px", borderRadius: "3px" }}>
              TIMECLOCK-SYSTEM-SPEC.md
            </code>
          </div>
        </div>
        <button
          onClick={() => router.back()}
          style={{
            padding: "12px 24px",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "16px",
            cursor: "pointer",
            transition: "transform 0.2s"
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
        >
          ← Volver
        </button>
      </div>
    </div>
  );
}

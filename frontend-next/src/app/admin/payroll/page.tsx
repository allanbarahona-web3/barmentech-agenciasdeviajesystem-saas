"use client";

export const dynamic = 'force-dynamic';

import { useRouter } from "next/navigation";

export default function PayrollPage() {
  const router = useRouter();

  return (
    <main className="app-shell">
      <div style={{
        maxWidth: "600px",
        margin: "80px auto",
        textAlign: "center",
        padding: "40px",
        background: "white",
        borderRadius: "12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
      }}>
        <div style={{ fontSize: "64px", marginBottom: "20px" }}>💰</div>
        <h1 style={{ fontSize: "32px", marginBottom: "16px", color: "#333" }}>
          Módulo de Planilla/Nómina
        </h1>
        <p style={{ fontSize: "18px", color: "#666", marginBottom: "12px" }}>
          Próximamente...
        </p>
        <p style={{ fontSize: "14px", color: "#999", marginBottom: "32px" }}>
          Sistema completo de gestión de nómina con cálculo automático de deducciones, provisiones y pagos.
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
            <li>💵 Cálculo automático de salarios</li>
            <li>📊 Deducciones legales (CCSS, Renta, etc.)</li>
            <li>🎁 Provisiones (Aguinaldo, Vacaciones)</li>
            <li>⏰ Integración con Control de Asistencia</li>
            <li>📈 Horas extras y bonificaciones</li>
            <li>📄 Generación de recibos de pago</li>
            <li>💳 Integración con sistemas de pago bancario</li>
            <li>📊 Reportes fiscales y contables</li>
          </ul>
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
    </main>
  );
}

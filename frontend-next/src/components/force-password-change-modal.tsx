"use client";

import { useEffect, useState } from "react";
import { changePassword, clearStoredToken } from "@/lib/auth-api";

type ForcePasswordChangeModalProps = {
  isOpen: boolean;
  userEmail: string;
};

export function ForcePasswordChangeModal({ isOpen, userEmail }: ForcePasswordChangeModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validaciones
    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      setError("La contraseña debe incluir al menos una letra mayúscula");
      return;
    }

    if (!/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/`~]/.test(newPassword)) {
      setError("La contraseña debe incluir al menos un carácter especial (!@#$%&*...)");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    if (newPassword === currentPassword) {
      setError("La nueva contraseña debe ser diferente a la actual");
      return;
    }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      
      // Esperar 2 segundos para mostrar éxito, luego logout automático con hard reload
      setTimeout(() => {
        clearStoredToken();
        window.location.href = "/"; // Hard reload para evitar errores 401 con token inválido
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña");
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        animation: "fadeIn 0.3s ease-out",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 20,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.4)",
          maxWidth: 500,
          width: "90%",
          padding: "40px",
          animation: "slideUp 0.4s ease-out",
        }}
      >
        {success ? (
          // Vista de éxito
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "4rem", marginBottom: 20, animation: "scaleIn 0.5s ease-out" }}>
              ✅
            </div>
            <h2 style={{ margin: "0 0 12px 0", fontSize: "1.75rem", fontWeight: 700, color: "#10b981" }}>
              ¡Contraseña Actualizada!
            </h2>
            <p style={{ margin: 0, color: "#6b7280", fontSize: "1rem" }}>
              Cerrando sesión para que ingreses con tu nueva contraseña...
            </p>
          </div>
        ) : (
          <>
            {/* Header con warning */}
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div
                style={{
                  width: 80,
                  height: 80,
                  background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px auto",
                  fontSize: "2.5rem",
                  boxShadow: "0 8px 24px rgba(245, 158, 11, 0.3)",
                }}
              >
                🔐
              </div>
              <h2 style={{ margin: "0 0 12px 0", fontSize: "1.75rem", fontWeight: 700, color: "#1f2937" }}>
                Cambio de Contraseña Obligatorio
              </h2>
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.95rem", lineHeight: 1.5 }}>
                Por seguridad, debes cambiar tu contraseña temporal antes de continuar
              </p>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Usuario (readonly) */}
              <div>
                <label style={{ display: "block", marginBottom: 8, fontSize: "0.875rem", fontWeight: 600, color: "#374151" }}>
                  📧 Usuario
                </label>
                <input
                  type="text"
                  value={userEmail}
                  readOnly
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "2px solid #e5e7eb",
                    borderRadius: 10,
                    fontSize: "1rem",
                    backgroundColor: "#f9fafb",
                    color: "#6b7280",
                    cursor: "not-allowed",
                  }}
                />
              </div>

              {/* Contraseña actual */}
              <div>
                <label style={{ display: "block", marginBottom: 8, fontSize: "0.875rem", fontWeight: 600, color: "#374151" }}>
                  🔑 Contraseña Actual
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  disabled={saving}
                  placeholder="Ingresa tu contraseña temporal"
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "2px solid #e5e7eb",
                    borderRadius: 10,
                    fontSize: "1rem",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = "#f59e0b"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "#e5e7eb"}
                />
              </div>

              {/* Nueva contraseña */}
              <div>
                <label style={{ display: "block", marginBottom: 8, fontSize: "0.875rem", fontWeight: 600, color: "#374151" }}>
                  🆕 Nueva Contraseña
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={saving}
                  placeholder="Mínimo 8 caracteres, 1 mayúscula, 1 especial"
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "2px solid #e5e7eb",
                    borderRadius: 10,
                    fontSize: "1rem",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = "#f59e0b"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "#e5e7eb"}
                />
              </div>

              {/* Confirmar contraseña */}
              <div>
                <label style={{ display: "block", marginBottom: 8, fontSize: "0.875rem", fontWeight: 600, color: "#374151" }}>
                  ✓ Confirmar Nueva Contraseña
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={saving}
                  placeholder="Repite la nueva contraseña"
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "2px solid #e5e7eb",
                    borderRadius: 10,
                    fontSize: "1rem",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = "#f59e0b"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "#e5e7eb"}
                />
              </div>

              {/* Mensaje de error */}
              {error && (
                <div
                  style={{
                    padding: "12px 16px",
                    background: "#fef2f2",
                    border: "2px solid #fecaca",
                    borderRadius: 10,
                    color: "#991b1b",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                  }}
                >
                  ⚠️ {error}
                </div>
              )}

              {/* Botón de submit */}
              <button
                type="submit"
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "16px 32px",
                  background: saving ? "#d1d5db" : "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  cursor: saving ? "not-allowed" : "pointer",
                  boxShadow: saving ? "none" : "0 4px 16px rgba(245, 158, 11, 0.4)",
                  transition: "all 0.2s",
                  marginTop: 8,
                }}
                onMouseEnter={(e) => {
                  if (!saving) {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 8px 24px rgba(245, 158, 11, 0.5)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!saving) {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 16px rgba(245, 158, 11, 0.4)";
                  }
                }}
              >
                {saving ? "⏳ Actualizando..." : "🔒 Cambiar Contraseña"}
              </button>

              {/* Info box */}
              <div
                style={{
                  padding: "12px 16px",
                  background: "#fef3c7",
                  border: "2px solid #fde68a",
                  borderRadius: 10,
                  fontSize: "0.8rem",
                  color: "#92400e",
                  lineHeight: 1.5,
                }}
              >
                <strong>ℹ️ Importante:</strong> Después de cambiar tu contraseña, tu sesión se cerrará automáticamente. Deberás iniciar sesión nuevamente con tu nueva contraseña.
              </div>
            </form>
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes scaleIn {
          from {
            transform: scale(0);
          }
          to {
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}

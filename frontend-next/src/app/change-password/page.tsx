"use client";

export const dynamic = 'force-dynamic';

import { changePassword, clearStoredToken, getStoredSession, getHomeRouteForRole } from "@/lib/auth-api";
import { ToastNotification, useToast } from "@/components/toast-notification";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ChangePasswordPage() {
  const router = useRouter();
  const session = getStoredSession();
  const { toasts, showSuccess, showError, dismissToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // If user not logged in, redirect to login
    if (!session?.user?.id) {
      router.replace("/");
      return;
    }

    // If user doesn't need to change password, redirect to appropriate page
    if (!session.user.mustChangePassword) {
      const role = String(session.user.role || "").toUpperCase();
      if (role === "ADMIN") {
        router.replace("/admin/users");
      } else {
        router.replace(getHomeRouteForRole(role));
      }
    }
  }, [session, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      showError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      showError("La contraseña debe incluir al menos una letra mayúscula");
      return;
    }

    if (!/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/`~]/.test(newPassword)) {
      showError("La contraseña debe incluir al menos un carácter especial (!@#$%&*...)");
      return;
    }

    if (newPassword !== confirmPassword) {
      showError("Las contraseñas no coinciden");
      return;
    }

    if (newPassword === currentPassword) {
      showError("La nueva contraseña debe ser diferente a la actual");
      return;
    }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      showSuccess("Contraseña actualizada correctamente. Redirigiendo...");
      
      // Wait a moment for user to see the success message
      setTimeout(() => {
        // Clear session and redirect to login
        clearStoredToken();
        router.replace("/");
      }, 2000);
    } catch (error) {
      showError(error instanceof Error ? error.message : "No se pudo cambiar la contraseña");
      setSaving(false);
    }
  };

  // Don't show page if conditions aren't met
  if (!session?.user?.id || !session.user.mustChangePassword) {
    return null;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-gray-50 to-gray-100">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header de Advertencia */}
          <div className="bg-linear-to-r from-amber-500 to-amber-600 rounded-xl p-6 mb-6 text-white">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-2xl mb-3">
              🔐
            </div>
            <h1 className="text-2xl font-bold mb-2">
              Cambio de Contraseña Obligatorio
            </h1>
            <p className="text-sm opacity-95 leading-relaxed">
              Por seguridad, debes actualizar tu contraseña antes de continuar.
            </p>
          </div>

          {/* Formulario */}
          <form onSubmit={onSubmit} className="space-y-5">
            {/* Contraseña Actual */}
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                Contraseña Actual
              </label>
              <input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={saving}
                placeholder="Tu contraseña temporal"
                className="block w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            {/* Nueva Contraseña */}
            <div>
              <label htmlFor="newPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                Nueva Contraseña
              </label>
              <input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={saving}
                placeholder="Mínimo 8 caracteres"
                minLength={8}
                className="block w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-2 leading-snug">
                • Mínimo 8 caracteres • Una mayúscula • Un carácter especial (!@#$%&*...)
              </p>
            </div>

            {/* Confirmar Nueva Contraseña */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                Confirmar Nueva Contraseña
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={saving}
                placeholder="Repite la nueva contraseña"
                minLength={8}
                className="block w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            {/* Recomendaciones */}
            <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
              <div className="flex gap-3">
                <span className="text-xl shrink-0">💡</span>
                <div className="text-sm text-blue-900 leading-relaxed">
                  <strong>Recomendaciones:</strong>
                  <ul className="mt-2 pl-5 space-y-1 list-disc">
                    <li>Usa al menos 8 caracteres</li>
                    <li>Combina letras, números y símbolos</li>
                    <li>Evita datos personales obvios</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Botón Submit */}
            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-3.5 text-lg font-semibold border-0 rounded-lg bg-linear-to-r from-green-500 to-green-600 text-white cursor-pointer transition-all shadow-md hover:shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {saving ? "⏳ Actualizando..." : "✓ Cambiar Contraseña"}
            </button>
          </form>
        </div>
      </div>

      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}

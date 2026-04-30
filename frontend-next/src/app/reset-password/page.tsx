"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { confirmPasswordReset } from "@/lib/auth-api";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setError("");

    if (!token) {
      setError("Token inválido. Por favor solicita un nuevo enlace de reseteo.");
      return;
    }

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

    setLoading(true);
    try {
      const result = await confirmPasswordReset(token, newPassword);
      setSuccess(true);
      setTimeout(() => {
        router.push("/");
      }, 3000);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "No se pudo resetear la contraseña.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-gray-50 to-gray-100">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Token Inválido</h1>
            <p className="text-red-600 mb-6">El enlace de reseteo es inválido o ha expirado.</p>
            <button 
              type="button" 
              className="w-full px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5" 
              onClick={() => router.push("/")}
            >
              Volver al inicio
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-gray-50 to-gray-100">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <h1 className="text-2xl font-bold text-green-600 mb-4">✓ Contraseña Actualizada</h1>
            <p className="text-green-600">
              Tu contraseña ha sido actualizada correctamente. Serás redirigido al inicio de sesión...
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-gray-50 to-gray-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <Image
              src="https://lucitouroperations.sfo3.digitaloceanspaces.com/contracts-assets/Almanova%20azul+dorado.webp"
              alt="Viajes Alma Nova"
              width={180}
              height={90}
              className="h-auto"
              priority
            />
          </div>

          {/* Título */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Nueva Contraseña</h1>
            <p className="text-sm text-gray-500">Ingresa tu nueva contraseña.</p>
          </div>

          {/* Formulario */}
          <form onSubmit={onSubmit} className="space-y-5">
            {/* Campo Nueva Contraseña */}
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Nueva contraseña
              </label>
              <input
                id="newPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                className="block w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              <p className="text-xs text-gray-500 mt-2">
                • Mínimo 8 caracteres • Una mayúscula • Un carácter especial (!@#$%&*...)
              </p>
            </div>

            {/* Campo Confirmar Contraseña */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirmar contraseña
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
                placeholder="Repite la contraseña"
                className="block w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            {/* Checkbox Mostrar Contraseñas */}
            <div className="flex items-center">
              <input
                id="showPassword"
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="showPassword" className="ml-2 text-sm text-gray-600 cursor-pointer">
                Mostrar contraseñas
              </label>
            </div>

            {/* Mensaje de Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Botón Actualizar */}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {loading ? "Actualizando..." : "Actualizar contraseña"}
            </button>

            {/* Botón Cancelar */}
            <button
              type="button"
              onClick={() => router.push("/")}
              className="w-full px-4 py-3 bg-white text-blue-900 border border-blue-200 font-semibold rounded-xl hover:shadow-md transition-all hover:-translate-y-0.5"
            >
              Cancelar
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-gray-50 to-gray-100">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
              <p className="text-gray-600">Cargando...</p>
            </div>
          </div>
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

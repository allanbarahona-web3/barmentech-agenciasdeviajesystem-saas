"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { getStoredSession, getStoredToken, loginWithEmailPassword, requestPasswordReset, getHomeRouteForRole, getTenantConfig } from "@/lib/auth-api";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState(""); // Honeypot field
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const [tenantLogoUrl, setTenantLogoUrl] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>("Viajes Alma Nova");

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      const session = getStoredSession();
      const homeRoute = getHomeRouteForRole(session?.user?.role);
      router.replace(homeRoute);
    }
    // Obtener configuración del tenant para branding dinámico
    void (async () => {
      try {
        const config = await getTenantConfig();
        setTenantLogoUrl(config.logoUrl);
        setTenantName(config.name);
      } catch (err) {
        console.error("No se pudo cargar la configuración del tenant:", err);
        // Usar logo por defecto si falla
        setTenantLogoUrl("https://lucitouroperations.sfo3.digitaloceanspaces.com/contracts-assets/Almanova%20azul+dorado.webp");
      }
    })();
  }, [router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    // Check honeypot - if filled, it's a bot
    if (website.trim()) {
      setError("Solicitud inválida");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await loginWithEmailPassword(email, password);
      
      // Check if user must change password
      const session = getStoredSession();
      if (session?.user?.mustChangePassword) {
        router.push("/change-password");
      } else {
        const homeRoute = getHomeRouteForRole(session?.user?.role);
        router.push(homeRoute);
      }
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "No se pudo iniciar sesion.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const onRequestReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (resetLoading) return;

    setResetError("");
    setResetMessage("");
    setResetLoading(true);
    try {
      const result = await requestPasswordReset(resetEmail);
      setResetMessage(result.message);
      setResetEmail("");
      
      // Cerrar modal automáticamente después de 2 segundos
      setTimeout(() => {
        setShowResetModal(false);
        setResetMessage("");
        setResetError("");
      }, 2000);
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : "No se pudo procesar la solicitud.";
      setResetError(message);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-gray-50 to-gray-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            {tenantLogoUrl ? (
              <Image
                src={tenantLogoUrl}
                alt={tenantName}
                width={180}
                height={90}
                className="h-auto"
                priority
              />
            ) : (
              <div className="w-[180px] h-[90px] bg-gray-200 animate-pulse rounded" />
            )}
          </div>

          {/* Título */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Ingreso de Agente</h1>
            <p className="text-sm text-gray-500">Ingresa tus credenciales para continuar</p>
          </div>

          {/* Formulario */}
          <form onSubmit={onSubmit} className="space-y-5">
            {/* Honeypot field */}
            <input
              type="text"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="sr-only"
              tabIndex={-1}
              autoComplete="nope"
              aria-hidden="true"
            />

            {/* Campo Correo */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="tu@email.com"
                className="block w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            {/* Campo Contraseña */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  placeholder="••••••••"
                  className="block w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? "Ocultar" : "Mostrar"}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {/* Link olvidaste contraseña */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {/* Mensaje de error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Botón de login */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Ingresando..." : "Iniciar sesión"}
            </button>
          </form>
        </div>
      </div>

      {/* Modal de Reset de Contraseña */}
      {showResetModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => {
            if (!resetLoading) {
              setShowResetModal(false);
              setResetError("");
              setResetMessage("");
            }
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Botón cerrar */}
            <button
              onClick={() => {
                if (!resetLoading) {
                  setShowResetModal(false);
                  setResetError("");
                  setResetMessage("");
                }
              }}
              disabled={resetLoading}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Icono */}
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>

            {/* Título */}
            <h2 className="text-xl font-semibold text-gray-900 text-center mb-2">
              Recuperar Contraseña
            </h2>
            <p className="text-sm text-gray-500 text-center mb-6">
              Te enviaremos un enlace para restablecer tu contraseña
            </p>

            {/* Formulario */}
            <form onSubmit={onRequestReset} className="space-y-4">
              <div>
                <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Correo electrónico
                </label>
                <input
                  id="reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  disabled={resetLoading}
                  placeholder="tu@email.com"
                  className="w-full px-4 py-2.5 text-[15px] bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>

              {/* Error */}
              {resetError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600 font-medium">{resetError}</p>
                </div>
              )}

              {/* Success */}
              {resetMessage && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-600 font-medium">{resetMessage}</p>
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowResetModal(false);
                    setResetError("");
                    setResetMessage("");
                  }}
                  disabled={resetLoading}
                  className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={resetLoading || !!resetMessage}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                >
                  {resetLoading ? "Enviando..." : resetMessage ? "Enviado ✓" : "Enviar enlace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

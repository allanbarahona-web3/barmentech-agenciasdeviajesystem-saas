"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getTenantConfigAdmin,
  updateTenantConfigAdmin,
  uploadTenantLogo,
  uploadTenantSignature,
  getStoredSession,
  type TenantConfigResponse,
} from "@/lib/auth-api";
import Image from "next/image";

/**
 * 🏢 Configuración del Tenant
 * 
 * Permite a los ADMIN configurar:
 * - Logo de la empresa
 * - Firma del representante legal
 * - Colores de marca (primario y secundario)
 * - Datos legales del representante
 */
export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [config, setConfig] = useState<TenantConfigResponse | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Refs para inputs de archivos
  const logoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [primaryColor, setPrimaryColor] = useState("#8B5CF6"); // Morado por defecto
  const [secondaryColor, setSecondaryColor] = useState("#10B981"); // Verde por defecto
  const [fromEmail, setFromEmail] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [legalName, setLegalName] = useState("");
  const [legalId, setLegalId] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [representativeId, setRepresentativeId] = useState("");
  const [representativeTitle, setRepresentativeTitle] = useState("");
  const [representativeMaritalStatus, setRepresentativeMaritalStatus] = useState("");
  const [representativeAddress, setRepresentativeAddress] = useState("");
  const [representativePowers, setRepresentativePowers] = useState("");

  useEffect(() => {
    // Verificar autenticación y rol ADMIN
    const session = getStoredSession();
    if (!session || session.user.role !== "ADMIN") {
      router.push("/");
      return;
    }

    loadConfig();
  }, [router]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await getTenantConfigAdmin();
      setConfig(data);

      // Cargar valores en el formulario
      setPrimaryColor(data.primaryColor || "#8B5CF6");
      setSecondaryColor(data.secondaryColor || "#10B981");
      setFromEmail(data.fromEmail || "");
      setReplyToEmail(data.replyToEmail || "");
      setLegalName(data.legalName || "");
      setLegalId(data.legalId || "");
      setRepresentativeName(data.representativeName || "");
      setRepresentativeId(data.representativeId || "");
      setRepresentativeTitle(data.representativeTitle || "");
      setRepresentativeMaritalStatus(data.representativeMaritalStatus || "");
      setRepresentativeAddress(data.representativeAddress || "");
      setRepresentativePowers(data.representativePowers || "");
    } catch (err) {
      console.error("Error al cargar configuración:", err);
      setError(err instanceof Error ? err.message : "Error al cargar configuración");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validaciones
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      setError("Solo se aceptan imágenes JPEG, PNG o WebP");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("El archivo es demasiado grande. Máximo 5 MB");
      return;
    }

    try {
      setUploadingLogo(true);
      setError("");
      setSuccess("");

      const result = await uploadTenantLogo(file);
      setSuccess(`Logo subido exitosamente`);

      // Recargar configuración
      await loadConfig();
    } catch (err) {
      console.error("Error al subir logo:", err);
      setError(err instanceof Error ? err.message : "Error al subir logo");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) {
        logoInputRef.current.value = "";
      }
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validaciones
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      setError("Solo se aceptan imágenes JPEG, PNG o WebP");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("El archivo es demasiado grande. Máximo 5 MB");
      return;
    }

    try {
      setUploadingSignature(true);
      setError("");
      setSuccess("");

      const result = await uploadTenantSignature(file);
      setSuccess(`Firma subida exitosamente`);

      // Recargar configuración
      await loadConfig();
    } catch (err) {
      console.error("Error al subir firma:", err);
      setError(err instanceof Error ? err.message : "Error al subir firma");
    } finally {
      setUploadingSignature(false);
      if (signatureInputRef.current) {
        signatureInputRef.current.value = "";
      }
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      // Detectar si se están cambiando los emails
      const emailsChanging =
        (fromEmail.trim() !== (config?.fromEmail || "")) ||
        (replyToEmail.trim() !== (config?.replyToEmail || ""));

      await updateTenantConfigAdmin({
        primaryColor,
        secondaryColor,
        fromEmail: fromEmail.trim() || undefined,
        replyToEmail: replyToEmail.trim() || undefined,
        legalName,
        legalId,
        representativeName,
        representativeId,
        representativeTitle,
        representativeMaritalStatus,
        representativeAddress,
        representativePowers,
      });

      // Recargar config para obtener el nuevo estado de emailVerified
      await loadConfig();

      // Mensaje específico si se cambiaron emails
      if (emailsChanging && config?.emailVerified) {
        setSuccess(
          "⚠️ Configuración guardada. Los emails modificados requieren nueva verificación del super admin."
        );
      } else {
        setSuccess("✅ Configuración guardada exitosamente");
      }
    } catch (err) {
      console.error("Error al guardar configuración:", err);
      setError(err instanceof Error ? err.message : "Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          <p className="mt-4 text-gray-600">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/admin/dashboard")}
            className="text-purple-600 hover:text-purple-800 mb-4 flex items-center gap-2"
          >
            ← Volver al Dashboard
          </button>
          <h1 className="text-3xl font-bold text-gray-900">⚙️ Configuración de {config?.name}</h1>
          <p className="text-gray-600 mt-2">Personaliza el logo, firma, colores y datos legales de tu empresa</p>
        </div>

        {/* Mensajes */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            {success}
          </div>
        )}

        {/* Assets Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">🖼️ Assets de Marca</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Logo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Logo de la Empresa
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                {config?.logoUrl ? (
                  <div className="mb-4">
                    <Image
                      src={config.logoUrl}
                      alt="Logo"
                      width={200}
                      height={100}
                      className="mx-auto object-contain"
                    />
                  </div>
                ) : (
                  <div className="mb-4 text-gray-400">
                    <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="mt-2">Sin logo</p>
                  </div>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                  id="logo-upload"
                />
                <label
                  htmlFor="logo-upload"
                  className={`cursor-pointer inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
                    uploadingLogo
                      ? "bg-gray-400"
                      : "bg-purple-600 hover:bg-purple-700"
                  }`}
                >
                  {uploadingLogo ? "Subiendo..." : "Subir Logo"}
                </label>
                <p className="text-xs text-gray-500 mt-2">JPEG, PNG o WebP. Máximo 5 MB</p>
              </div>
            </div>

            {/* Firma */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Firma del Representante Legal
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                {config?.signatureUrl ? (
                  <div className="mb-4">
                    <Image
                      src={config.signatureUrl}
                      alt="Firma"
                      width={200}
                      height={100}
                      className="mx-auto object-contain"
                    />
                  </div>
                ) : (
                  <div className="mb-4 text-gray-400">
                    <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <p className="mt-2">Sin firma</p>
                  </div>
                )}
                <input
                  ref={signatureInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleSignatureUpload}
                  className="hidden"
                  id="signature-upload"
                />
                <label
                  htmlFor="signature-upload"
                  className={`cursor-pointer inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
                    uploadingSignature
                      ? "bg-gray-400"
                      : "bg-purple-600 hover:bg-purple-700"
                  }`}
                >
                  {uploadingSignature ? "Subiendo..." : "Subir Firma"}
                </label>
                <p className="text-xs text-gray-500 mt-2">JPEG, PNG o WebP. Máximo 5 MB</p>
              </div>
            </div>
          </div>
        </div>

        {/* Formulario de Configuración */}
        <form onSubmit={handleSaveConfig} className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">🎨 Colores de Marca</h2>
          
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Color Primario
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-12 w-24 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="#8B5CF6"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Color Secundario
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-12 w-24 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="#10B981"
                />
              </div>
            </div>
          </div>

          <h2 className="text-xl font-bold text-gray-900 mb-4 mt-8">📧 Configuración de Emails</h2>
          <p className="text-sm text-gray-600 mb-4">
            Configure los emails desde donde se enviarán las notificaciones del sistema.
            <strong className="text-amber-600"> Importante:</strong> Los dominios deben estar verificados en Resend.
          </p>
          
          {/* Banner de estado de verificación */}
          {(config?.fromEmail || config?.replyToEmail) && (
            <div className={`mb-6 p-4 rounded-lg border-2 ${
              config.emailVerified 
                ? 'bg-green-50 border-green-300' 
                : 'bg-yellow-50 border-yellow-300'
            }`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{config.emailVerified ? '✅' : '⚠️'}</span>
                <div className="flex-1">
                  {config.emailVerified ? (
                    <>
                      <p className="text-sm font-semibold text-green-900 mb-1">
                        Email Verificado
                      </p>
                      <p className="text-xs text-green-800">
                        Los emails configurados han sido verificados por el administrador del sistema. 
                        Ya puedes enviar correos desde tu dominio personalizado.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-yellow-900 mb-1">
                        Verificación Pendiente
                      </p>
                      <p className="text-xs text-yellow-800">
                        Los emails configurados están pendientes de verificación por el administrador del sistema.
                        Mientras tanto, los emails se enviarán desde el dominio por defecto del sistema.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email de Envío (From)
              </label>
              <input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="noreply@tudominio.com"
              />
              <p className="text-xs text-gray-500 mt-1">
                Desde dónde se envían los emails de bienvenida, contratos, etc.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email de Respuesta (Reply-To)
              </label>
              <input
                type="email"
                value={replyToEmail}
                onChange={(e) => setReplyToEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="info@tudominio.com"
              />
              <p className="text-xs text-gray-500 mt-1">
                A dónde llegan las respuestas de los usuarios (opcional).
              </p>
            </div>
          </div>

          <h2 className="text-xl font-bold text-gray-900 mb-4 mt-8">📋 Datos Legales</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Razón Social
              </label>
              <input
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Ej: Viajes Alma Nova S.A. de C.V."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                RFC / ID Legal
              </label>
              <input
                type="text"
                value={legalId}
                onChange={(e) => setLegalId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Ej: VAN123456ABC"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre del Representante Legal
              </label>
              <input
                type="text"
                value={representativeName}
                onChange={(e) => setRepresentativeName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Ej: Juan Pérez García"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ID del Representante
              </label>
              <input
                type="text"
                value={representativeId}
                onChange={(e) => setRepresentativeId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Ej: CURP o INE"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cargo del Representante
              </label>
              <input
                type="text"
                value={representativeTitle}
                onChange={(e) => setRepresentativeTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Ej: Director General"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Estado Civil
              </label>
              <input
                type="text"
                value={representativeMaritalStatus}
                onChange={(e) => setRepresentativeMaritalStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Ej: Soltero(a) / Casado(a)"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dirección del Representante
              </label>
              <textarea
                value={representativeAddress}
                onChange={(e) => setRepresentativeAddress(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={2}
                placeholder="Calle, número, colonia, ciudad, estado, CP"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Poderes del Representante
              </label>
              <textarea
                value={representativePowers}
                onChange={(e) => setRepresentativePowers(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={3}
                placeholder="Descripción de las facultades legales del representante..."
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-4">
            <button
              type="button"
              onClick={() => router.push("/admin/dashboard")}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`px-6 py-2 text-white rounded-md ${
                saving
                  ? "bg-gray-400"
                  : "bg-purple-600 hover:bg-purple-700"
              }`}
            >
              {saving ? "Guardando..." : "Guardar Configuración"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

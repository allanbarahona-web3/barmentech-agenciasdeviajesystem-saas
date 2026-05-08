"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { getTenantLegalConfig, updateTenantLegalConfig, type TenantLegalConfig } from "@/lib/auth-api";

export default function TenantConfigPage() {
  const [config, setConfig] = useState<TenantLegalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [formData, setFormData] = useState({
    legalName: "",
    legalId: "",
    representativeName: "",
    representativeId: "",
    representativeTitle: "",
    representativeMaritalStatus: "",
    representativeAddress: "",
    representativePowers: "",
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await getTenantLegalConfig();
      setConfig(data);
      setFormData({
        legalName: data.legalName || "",
        legalId: data.legalId || "",
        representativeName: data.representativeName || "",
        representativeId: data.representativeId || "",
        representativeTitle: data.representativeTitle || "",
        representativeMaritalStatus: data.representativeMaritalStatus || "",
        representativeAddress: data.representativeAddress || "",
        representativePowers: data.representativePowers || "",
      });
    } catch (error) {
      console.error("Error cargando configuración:", error);
      setMessage({ type: "error", text: "Error al cargar la configuración" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);

    try {
      await updateTenantLegalConfig(formData);
      setMessage({ type: "success", text: "✅ Configuración actualizada correctamente" });
      await loadConfig(); // Recargar para mostrar datos actualizados
    } catch (error) {
      console.error("Error guardando configuración:", error);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Error al guardar la configuración",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <main className="app-shell">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Configuración Legal del Tenant</h1>
          <p className="text-gray-600 mt-2">
            Configure la información legal de <strong>{config?.name}</strong> que aparecerá en los contratos
          </p>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`rounded-lg p-4 mb-6 ${
              message.type === "success"
                ? "bg-green-50 border border-green-200 text-green-800"
                : "bg-red-50 border border-red-200 text-red-800"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 space-y-6">
          {/* Información de la Empresa */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
              Información de la Empresa
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Razón Social <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.legalName}
                  onChange={(e) => handleChange("legalName", e.target.value)}
                  placeholder="VIAJES ALMA NOVA"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cédula Jurídica <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.legalId}
                  onChange={(e) => handleChange("legalId", e.target.value)}
                  placeholder="3-101-960028"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Representante Legal */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
              Representante Legal
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre Completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.representativeName}
                  onChange={(e) => handleChange("representativeName", e.target.value)}
                  placeholder="KAREN KEITLYN CAMPOS CANTILLO"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cédula de Identidad <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.representativeId}
                  onChange={(e) => handleChange("representativeId", e.target.value)}
                  placeholder="3-0522-0023"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estado Civil
                </label>
                <input
                  type="text"
                  value={formData.representativeMaritalStatus}
                  onChange={(e) => handleChange("representativeMaritalStatus", e.target.value)}
                  placeholder="soltera"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cargo / Título
                </label>
                <input
                  type="text"
                  value={formData.representativeTitle}
                  onChange={(e) => handleChange("representativeTitle", e.target.value)}
                  placeholder="administradora de agencia de viajes"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Domicilio / Vecindad
                </label>
                <input
                  type="text"
                  value={formData.representativeAddress}
                  onChange={(e) => handleChange("representativeAddress", e.target.value)}
                  placeholder="Cartago"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Facultades / Poderes
                </label>
                <input
                  type="text"
                  value={formData.representativePowers}
                  onChange={(e) => handleChange("representativePowers", e.target.value)}
                  placeholder="apoderado generalísimo sin límite de suma"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end space-x-4 pt-4">
            <button
              type="button"
              onClick={loadConfig}
              disabled={saving}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
            >
              {saving && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              )}
              <span>{saving ? "Guardando..." : "Guardar Cambios"}</span>
            </button>
          </div>
        </form>

        {/* Preview */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">
            Vista Previa en Contratos
          </h3>
          <div className="bg-white rounded p-4 text-sm">
            <p className="mb-2">
              <strong>(a)</strong>{" "}
              <strong>{formData.representativeName || "___"}</strong>, mayor,{" "}
              {formData.representativeMaritalStatus || "___"},{" "}
              {formData.representativeTitle || "___"}, portadora de la cédula de identidad
              número <strong>{formData.representativeId || "___"}</strong>, vecina de{" "}
              {formData.representativeAddress || "___"}, en condición de representante legal, con
              facultades de {formData.representativePowers || "___"} de{" "}
              <strong>{formData.legalName || "___"}</strong>, cédula jurídica número{" "}
              {formData.legalId || "___"}, en adelante denominada{" "}
              <strong>&quot;{config?.name || "___"}&quot;</strong>; y
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

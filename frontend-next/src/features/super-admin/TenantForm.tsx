"use client";

import { useState, useEffect } from "react";
import type { CreateTenantDto, UpdateTenantDto } from "@/lib/auth-api";

type TenantFormMode = "create" | "edit";

type TenantFormData = CreateTenantDto | UpdateTenantDto;

interface TenantFormProps {
  mode: TenantFormMode;
  initialData?: UpdateTenantDto;
  onSubmit: (data: TenantFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function TenantForm({ mode, initialData, onSubmit, onCancel, isLoading = false }: TenantFormProps) {
  const [formData, setFormData] = useState<TenantFormData>(() => {
    if (mode === "edit" && initialData) {
      return initialData;
    }
    return {
      name: "",
      subdomain: "",
      customDomain: "",
      contractPrefix: "",
      adminEmail: "",
      adminFullName: "",
      adminPassword: "",
    } as CreateTenantDto;
  });

  useEffect(() => {
    if (mode === "edit" && initialData) {
      setFormData(initialData);
    }
  }, [mode, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  const isCreateMode = mode === "create";
  const createFormData = formData as CreateTenantDto;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nombre del Tenant *
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Viajes Ejemplo"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Prefijo de Contrato *
          </label>
          <input
            type="text"
            required
            value={formData.contractPrefix}
            onChange={(e) => setFormData({ ...formData, contractPrefix: e.target.value.toUpperCase() })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="EJE"
            maxLength={3}
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Subdominio * <span className="text-xs text-gray-500">(solo palabra corta)</span>
          </label>
          <input
            type="text"
            required
            value={formData.subdomain}
            onChange={(e) => setFormData({ ...formData, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="empresa"
            pattern="[a-z0-9-]+"
            title="Solo letras minúsculas, números y guiones"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Ejemplo: <span className="font-mono text-purple-600">empresa</span> → empresa.tudominio.com
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dominio Personalizado <span className="text-xs text-gray-500">(opcional, dominio completo)</span>
          </label>
          <input
            type="text"
            value={formData.customDomain || ""}
            onChange={(e) => setFormData({ ...formData, customDomain: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="empresa.pruebas.com"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Si tiene dominio propio con DNS configurado
          </p>
        </div>
      </div>

      {isCreateMode && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Admin Inicial</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del Admin *
              </label>
              <input
                type="text"
                required
                value={createFormData.adminFullName}
                onChange={(e) => setFormData({ ...formData, adminFullName: e.target.value } as CreateTenantDto)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Juan Pérez"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email del Admin *
              </label>
              <input
                type="email"
                required
                value={createFormData.adminEmail}
                onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value } as CreateTenantDto)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="admin@ejemplo.com"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contraseña del Admin *
              </label>
              <input
                type="password"
                required
                value={createFormData.adminPassword}
                onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value } as CreateTenantDto)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Mínimo 8 caracteres"
                minLength={8}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50"
        >
          {isCreateMode ? "Crear Tenant" : "Guardar Cambios"}
        </button>
      </div>
    </form>
  );
}

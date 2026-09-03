"use client";

import { useEffect, useState } from "react";
import { ConfirmModal } from "@/components/confirm-modal";
import {
  type AdditionalServiceCatalogUsage,
} from "@/lib/additional-services-admin-api";
import {
  catalogUsageLabels,
  createCatalogInput,
  emptyCatalogAdminForm,
  TRAVEL_FISCAL_CLASSIFICATION_USAGES,
  validateTravelClassificationForm,
  type CatalogAdminForm,
} from "@/lib/additional-service-catalog-admin";

type Props = {
  isOpen: boolean;
  saving: boolean;
  onClose: () => void;
  onCreate: (input: ReturnType<typeof createCatalogInput>) => Promise<void>;
};

export function AdditionalServiceCatalogModal({
  isOpen,
  saving,
  onClose,
  onCreate,
}: Props) {
  const [form, setForm] = useState<CatalogAdminForm>(emptyCatalogAdminForm);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setForm(emptyCatalogAdminForm);
    setError("");
  }, [isOpen]);

  const toggleUsage = (usage: AdditionalServiceCatalogUsage) => {
    setForm((current) => ({
      ...current,
      usages: current.usages.includes(usage)
        ? current.usages.filter((candidate) => candidate !== usage)
        : [...current.usages, usage],
    }));
    setError("");
  };

  const handleSave = async () => {
    if (saving) return;
    const validationError = validateTravelClassificationForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      await onCreate(createCatalogInput(form));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo guardar el elemento del catálogo.",
      );
    }
  };

  return (
    <ConfirmModal
      isOpen={isOpen}
      title="Agregar clasificación fiscal"
      message={
        <form
          className="space-y-4 text-left"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <CatalogTextField
            id="catalog-code"
            label="Código"
            value={form.code}
            disabled={saving}
            onChange={(code) => {
              setForm((current) => ({ ...current, code }));
              setError("");
            }}
          />
          <CatalogTextField
            id="catalog-name"
            label="Nombre"
            value={form.name}
            disabled={saving}
            onChange={(name) => {
              setForm((current) => ({ ...current, name }));
              setError("");
            }}
          />

          <div>
            <label
              htmlFor="catalog-fiscal-category"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Categoría fiscal
            </label>
            <select
              id="catalog-fiscal-category"
              value={form.fiscalItemCategory}
              disabled={saving}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  fiscalItemCategory: event.target.value as "SERVICE" | "MERCHANDISE",
                }))
              }
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="SERVICE">Servicio</option>
              <option value="MERCHANDISE">Mercadería</option>
            </select>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Uso</legend>
            <div className="space-y-2">
              {TRAVEL_FISCAL_CLASSIFICATION_USAGES.map((usage) => (
                <label
                  key={usage}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={form.usages.includes(usage)}
                    disabled={saving}
                    onChange={() => toggleUsage(usage)}
                    className="h-4 w-4 accent-blue-600"
                  />
                  {catalogUsageLabels[usage]}
                </label>
              ))}
            </div>
          </fieldset>

          {error ? (
            <p
              role="alert"
              className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}
          <button type="submit" className="sr-only">Guardar</button>
        </form>
      }
      confirmText={saving ? "Guardando..." : "Guardar"}
      cancelText="Cancelar"
      isLoading={saving}
      onConfirm={() => void handleSave()}
      onCancel={onClose}
    />
  );
}

function CatalogTextField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        value={value}
        disabled={disabled}
        required
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

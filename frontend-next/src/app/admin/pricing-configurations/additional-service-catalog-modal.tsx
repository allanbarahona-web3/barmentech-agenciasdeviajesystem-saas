"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/patterns/form-field";
import { FormSheet } from "@/components/patterns/form-sheet";
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

  const resetForm = () => {
    setForm(emptyCatalogAdminForm);
    setError("");
  };

  const handleClose = () => {
    if (saving) return;
    resetForm();
    onClose();
  };

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
      resetForm();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo guardar el elemento del catálogo.",
      );
    }
  };

  return (
    <FormSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      title="Agregar clasificación fiscal"
      description="Defina el código, categoría fiscal y usos de viaje permitidos."
      actions={
        <>
          <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="catalog-classification-form" disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </>
      }
    >
      <form
        id="catalog-classification-form"
        noValidate
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <FormField label="Código" htmlFor="catalog-code" required>
          <Input
            id="catalog-code"
            value={form.code}
            disabled={saving}
            required
            onChange={(event) => {
              setForm((current) => ({ ...current, code: event.target.value }));
              setError("");
            }}
          />
        </FormField>

        <FormField label="Nombre" htmlFor="catalog-name" required>
          <Input
            id="catalog-name"
            value={form.name}
            disabled={saving}
            required
            onChange={(event) => {
              setForm((current) => ({ ...current, name: event.target.value }));
              setError("");
            }}
          />
        </FormField>

        <FormField label="Categoría fiscal" htmlFor="catalog-fiscal-category">
          <Select
            id="catalog-fiscal-category"
            value={form.fiscalItemCategory}
            disabled={saving}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                fiscalItemCategory: event.target.value as "SERVICE" | "MERCHANDISE",
              }))
            }
          >
            <option value="SERVICE">Servicio</option>
            <option value="MERCHANDISE">Mercadería</option>
          </Select>
        </FormField>

        <fieldset className="grid gap-2.5">
          <legend className="text-sm font-medium text-foreground">
            Usos permitidos
          </legend>
          <div className="grid gap-2">
            {TRAVEL_FISCAL_CLASSIFICATION_USAGES.map((usage) => (
              <label
                key={usage}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/50 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/25 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
              >
                <input
                  type="checkbox"
                  checked={form.usages.includes(usage)}
                  disabled={saving}
                  onChange={() => toggleUsage(usage)}
                  className="size-4 rounded border-input text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                {catalogUsageLabels[usage]}
              </label>
            ))}
          </div>
        </fieldset>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    </FormSheet>
  );
}

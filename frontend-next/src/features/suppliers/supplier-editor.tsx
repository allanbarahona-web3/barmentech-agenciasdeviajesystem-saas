"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/patterns/form-field";
import { FormSheet } from "@/components/patterns/form-sheet";

export interface SupplierFormState {
  name: string;
  website: string;
  supplierType: string;
  supplierCategory: string;
  customCategory: string;
  notes: string;
  isActive: boolean;
}

interface SupplierCategoryOption {
  value: string;
  label: string;
}

interface SupplierEditorProps {
  open: boolean;
  isEditing: boolean;
  form: SupplierFormState;
  formError: string;
  saving: boolean;
  supplierCategories: readonly SupplierCategoryOption[];
  onFormChange: Dispatch<SetStateAction<SupplierFormState>>;
  onClearFormError: () => void;
  onWebsiteBlur: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export function SupplierEditor({
  open,
  isEditing,
  form,
  formError,
  saving,
  supplierCategories,
  onFormChange,
  onClearFormError,
  onWebsiteBlur,
  onSave,
  onCancel,
}: SupplierEditorProps) {
  return (
    <FormSheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !saving) onCancel();
      }}
      title={isEditing ? "Editar proveedor" : "Crear proveedor"}
      description="Registra y administra los proveedores disponibles para servicios adicionales."
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving
              ? "Guardando..."
              : isEditing
                ? "Guardar cambios"
                : "Crear proveedor"}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-5"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          onSave();
        }}
      >
        {formError ? (
          <Alert variant="destructive">
            <AlertTitle>No se pudo guardar el proveedor</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <FormField htmlFor="supplier-name" label="Nombre" required>
          <Input
            id="supplier-name"
            type="text"
            required
            autoFocus
            value={form.name}
            onChange={(event) => {
              onFormChange((current) => ({
                ...current,
                name: event.target.value,
              }));
              onClearFormError();
            }}
            disabled={saving}
          />
        </FormField>

        <FormField htmlFor="supplier-website" label="Sitio web">
          <Input
            id="supplier-website"
            type="text"
            inputMode="url"
            placeholder="https://ejemplo.com"
            value={form.website}
            onChange={(event) =>
              onFormChange((current) => ({
                ...current,
                website: event.target.value,
              }))
            }
            onBlur={onWebsiteBlur}
            disabled={saving}
          />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField htmlFor="supplier-type" label="Tipo de viaje">
            <Select
              id="supplier-type"
              value={form.supplierType}
              onChange={(event) =>
                onFormChange((current) => ({
                  ...current,
                  supplierType: event.target.value,
                }))
              }
              disabled={saving}
            >
              <option value="">Seleccione</option>
              <option value="International">Internacional</option>
              <option value="National">Nacional</option>
            </Select>
          </FormField>

          <FormField
            htmlFor="supplier-category"
            label="Categoría del proveedor"
          >
            <Select
              id="supplier-category"
              value={form.supplierCategory}
              onChange={(event) => {
                onFormChange((current) => ({
                  ...current,
                  supplierCategory: event.target.value,
                  customCategory:
                    event.target.value === "Other"
                      ? current.customCategory
                      : "",
                }));
                onClearFormError();
              }}
              disabled={saving}
            >
              <option value="">Seleccione</option>
              {supplierCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
              <option value="Other">Otra</option>
            </Select>
          </FormField>
        </div>

        {form.supplierCategory === "Other" ? (
          <FormField
            htmlFor="supplier-custom-category"
            label="Categoría personalizada"
            required
          >
            <Input
              id="supplier-custom-category"
              type="text"
              required
              value={form.customCategory}
              onChange={(event) => {
                onFormChange((current) => ({
                  ...current,
                  customCategory: event.target.value,
                }));
                onClearFormError();
              }}
              disabled={saving}
            />
          </FormField>
        ) : null}

        <FormField htmlFor="supplier-notes" label="Notas">
          <Textarea
            id="supplier-notes"
            rows={3}
            value={form.notes}
            onChange={(event) =>
              onFormChange((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
            disabled={saving}
          />
        </FormField>

        <label
          htmlFor="supplier-active"
          className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5"
        >
          <span>
            <span className="block text-sm font-medium text-foreground">
              Activo
            </span>
            <span className="block text-xs text-muted-foreground">
              El proveedor estará disponible para su uso.
            </span>
          </span>
          <input
            id="supplier-active"
            type="checkbox"
            checked={form.isActive}
            onChange={(event) =>
              onFormChange((current) => ({
                ...current,
                isActive: event.target.checked,
              }))
            }
            disabled={saving}
            className="size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
      </form>
    </FormSheet>
  );
}

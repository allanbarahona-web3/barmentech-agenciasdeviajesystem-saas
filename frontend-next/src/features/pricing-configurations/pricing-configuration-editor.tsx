"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/patterns/form-field";
import { FormSheet } from "@/components/patterns/form-sheet";
import type {
  AdditionalServiceAdminCatalogItem,
  AdditionalServiceMarginType,
} from "@/lib/additional-services-admin-api";

export interface PricingConfigurationFormState {
  marginType: AdditionalServiceMarginType;
  marginValue: string;
  isActive: boolean;
}

interface PricingConfigurationEditorProps {
  item: AdditionalServiceAdminCatalogItem | null;
  form: PricingConfigurationFormState;
  formError: string;
  saving: boolean;
  onFormChange: Dispatch<SetStateAction<PricingConfigurationFormState>>;
  onClearFormError: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export function PricingConfigurationEditor({
  item,
  form,
  formError,
  saving,
  onFormChange,
  onClearFormError,
  onSave,
  onCancel,
}: PricingConfigurationEditorProps) {
  const fiscalReady = item?.fiscalReadiness.status === "READY";

  return (
    <FormSheet
      open={item !== null}
      onOpenChange={(open) => {
        if (!open && !saving) onCancel();
      }}
      title={
        item?.pricingConfiguration
          ? "Editar configuración de precios"
          : "Configurar precio"
      }
      description="Define el margen comercial del servicio seleccionado."
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
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </>
      }
    >
      {item ? (
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-muted-foreground">
                Servicio
              </p>
              <p className="mt-1 truncate font-medium text-foreground">
                {item.name}
              </p>
            </div>
            <Badge variant={item.pricingConfiguration ? "secondary" : "outline"}>
              {item.pricingConfiguration
                ? "Configuración existente"
                : "Nueva configuración"}
            </Badge>
          </div>

          {formError ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo guardar la configuración</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          {!fiscalReady ? (
            <Alert variant="warning">
              <AlertTitle>Perfil fiscal pendiente</AlertTitle>
              <AlertDescription>
                Active y complete el perfil fiscal antes de configurar el precio. Si el precio está activo, aún puede desactivarlo.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField htmlFor="pricing-margin-type" label="Tipo de margen">
              <Select
                id="pricing-margin-type"
                value={form.marginType}
                onChange={(event) => {
                  onFormChange((current) => ({
                    ...current,
                    marginType: event.target.value as AdditionalServiceMarginType,
                  }));
                  onClearFormError();
                }}
                disabled={saving || !fiscalReady}
                autoFocus
              >
                <option value="FIXED">Fijo</option>
                <option value="PERCENTAGE">Porcentaje</option>
              </Select>
            </FormField>

            <FormField htmlFor="pricing-margin-value" label="Valor del margen">
              <Input
                id="pricing-margin-value"
                type="number"
                min="0"
                step="0.0001"
                required
                value={form.marginValue}
                onChange={(event) => {
                  onFormChange((current) => ({
                    ...current,
                    marginValue: event.target.value,
                  }));
                  onClearFormError();
                }}
                disabled={saving || !fiscalReady}
              />
            </FormField>
          </div>

          <FormField
            htmlFor="pricing-tax-percentage"
            label="IVA efectivo del perfil fiscal activo"
            description="Este porcentaje lo determina el perfil fiscal y no se envía desde este formulario."
          >
            <Input
              id="pricing-tax-percentage"
              value={
                item.fiscalProfile?.taxPercentage
                  ? `${item.fiscalProfile.taxPercentage}%`
                  : "No disponible"
              }
              readOnly
              className="bg-muted text-muted-foreground"
            />
          </FormField>

          <label
            htmlFor="pricing-is-active"
            className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5"
          >
            <span>
              <span className="block text-sm font-medium text-foreground">
                Activo
              </span>
              <span className="block text-xs text-muted-foreground">
                La configuración estará disponible para su uso.
              </span>
            </span>
            <input
              id="pricing-is-active"
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => {
                if (event.target.checked && !fiscalReady) return;
                onFormChange((current) => ({
                  ...current,
                  isActive: event.target.checked,
                }));
              }}
              disabled={saving}
              className="size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
        </form>
      ) : null}
    </FormSheet>
  );
}

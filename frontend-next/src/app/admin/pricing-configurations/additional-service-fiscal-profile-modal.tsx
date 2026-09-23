"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleCheck, CirclePause, ReceiptText } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormSheet } from "@/components/patterns/form-sheet";
import { IconBadge } from "@/components/ui/icon-badge";
import {
  FiscalCatalogSelection,
  type FiscalCatalogSelectionState,
  type FiscalCatalogSelectionValue,
} from "@/features/fiscal-catalog/fiscal-catalog-selection";
import {
  createAdditionalServiceFiscalProfile,
  updateAdditionalServiceFiscalProfile,
  updateAdditionalServiceFiscalProfileStatus,
  type AdditionalServiceAdminCatalogItem,
} from "@/lib/additional-services-admin-api";
import { confirmFiscalCatalogCabys } from "@/lib/fiscal-catalog-api";
import { hasAdditionalServiceUsage } from "@/lib/additional-service-catalog-admin";

type FiscalFormState = FiscalCatalogSelectionValue;
const emptyForm: FiscalFormState = { cabysCode: "", unitOfMeasureCode: "", taxCode: "", taxRateCode: "" };

const readinessIssueLabels: Record<string, string> = {
  CABYS_INVALID: "El CABYS guardado ya no está activo.",
  UNIT_OF_MEASURE_INVALID: "La unidad guardada ya no está activa.",
  TAX_INVALID: "El impuesto guardado ya no está activo.",
  TAX_RATE_INVALID: "La tarifa guardada ya no está activa para este impuesto.",
  TAX_PERCENTAGE_MISMATCH: "El porcentaje guardado no coincide con la tarifa fiscal activa.",
  FISCAL_CATALOG_NOT_READY: "Los catálogos fiscales globales no están activos.",
};

function formForItem(item: AdditionalServiceAdminCatalogItem): FiscalFormState {
  const profile = item.fiscalProfile;
  return profile ? {
    cabysCode: profile.cabysCode,
    unitOfMeasureCode: profile.unitOfMeasureCode,
    taxCode: profile.taxCode ?? "",
    taxRateCode: profile.taxRateCode ?? "",
  } : emptyForm;
}

type Props = {
  item: AdditionalServiceAdminCatalogItem | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
};

export function AdditionalServiceFiscalProfileModal({ item, onClose, onSaved, onError }: Props) {
  const [form, setForm] = useState<FiscalFormState>(emptyForm);
  const [selectionState, setSelectionState] = useState<FiscalCatalogSelectionState>({
    complete: false,
    selectedRate: null,
    unavailable: { cabys: false, unit: false, tax: false, rate: false },
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setForm(formForItem(item));
    setSelectionState({ complete: false, selectedRate: null, unavailable: { cabys: false, unit: false, tax: false, rate: false } });
    setError("");
  }, [item]);

  const initialForm = useMemo(() => item ? formForItem(item) : emptyForm, [item]);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const profile = item?.fiscalProfile ?? null;
  const statusDisabled = saving || isDirty || (!profile?.isActive && !selectionState.complete);

  const handleSave = async () => {
    if (!item || saving) return;
    if (!selectionState.complete) {
      setError("Seleccione un CABYS, una unidad, un impuesto y una tarifa activos.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const confirmedCabys = await confirmFiscalCatalogCabys(form.cabysCode);
      const payload = { cabysCode: confirmedCabys.code, unitOfMeasureCode: form.unitOfMeasureCode, taxCode: form.taxCode, taxRateCode: form.taxRateCode };
      if (profile) await updateAdditionalServiceFiscalProfile(profile.id, payload);
      else await createAdditionalServiceFiscalProfile({ additionalServiceCatalogId: item.id, ...payload, isActive: false });
      await onSaved(profile ? "Perfil fiscal actualizado correctamente." : "Perfil fiscal creado como inactivo.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo guardar el perfil fiscal.";
      setError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async () => {
    if (!profile || statusDisabled) return;
    const nextStatus = !profile.isActive;
    setSaving(true);
    setError("");
    try {
      await updateAdditionalServiceFiscalProfileStatus(profile.id, { isActive: nextStatus });
      await onSaved(nextStatus ? "Perfil fiscal activado correctamente." : "Perfil fiscal desactivado correctamente.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo cambiar el estado fiscal.";
      setError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      open={item !== null}
      onOpenChange={(open) => { if (!open && !saving) onClose(); }}
      title={profile ? "Editar perfil fiscal" : "Configurar perfil fiscal"}
      description="Configure la clasificación fiscal aplicable al servicio seleccionado."
      actions={<><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button><Button type="submit" form="fiscal-profile-form" disabled={saving}>{saving ? "Guardando..." : "Guardar valores"}</Button></>}
    >
      {item ? (
        <form id="fiscal-profile-form" noValidate className="grid gap-5" onSubmit={(event) => { event.preventDefault(); void handleSave(); }}>
          <section className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
            <IconBadge tone="info"><ReceiptText aria-hidden="true" /></IconBadge>
            <div className="min-w-0"><p className="text-sm font-medium text-foreground">{hasAdditionalServiceUsage(item) ? "Servicio" : "Clasificación fiscal"}</p><p className="mt-1 truncate text-sm text-muted-foreground" title={item.name}>{item.name}</p></div>
          </section>

          <FiscalCatalogSelection idPrefix="additional-service-fiscal" value={form} onChange={(next) => { setForm(next); setError(""); }} onStateChange={setSelectionState} disabled={saving} persistedTaxPercentage={profile && form.taxCode === profile.taxCode && form.taxRateCode === profile.taxRateCode ? profile.taxPercentage : null} />

          {item.fiscalReadiness.issues.length ? <Alert variant="destructive"><AlertTitle>Detalles de la configuración</AlertTitle><AlertDescription><ul className="mt-1 list-disc pl-5">{item.fiscalReadiness.issues.map((issue) => <li key={issue}>{readinessIssueLabels[issue] ?? issue}</li>)}</ul></AlertDescription></Alert> : null}
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

          {profile ? (
            <section className="grid gap-3 border-t border-border pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-foreground">Estado del perfil</h3><Badge variant={profile.isActive ? "success" : "warning"}>{profile.isActive ? "Activo" : "Inactivo"}</Badge></div>
              <Button type="button" variant="outline" onClick={() => void handleStatusChange()} disabled={statusDisabled} className={profile.isActive ? "border-warning/40 text-warning hover:bg-warning/10 hover:text-warning" : "border-success/40 text-success hover:bg-success/10 hover:text-success"}>{profile.isActive ? <CirclePause aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}{profile.isActive ? "Desactivar perfil fiscal" : "Activar perfil fiscal"}</Button>
              {isDirty ? <Alert variant="info"><AlertDescription>Guarde los cambios antes de cambiar el estado.</AlertDescription></Alert> : null}
              {!profile.isActive && !isDirty && !selectionState.complete ? <Alert variant="warning"><AlertDescription>Complete selecciones fiscales activas antes de activar.</AlertDescription></Alert> : null}
            </section>
          ) : <Alert variant="info"><AlertDescription>El perfil se creará inactivo. Después de guardarlo podrá activarlo.</AlertDescription></Alert>}
        </form>
      ) : null}
    </FormSheet>
  );
}

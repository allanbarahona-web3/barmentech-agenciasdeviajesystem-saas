"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CircleCheck, CirclePause } from "lucide-react";
import { ConfirmModal } from "@/components/confirm-modal";
import { Button } from "@/components/ui/button";
import {
  createAdditionalServiceFiscalProfile,
  updateAdditionalServiceFiscalProfile,
  updateAdditionalServiceFiscalProfileStatus,
  type AdditionalServiceAdminCatalogItem,
} from "@/lib/additional-services-admin-api";

type FiscalFormState = {
  cabysCode: string;
  unitOfMeasureCode: string;
  taxCode: string;
  taxRateCode: string;
  taxPercentage: string;
};

const readinessIssueLabels: Record<string, string> = {
  CABYS_INVALID: "El código CABYS debe contener exactamente 13 dígitos.",
  UNIT_OF_MEASURE_CODE_INVALID: "El código de unidad de medida es inválido.",
  TAX_TUPLE_INCOMPLETE: "La configuración de impuesto está incompleta.",
  TAX_CODE_REQUIRED: "Falta el código de impuesto.",
  TAX_RATE_CODE_REQUIRED: "Falta el código de tarifa.",
  TAX_PERCENTAGE_REQUIRED: "Falta el porcentaje fiscal.",
  TAX_CODE_INVALID: "El código de impuesto es inválido.",
  TAX_RATE_CODE_INVALID: "El código de tarifa es inválido.",
  TAX_PERCENTAGE_INVALID: "El porcentaje fiscal es inválido.",
};

const emptyForm: FiscalFormState = {
  cabysCode: "",
  unitOfMeasureCode: "",
  taxCode: "",
  taxRateCode: "",
  taxPercentage: "",
};

function formForItem(item: AdditionalServiceAdminCatalogItem): FiscalFormState {
  const profile = item.fiscalProfile;
  return profile
    ? {
        cabysCode: profile.cabysCode,
        unitOfMeasureCode: profile.unitOfMeasureCode,
        taxCode: profile.taxCode ?? "",
        taxRateCode: profile.taxRateCode ?? "",
        taxPercentage: profile.taxPercentage ?? "",
      }
    : emptyForm;
}

function validateFiscalForm(form: FiscalFormState, requireTuple: boolean): string | null {
  const cabysCode = form.cabysCode.trim();
  const unitCode = form.unitOfMeasureCode.trim();
  const taxCode = form.taxCode.trim();
  const taxRateCode = form.taxRateCode.trim();
  const taxPercentage = form.taxPercentage.trim();

  if (!/^\d{13}$/.test(cabysCode)) {
    return "El código CABYS debe contener exactamente 13 dígitos.";
  }
  if (!unitCode || unitCode.length > 20) {
    return "La unidad de medida es obligatoria y admite hasta 20 caracteres.";
  }
  if (taxCode.length > 4) return "El código de impuesto admite hasta 4 caracteres.";
  if (taxRateCode.length > 4) return "El código de tarifa admite hasta 4 caracteres.";
  if (taxPercentage && !/^\d{1,3}(?:\.\d{1,4})?$/.test(taxPercentage)) {
    return "El porcentaje fiscal debe ser un decimal no negativo con hasta 3 enteros y 4 decimales.";
  }

  const suppliedCount = [taxCode, taxRateCode, taxPercentage].filter(
    (value) => value !== "",
  ).length;
  if (suppliedCount > 0 && suppliedCount < 3) {
    return "Complete código de impuesto, código de tarifa y porcentaje, o deje los tres vacíos.";
  }
  if (requireTuple && suppliedCount !== 3) {
    return "Complete los tres campos de impuesto antes de activar el perfil.";
  }
  return null;
}

function normalizeDecimal(value: string): string {
  const [integer = "0", fraction = ""] = value.trim().split(".");
  const normalizedInteger = integer.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction
    ? `${normalizedInteger}.${normalizedFraction}`
    : normalizedInteger;
}

type Props = {
  item: AdditionalServiceAdminCatalogItem | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
};

export function AdditionalServiceFiscalProfileModal({
  item,
  onClose,
  onSaved,
  onError,
}: Props) {
  const [form, setForm] = useState<FiscalFormState>(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setForm(formForItem(item));
    setError("");
  }, [item]);

  const initialForm = useMemo(() => (item ? formForItem(item) : emptyForm), [item]);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const profile = item?.fiscalProfile ?? null;
  const activationError = validateFiscalForm(form, true);
  const statusDisabled = saving || isDirty || (!profile?.isActive && activationError !== null);

  const commercialTax = item?.pricingConfiguration?.taxPercentage;
  const fiscalTax = form.taxPercentage.trim();
  const hasPercentageMismatch = Boolean(
    commercialTax &&
      fiscalTax &&
      normalizeDecimal(commercialTax) !== normalizeDecimal(fiscalTax),
  );

  const setField = (field: keyof FiscalFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const handleSave = async () => {
    if (!item || saving) return;
    const validationError = validateFiscalForm(form, profile?.isActive ?? false);
    if (validationError) {
      setError(validationError);
      return;
    }

    const taxCode = form.taxCode.trim() || null;
    const taxRateCode = form.taxRateCode.trim() || null;
    const taxPercentage = form.taxPercentage.trim() || null;
    setSaving(true);
    setError("");
    try {
      if (profile) {
        await updateAdditionalServiceFiscalProfile(profile.id, {
          cabysCode: form.cabysCode.trim(),
          unitOfMeasureCode: form.unitOfMeasureCode.trim(),
          taxCode,
          taxRateCode,
          taxPercentage,
        });
        await onSaved("Perfil fiscal actualizado correctamente.");
      } else {
        await createAdditionalServiceFiscalProfile({
          additionalServiceCatalogId: item.id,
          cabysCode: form.cabysCode.trim(),
          unitOfMeasureCode: form.unitOfMeasureCode.trim(),
          taxCode,
          taxRateCode,
          taxPercentage,
          isActive: false,
        });
        await onSaved("Perfil fiscal creado como inactivo.");
      }
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
      await updateAdditionalServiceFiscalProfileStatus(profile.id, {
        isActive: nextStatus,
      });
      await onSaved(
        nextStatus
          ? "Perfil fiscal activado correctamente."
          : "Perfil fiscal desactivado correctamente.",
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo cambiar el estado fiscal.";
      setError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfirmModal
      isOpen={item !== null}
      title={profile ? "Editar perfil fiscal" : "Configurar perfil fiscal"}
      confirmText={saving ? "Guardando..." : "Guardar valores"}
      cancelText="Cancelar"
      isLoading={saving}
      onConfirm={() => void handleSave()}
      onCancel={onClose}
      message={item ? (
        <form className="space-y-4 text-left" onSubmit={(event) => { event.preventDefault(); void handleSave(); }}>
          <div>
            <label htmlFor="fiscal-service" className="mb-1 block text-sm font-medium text-slate-700">Servicio</label>
            <input id="fiscal-service" value={item.name} readOnly className="h-10 w-full rounded-md border border-slate-200 bg-slate-100 px-3 text-sm text-slate-600" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FiscalInput id="fiscal-cabys" label="Código CABYS" value={form.cabysCode} maxLength={13} inputMode="numeric" disabled={saving} onChange={(value) => setField("cabysCode", value)} />
            <FiscalInput id="fiscal-unit" label="Unidad de medida" value={form.unitOfMeasureCode} maxLength={20} disabled={saving} onChange={(value) => setField("unitOfMeasureCode", value)} />
            <FiscalInput id="fiscal-tax-code" label="Código de impuesto" value={form.taxCode} maxLength={4} disabled={saving} onChange={(value) => setField("taxCode", value)} />
            <FiscalInput id="fiscal-rate-code" label="Código de tarifa" value={form.taxRateCode} maxLength={4} disabled={saving} onChange={(value) => setField("taxRateCode", value)} />
          </div>
          <FiscalInput id="fiscal-percentage" label="Porcentaje fiscal" value={form.taxPercentage} inputMode="decimal" placeholder="Ej. 13.0000" disabled={saving} onChange={(value) => setField("taxPercentage", value)} />

          {hasPercentageMismatch ? (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>El porcentaje comercial ({commercialTax}%) difiere del valor fiscal ({fiscalTax}%). Esta advertencia no modifica ninguno de los valores.</span>
            </div>
          ) : null}

          {item.fiscalReadiness.issues.length > 0 ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <p className="font-medium">Detalles de la configuración:</p>
              <ul className="mt-1 list-disc pl-5">
                {item.fiscalReadiness.issues.map((issue) => (
                  <li key={issue}>{readinessIssueLabels[issue] ?? issue}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {error ? <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          {profile ? (
            <div className="border-t border-slate-200 pt-4">
              <Button type="button" variant="outline" onClick={() => void handleStatusChange()} disabled={statusDisabled} className="w-full gap-2">
                {profile.isActive ? <CirclePause className="h-4 w-4" aria-hidden="true" /> : <CircleCheck className="h-4 w-4" aria-hidden="true" />}
                {profile.isActive ? "Desactivar perfil fiscal" : "Activar perfil fiscal"}
              </Button>
              {isDirty ? <p className="mt-2 text-xs text-slate-500">Guarde los cambios antes de cambiar el estado.</p> : null}
              {!profile.isActive && !isDirty && activationError ? <p className="mt-2 text-xs text-amber-700">{activationError}</p> : null}
            </div>
          ) : (
            <p className="text-xs text-slate-500">El perfil se creará inactivo. Después de guardarlo podrá activarlo con la configuración fiscal completa.</p>
          )}
          <button type="submit" className="sr-only">Guardar</button>
        </form>
      ) : null}
    />
  );
}

function FiscalInput({
  id,
  label,
  value,
  onChange,
  ...inputProps
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange">) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input id={id} type="text" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200" {...inputProps} />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CircleCheck, CirclePause, LoaderCircle, ReceiptText } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/patterns/form-field";
import { FormSheet } from "@/components/patterns/form-sheet";
import { IconBadge } from "@/components/ui/icon-badge";
import {
  confirmFiscalCatalogCabys,
  createAdditionalServiceFiscalProfile,
  getFiscalCatalogCabys,
  getFiscalCatalogTaxes,
  getFiscalCatalogTaxRates,
  getFiscalCatalogUnits,
  searchFiscalCatalogCabys,
  updateAdditionalServiceFiscalProfile,
  updateAdditionalServiceFiscalProfileStatus,
  type AdditionalServiceAdminCatalogItem,
  type FiscalCatalogCabysItem,
  type FiscalCatalogCodeItem,
  type FiscalCatalogRateItem,
} from "@/lib/additional-services-admin-api";
import { hasAdditionalServiceUsage } from "@/lib/additional-service-catalog-admin";

type FiscalFormState = { cabysCode: string; unitOfMeasureCode: string; taxCode: string; taxRateCode: string };
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
  const [cabysQuery, setCabysQuery] = useState("");
  const [cabysOptions, setCabysOptions] = useState<FiscalCatalogCabysItem[]>([]);
  const [selectedCabys, setSelectedCabys] = useState<FiscalCatalogCabysItem | null>(null);
  const [units, setUnits] = useState<FiscalCatalogCodeItem[]>([]);
  const [taxes, setTaxes] = useState<FiscalCatalogCodeItem[]>([]);
  const [rates, setRates] = useState<FiscalCatalogRateItem[]>([]);
  const [catalogsLoading, setCatalogsLoading] = useState(false);
  const [cabysLoading, setCabysLoading] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    const next = formForItem(item);
    setForm(next); setCabysQuery(next.cabysCode); setCabysOptions([]); setSelectedCabys(null); setError("");
    setCatalogsLoading(true);
    void Promise.all([getFiscalCatalogUnits(), getFiscalCatalogTaxes()])
      .then(([nextUnits, nextTaxes]) => { setUnits(nextUnits); setTaxes(nextTaxes); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "No se pudieron cargar los catálogos fiscales."))
      .finally(() => setCatalogsLoading(false));
    if (next.cabysCode) {
      void getFiscalCatalogCabys(next.cabysCode)
        .then((cabys) => { setSelectedCabys(cabys); setCabysQuery(`${cabys.code} — ${cabys.description}`); })
        .catch(() => setSelectedCabys(null));
    }
  }, [item]);

  useEffect(() => {
    if (!item || !form.taxCode) { setRates([]); return; }
    setRatesLoading(true);
    void getFiscalCatalogTaxRates(form.taxCode)
      .then(setRates)
      .catch((caught) => { setRates([]); setError(caught instanceof Error ? caught.message : "No se pudieron cargar las tarifas fiscales."); })
      .finally(() => setRatesLoading(false));
  }, [form.taxCode, item]);

  useEffect(() => {
    const query = cabysQuery.trim();
    if (!item || selectedCabys || query.length < 3) { setCabysOptions([]); return; }
    const timeout = window.setTimeout(() => {
      setCabysLoading(true);
      void searchFiscalCatalogCabys(query)
        .then((response) => setCabysOptions(response.items))
        .catch((caught) => { setCabysOptions([]); setError(caught instanceof Error ? caught.message : "No se pudo buscar CABYS."); })
        .finally(() => setCabysLoading(false));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [cabysQuery, item, selectedCabys]);

  const initialForm = useMemo(() => item ? formForItem(item) : emptyForm, [item]);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const profile = item?.fiscalProfile ?? null;
  const selectedRate = rates.find((rate) => rate.code === form.taxRateCode);
  const unavailable = {
    cabys: Boolean(form.cabysCode && !selectedCabys),
    unit: Boolean(form.unitOfMeasureCode && !catalogsLoading && !units.some((unit) => unit.code === form.unitOfMeasureCode)),
    tax: Boolean(form.taxCode && !catalogsLoading && !taxes.some((tax) => tax.code === form.taxCode)),
    rate: Boolean(form.taxRateCode && !ratesLoading && !rates.some((rate) => rate.code === form.taxRateCode)),
  };
  const complete = Boolean(form.cabysCode && form.unitOfMeasureCode && form.taxCode && form.taxRateCode && !Object.values(unavailable).some(Boolean));
  const statusDisabled = saving || isDirty || (!profile?.isActive && !complete);

  const chooseCabys = (option: FiscalCatalogCabysItem) => {
    setSelectedCabys(option); setForm((current) => ({ ...current, cabysCode: option.code }));
    setCabysQuery(`${option.code} — ${option.description}`); setCabysOptions([]); setError("");
  };

  const handleSave = async () => {
    if (!item || saving) return;
    if (!complete) { setError("Seleccione un CABYS, una unidad, un impuesto y una tarifa activos."); return; }
    setSaving(true); setError("");
    try {
      const confirmedCabys = await confirmFiscalCatalogCabys(form.cabysCode);
      const payload = { cabysCode: confirmedCabys.code, unitOfMeasureCode: form.unitOfMeasureCode, taxCode: form.taxCode, taxRateCode: form.taxRateCode };
      if (profile) await updateAdditionalServiceFiscalProfile(profile.id, payload);
      else await createAdditionalServiceFiscalProfile({ additionalServiceCatalogId: item.id, ...payload, isActive: false });
      await onSaved(profile ? "Perfil fiscal actualizado correctamente." : "Perfil fiscal creado como inactivo.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo guardar el perfil fiscal.";
      setError(message); onError(message);
    } finally { setSaving(false); }
  };

  const handleStatusChange = async () => {
    if (!profile || statusDisabled) return;
    const nextStatus = !profile.isActive; setSaving(true); setError("");
    try {
      await updateAdditionalServiceFiscalProfileStatus(profile.id, { isActive: nextStatus });
      await onSaved(nextStatus ? "Perfil fiscal activado correctamente." : "Perfil fiscal desactivado correctamente.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo cambiar el estado fiscal.";
      setError(message); onError(message);
    } finally { setSaving(false); }
  };

  return (
    <FormSheet
      open={item !== null}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
      title={profile ? "Editar perfil fiscal" : "Configurar perfil fiscal"}
      description="Configure la clasificación fiscal aplicable al servicio seleccionado."
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="fiscal-profile-form" disabled={saving}>
            {saving ? "Guardando..." : "Guardar valores"}
          </Button>
        </>
      }
    >
      {item ? (
        <form
          id="fiscal-profile-form"
          noValidate
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <section className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
            <IconBadge tone="info">
              <ReceiptText aria-hidden="true" />
            </IconBadge>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {hasAdditionalServiceUsage(item) ? "Servicio" : "Clasificación fiscal"}
              </p>
              <p className="mt-1 truncate text-sm text-muted-foreground" title={item.name}>
                {item.name}
              </p>
            </div>
          </section>

          <FormField label="CABYS" htmlFor="fiscal-cabys-search">
            <div className="relative">
              <Input
                id="fiscal-cabys-search"
                value={cabysQuery}
                autoComplete="off"
                disabled={saving}
                placeholder="Busque por código o descripción (mínimo 3 caracteres)"
                className="pr-10"
                onChange={(event) => {
                  setCabysQuery(event.target.value); setSelectedCabys(null); setForm((current) => ({ ...current, cabysCode: "" })); setError("");
                }}
              />
              {cabysLoading ? <LoaderCircle className="absolute right-3 top-2.5 size-4 animate-spin text-muted-foreground" aria-label="Buscando CABYS" /> : null}
              {cabysOptions.length ? (
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-ui-md">
                  {cabysOptions.map((option) => (
                    <li key={option.code}>
                      <button type="button" onClick={() => chooseCabys(option)} className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none">
                        <span className="block font-mono font-semibold">{option.code}</span>
                        <span className="block text-muted-foreground">{option.description}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {selectedCabys ? <Badge variant="info">CABYS seleccionado: {selectedCabys.code}</Badge> : null}
            {cabysQuery.trim().length > 0 && cabysQuery.trim().length < 3 ? <p className="text-xs text-muted-foreground">Escriba al menos 3 caracteres para buscar.</p> : null}
            {unavailable.cabys ? <UnavailableWarning text={`El CABYS guardado ${form.cabysCode} no está disponible. Seleccione uno activo.`} /> : null}
          </FormField>

          <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Clasificación fiscal</h3>
              <p className="mt-1 text-sm text-muted-foreground">Seleccione valores vigentes de los catálogos fiscales.</p>
            </div>
            <CatalogSelect id="fiscal-unit" label="Unidad de medida" value={form.unitOfMeasureCode} items={units} disabled={saving || catalogsLoading} unavailable={unavailable.unit} onChange={(value) => { setForm((current) => ({ ...current, unitOfMeasureCode: value })); setError(""); }} />
            <CatalogSelect id="fiscal-tax" label="Impuesto" value={form.taxCode} items={taxes} disabled={saving || catalogsLoading} unavailable={unavailable.tax} onChange={(value) => { setForm((current) => ({ ...current, taxCode: value, taxRateCode: "" })); setRates([]); setError(""); }} />
            <FormField label="Tarifa fiscal" htmlFor="fiscal-rate">
              <Select id="fiscal-rate" value={form.taxRateCode} disabled={saving || ratesLoading || !form.taxCode} onChange={(event) => { setForm((current) => ({ ...current, taxRateCode: event.target.value })); setError(""); }}>
                <option value="">Seleccione una tarifa</option>
                {unavailable.rate ? <option value={form.taxRateCode}>{form.taxRateCode} — No disponible</option> : null}
                {rates.map((rate) => <option key={rate.code} value={rate.code}>{rate.code} — {rate.name} — {rate.percentage}%</option>)}
              </Select>
              {unavailable.rate ? <UnavailableWarning text={`La tarifa guardada ${form.taxRateCode} ya no está activa para el impuesto seleccionado.`} /> : null}
            </FormField>
            <ReadOnlyField id="fiscal-percentage" label="Porcentaje fiscal de la tarifa seleccionada" value={selectedRate ? `${selectedRate.percentage}%` : "Seleccione una tarifa activa"} />
          </section>

          {item.fiscalReadiness.issues.length ? (
            <Alert variant="destructive">
              <AlertTitle>Detalles de la configuración</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc pl-5">
                  {item.fiscalReadiness.issues.map((issue) => <li key={issue}>{readinessIssueLabels[issue] ?? issue}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

          {profile ? (
            <section className="grid gap-3 border-t border-border pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">Estado del perfil</h3>
                <Badge variant={profile.isActive ? "success" : "warning"}>{profile.isActive ? "Activo" : "Inactivo"}</Badge>
              </div>
              <Button type="button" variant="outline" onClick={() => void handleStatusChange()} disabled={statusDisabled} className={profile.isActive ? "border-warning/40 text-warning hover:bg-warning/10 hover:text-warning" : "border-success/40 text-success hover:bg-success/10 hover:text-success"}>
                {profile.isActive ? <CirclePause aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
                {profile.isActive ? "Desactivar perfil fiscal" : "Activar perfil fiscal"}
              </Button>
              {isDirty ? <Alert variant="info"><AlertDescription>Guarde los cambios antes de cambiar el estado.</AlertDescription></Alert> : null}
              {!profile.isActive && !isDirty && !complete ? <Alert variant="warning"><AlertDescription>Complete selecciones fiscales activas antes de activar.</AlertDescription></Alert> : null}
            </section>
          ) : (
            <Alert variant="info"><AlertDescription>El perfil se creará inactivo. Después de guardarlo podrá activarlo.</AlertDescription></Alert>
          )}
        </form>
      ) : null}
    </FormSheet>
  );
}

function CatalogSelect({ id, label, value, items, disabled, unavailable, onChange }: { id: string; label: string; value: string; items: FiscalCatalogCodeItem[]; disabled: boolean; unavailable: boolean; onChange: (value: string) => void }) {
  return <FormField label={label} htmlFor={id}><Select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">Seleccione una opción</option>{unavailable ? <option value={value}>{value} — No disponible</option> : null}{items.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} — {entry.name}</option>)}</Select>{unavailable ? <UnavailableWarning text={`El valor guardado ${value} ya no está activo. Seleccione una opción vigente.`} /> : null}</FormField>;
}

function ReadOnlyField({ id, label, value }: { id: string; label: string; value: string }) {
  return <FormField label={label} htmlFor={id}><Input id={id} value={value} readOnly className="bg-muted text-muted-foreground" /></FormField>;
}

function UnavailableWarning({ text }: { text: string }) {
  return <Alert variant="warning" className="flex gap-2 px-3 py-2 text-xs"><AlertTriangle className="size-4 shrink-0" aria-hidden="true" /><AlertDescription className="mt-0">{text}</AlertDescription></Alert>;
}

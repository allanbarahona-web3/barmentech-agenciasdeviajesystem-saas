"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CircleCheck, CirclePause, LoaderCircle } from "lucide-react";
import { ConfirmModal } from "@/components/confirm-modal";
import { Button } from "@/components/ui/button";
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

  return <ConfirmModal isOpen={item !== null} title={profile ? "Editar perfil fiscal" : "Configurar perfil fiscal"} confirmText={saving ? "Guardando..." : "Guardar valores"} cancelText="Cancelar" isLoading={saving} onConfirm={() => void handleSave()} onCancel={onClose} message={item ? (
    <form className="space-y-4 text-left" onSubmit={(event) => { event.preventDefault(); void handleSave(); }}>
      <ReadOnlyField id="fiscal-service" label="Servicio" value={item.name} />
      <div className="relative">
        <label htmlFor="fiscal-cabys-search" className="mb-1 block text-sm font-medium text-slate-700">CABYS</label>
        <input id="fiscal-cabys-search" value={cabysQuery} autoComplete="off" disabled={saving} placeholder="Busque por código o descripción (mínimo 3 caracteres)" onChange={(event) => { setCabysQuery(event.target.value); setSelectedCabys(null); setForm((current) => ({ ...current, cabysCode: "" })); setError(""); }} className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200" />
        {cabysLoading ? <LoaderCircle className="absolute right-3 top-9 h-4 w-4 animate-spin text-slate-500" aria-label="Buscando CABYS" /> : null}
        {cabysOptions.length ? <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">{cabysOptions.map((option) => <li key={option.code}><button type="button" onClick={() => chooseCabys(option)} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"><span className="block font-mono font-semibold">{option.code}</span><span className="block text-slate-600">{option.description}</span></button></li>)}</ul> : null}
        {cabysQuery.trim().length > 0 && cabysQuery.trim().length < 3 ? <p className="mt-1 text-xs text-slate-500">Escriba al menos 3 caracteres para buscar.</p> : null}
        {unavailable.cabys ? <UnavailableWarning text={`El CABYS guardado ${form.cabysCode} no está disponible. Seleccione uno activo.`} /> : null}
      </div>
      <CatalogSelect id="fiscal-unit" label="Unidad de medida" value={form.unitOfMeasureCode} items={units} disabled={saving || catalogsLoading} unavailable={unavailable.unit} onChange={(value) => { setForm((current) => ({ ...current, unitOfMeasureCode: value })); setError(""); }} />
      <CatalogSelect id="fiscal-tax" label="Impuesto" value={form.taxCode} items={taxes} disabled={saving || catalogsLoading} unavailable={unavailable.tax} onChange={(value) => { setForm((current) => ({ ...current, taxCode: value, taxRateCode: "" })); setRates([]); setError(""); }} />
      <div>
        <label htmlFor="fiscal-rate" className="mb-1 block text-sm font-medium text-slate-700">Tarifa fiscal</label>
        <select id="fiscal-rate" value={form.taxRateCode} disabled={saving || ratesLoading || !form.taxCode} onChange={(event) => { setForm((current) => ({ ...current, taxRateCode: event.target.value })); setError(""); }} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Seleccione una tarifa</option>{unavailable.rate ? <option value={form.taxRateCode}>{form.taxRateCode} — No disponible</option> : null}{rates.map((rate) => <option key={rate.code} value={rate.code}>{rate.code} — {rate.name} — {rate.percentage}%</option>)}</select>
        {unavailable.rate ? <UnavailableWarning text={`La tarifa guardada ${form.taxRateCode} ya no está activa para el impuesto seleccionado.`} /> : null}
      </div>
      <ReadOnlyField id="fiscal-percentage" label="Porcentaje fiscal de la tarifa seleccionada" value={selectedRate ? `${selectedRate.percentage}%` : "Seleccione una tarifa activa"} />
      {item.fiscalReadiness.issues.length ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"><p className="font-medium">Detalles de la configuración:</p><ul className="mt-1 list-disc pl-5">{item.fiscalReadiness.issues.map((issue) => <li key={issue}>{readinessIssueLabels[issue] ?? issue}</li>)}</ul></div> : null}
      {error ? <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {profile ? <div className="border-t border-slate-200 pt-4"><Button type="button" variant="outline" onClick={() => void handleStatusChange()} disabled={statusDisabled} className="w-full gap-2">{profile.isActive ? <CirclePause className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}{profile.isActive ? "Desactivar perfil fiscal" : "Activar perfil fiscal"}</Button>{isDirty ? <p className="mt-2 text-xs text-slate-500">Guarde los cambios antes de cambiar el estado.</p> : null}{!profile.isActive && !isDirty && !complete ? <p className="mt-2 text-xs text-amber-700">Complete selecciones fiscales activas antes de activar.</p> : null}</div> : <p className="text-xs text-slate-500">El perfil se creará inactivo. Después de guardarlo podrá activarlo.</p>}
      <button type="submit" className="sr-only">Guardar</button>
    </form>
  ) : null} />;
}

function CatalogSelect({ id, label, value, items, disabled, unavailable, onChange }: { id: string; label: string; value: string; items: FiscalCatalogCodeItem[]; disabled: boolean; unavailable: boolean; onChange: (value: string) => void }) {
  return <div><label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{label}</label><select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Seleccione una opción</option>{unavailable ? <option value={value}>{value} — No disponible</option> : null}{items.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} — {entry.name}</option>)}</select>{unavailable ? <UnavailableWarning text={`El valor guardado ${value} ya no está activo. Seleccione una opción vigente.`} /> : null}</div>;
}

function ReadOnlyField({ id, label, value }: { id: string; label: string; value: string }) {
  return <div><label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{label}</label><input id={id} value={value} readOnly className="h-10 w-full rounded-md border border-slate-200 bg-slate-100 px-3 text-sm text-slate-600" /></div>;
}

function UnavailableWarning({ text }: { text: string }) {
  return <p className="mt-1 flex gap-1 text-xs text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{text}</p>;
}

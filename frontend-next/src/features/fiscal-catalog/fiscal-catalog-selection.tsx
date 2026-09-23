"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/patterns/form-field";
import {
  getFiscalCatalogCabys,
  getFiscalCatalogTaxRates,
  getFiscalCatalogTaxes,
  getFiscalCatalogUnits,
  searchFiscalCatalogCabys,
  type FiscalCatalogCabysItem,
  type FiscalCatalogCodeItem,
  type FiscalCatalogRateItem,
} from "@/lib/fiscal-catalog-api";

export type FiscalCatalogSelectionValue = {
  cabysCode: string;
  unitOfMeasureCode: string;
  taxCode: string;
  taxRateCode: string;
};

export type FiscalCatalogSelectionState = {
  complete: boolean;
  selectedRate: FiscalCatalogRateItem | null;
  unavailable: {
    cabys: boolean;
    unit: boolean;
    tax: boolean;
    rate: boolean;
  };
};

type Props = {
  idPrefix: string;
  value: FiscalCatalogSelectionValue;
  onChange: (value: FiscalCatalogSelectionValue) => void;
  disabled?: boolean;
  persistedTaxPercentage?: string | null;
  onStateChange?: (state: FiscalCatalogSelectionState) => void;
};

export function FiscalCatalogSelection({
  idPrefix,
  value,
  onChange,
  disabled = false,
  persistedTaxPercentage = null,
  onStateChange,
}: Props) {
  const [cabysQuery, setCabysQuery] = useState(value.cabysCode);
  const [cabysOptions, setCabysOptions] = useState<FiscalCatalogCabysItem[]>([]);
  const [selectedCabys, setSelectedCabys] = useState<FiscalCatalogCabysItem | null>(null);
  const [units, setUnits] = useState<FiscalCatalogCodeItem[]>([]);
  const [taxes, setTaxes] = useState<FiscalCatalogCodeItem[]>([]);
  const [rates, setRates] = useState<FiscalCatalogRateItem[]>([]);
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [cabysLoading, setCabysLoading] = useState(false);
  const [cabysResolving, setCabysResolving] = useState(Boolean(value.cabysCode));
  const [ratesLoading, setRatesLoading] = useState(Boolean(value.taxCode));
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setCatalogsLoading(true);
    void Promise.all([getFiscalCatalogUnits(), getFiscalCatalogTaxes()])
      .then(([nextUnits, nextTaxes]) => {
        if (!active) return;
        setUnits(nextUnits);
        setTaxes(nextTaxes);
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "No se pudieron cargar los catálogos fiscales.");
      })
      .finally(() => { if (active) setCatalogsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!value.cabysCode) {
      setSelectedCabys(null);
      setCabysResolving(false);
      return;
    }
    if (selectedCabys?.code === value.cabysCode) return;
    let active = true;
    setCabysResolving(true);
    void getFiscalCatalogCabys(value.cabysCode)
      .then((cabys) => {
        if (!active) return;
        setSelectedCabys(cabys);
        setCabysQuery(`${cabys.code} — ${cabys.description}`);
      })
      .catch(() => { if (active) setSelectedCabys(null); })
      .finally(() => { if (active) setCabysResolving(false); });
    return () => { active = false; };
  }, [selectedCabys?.code, value.cabysCode]);

  useEffect(() => {
    if (!value.taxCode) {
      setRates([]);
      setRatesLoading(false);
      return;
    }
    let active = true;
    setRatesLoading(true);
    void getFiscalCatalogTaxRates(value.taxCode)
      .then((nextRates) => { if (active) setRates(nextRates); })
      .catch((caught) => {
        if (!active) return;
        setRates([]);
        setError(caught instanceof Error ? caught.message : "No se pudieron cargar las tarifas fiscales.");
      })
      .finally(() => { if (active) setRatesLoading(false); });
    return () => { active = false; };
  }, [value.taxCode]);

  useEffect(() => {
    const query = cabysQuery.trim();
    if (selectedCabys || query.length < 3) {
      setCabysOptions([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      setCabysLoading(true);
      void searchFiscalCatalogCabys(query)
        .then((response) => setCabysOptions(response.items))
        .catch((caught) => {
          setCabysOptions([]);
          setError(caught instanceof Error ? caught.message : "No se pudo buscar CABYS.");
        })
        .finally(() => setCabysLoading(false));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [cabysQuery, selectedCabys]);

  const selectedRate = rates.find((rate) => rate.code === value.taxRateCode) ?? null;
  const unavailable = useMemo(() => ({
    cabys: Boolean(value.cabysCode && !cabysResolving && !selectedCabys),
    unit: Boolean(value.unitOfMeasureCode && !catalogsLoading && !units.some((unit) => unit.code === value.unitOfMeasureCode)),
    tax: Boolean(value.taxCode && !catalogsLoading && !taxes.some((tax) => tax.code === value.taxCode)),
    rate: Boolean(value.taxRateCode && !ratesLoading && !rates.some((rate) => rate.code === value.taxRateCode)),
  }), [cabysResolving, catalogsLoading, ratesLoading, rates, selectedCabys, taxes, units, value]);
  const complete = Boolean(
    value.cabysCode &&
    value.unitOfMeasureCode &&
    value.taxCode &&
    value.taxRateCode &&
    !Object.values(unavailable).some(Boolean),
  );

  useEffect(() => {
    onStateChange?.({ complete, selectedRate, unavailable });
  }, [complete, onStateChange, selectedRate, unavailable]);

  const chooseCabys = (option: FiscalCatalogCabysItem) => {
    setSelectedCabys(option);
    setCabysQuery(`${option.code} — ${option.description}`);
    setCabysOptions([]);
    setError("");
    onChange({ ...value, cabysCode: option.code });
  };

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Clasificación fiscal</h3>
        <p className="mt-1 text-sm text-muted-foreground">Seleccione valores vigentes de los catálogos fiscales.</p>
      </div>

      <FormField label="CABYS" htmlFor={`${idPrefix}-cabys-search`} required>
        <div className="relative">
          <Input
            id={`${idPrefix}-cabys-search`}
            value={cabysQuery}
            autoComplete="off"
            disabled={disabled}
            placeholder="Busque por código o descripción (mínimo 3 caracteres)"
            className="pr-10"
            onChange={(event) => {
              setCabysQuery(event.target.value);
              setSelectedCabys(null);
              setError("");
              onChange({ ...value, cabysCode: "" });
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
        {cabysQuery.trim().length >= 3 && !cabysLoading && !cabysOptions.length && !selectedCabys ? <p className="text-xs text-muted-foreground">No se encontraron resultados para la búsqueda.</p> : null}
        {unavailable.cabys ? <UnavailableWarning text={`El CABYS guardado ${value.cabysCode} no está disponible. Seleccione uno activo.`} /> : null}
      </FormField>

      <CatalogSelect id={`${idPrefix}-unit`} label="Unidad de medida" value={value.unitOfMeasureCode} items={units} disabled={disabled || catalogsLoading} unavailable={unavailable.unit} onChange={(unitOfMeasureCode) => { setError(""); onChange({ ...value, unitOfMeasureCode }); }} />
      <CatalogSelect id={`${idPrefix}-tax`} label="Impuesto" value={value.taxCode} items={taxes} disabled={disabled || catalogsLoading} unavailable={unavailable.tax} onChange={(taxCode) => { setError(""); setRates([]); onChange({ ...value, taxCode, taxRateCode: "" }); }} />
      <FormField label="Tarifa fiscal" htmlFor={`${idPrefix}-rate`} required>
        <Select id={`${idPrefix}-rate`} value={value.taxRateCode} disabled={disabled || ratesLoading || !value.taxCode} onChange={(event) => { setError(""); onChange({ ...value, taxRateCode: event.target.value }); }}>
          <option value="">Seleccione una tarifa</option>
          {unavailable.rate ? <option value={value.taxRateCode}>{value.taxRateCode} — No disponible</option> : null}
          {rates.map((rate) => <option key={rate.code} value={rate.code}>{rate.code} — {rate.name} — {rate.percentage}%</option>)}
        </Select>
        {unavailable.rate ? <UnavailableWarning text={`La tarifa guardada ${value.taxRateCode} ya no está activa para el impuesto seleccionado.`} /> : null}
        {!ratesLoading && value.taxCode && !rates.length ? <p className="text-xs text-muted-foreground">No hay tarifas activas para el impuesto seleccionado.</p> : null}
      </FormField>
      <ReadOnlyField id={`${idPrefix}-percentage`} label="Porcentaje fiscal de la tarifa seleccionada" value={selectedRate ? `${selectedRate.percentage}%` : persistedTaxPercentage ? `${persistedTaxPercentage}%` : "Seleccione una tarifa activa"} />
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    </section>
  );
}

function CatalogSelect({ id, label, value, items, disabled, unavailable, onChange }: { id: string; label: string; value: string; items: FiscalCatalogCodeItem[]; disabled: boolean; unavailable: boolean; onChange: (value: string) => void }) {
  return <FormField label={label} htmlFor={id} required><Select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">Seleccione una opción</option>{unavailable ? <option value={value}>{value} — No disponible</option> : null}{items.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} — {entry.name}</option>)}</Select>{unavailable ? <UnavailableWarning text={`El valor guardado ${value} ya no está activo. Seleccione una opción vigente.`} /> : null}</FormField>;
}

function ReadOnlyField({ id, label, value }: { id: string; label: string; value: string }) {
  return <FormField label={label} htmlFor={id}><Input id={id} value={value} readOnly className="bg-muted text-muted-foreground" /></FormField>;
}

function UnavailableWarning({ text }: { text: string }) {
  return <Alert variant="warning" className="flex gap-2 px-3 py-2 text-xs"><AlertTriangle className="size-4 shrink-0" aria-hidden="true" /><AlertDescription className="mt-0">{text}</AlertDescription></Alert>;
}

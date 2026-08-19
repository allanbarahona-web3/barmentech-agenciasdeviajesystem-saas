'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  listTerritorialSubdivisions,
  TerritorialCatalogApiError,
  type TerritorialSubdivision,
} from '@/lib/territorial-catalog-api';

type Props = {
  countryCode: string;
  provinceCode: string;
  cantonCode: string;
  districtCode: string;
  onProvinceCodeChange: (code: string) => void;
  onCantonCodeChange: (code: string) => void;
  onDistrictCodeChange: (code: string) => void;
  onValidityChange?: (valid: boolean) => void;
  disabled?: boolean;
};

type LevelState = {
  requestKey: string;
  items: TerritorialSubdivision[];
  loading: boolean;
  error: string;
  loaded: boolean;
};

const INITIAL_LEVEL: LevelState = {
  requestKey: '',
  items: [],
  loading: false,
  error: '',
  loaded: false,
};

function messageFor(error: unknown) {
  return error instanceof TerritorialCatalogApiError
    ? error.message
    : 'No se pudo cargar el catálogo territorial. Intente nuevamente.';
}

function useTerritorialLevel(
  countryCode: string,
  parentFullCode: string | undefined,
  enabled: boolean,
) {
  const [state, setState] = useState<LevelState>(INITIAL_LEVEL);
  const [retry, setRetry] = useState(0);
  const requestKey = enabled
    ? `${countryCode}:${parentFullCode ?? 'root'}:${retry}`
    : '';

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    void listTerritorialSubdivisions(
      countryCode,
      parentFullCode,
      controller.signal,
    )
      .then((result) => {
        setState({
          requestKey,
          items: result.subdivisions,
          loading: false,
          error: '',
          loaded: true,
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({
            requestKey,
            items: [],
            loading: false,
            error: messageFor(error),
            loaded: false,
          });
        }
      });

    return () => controller.abort();
  }, [countryCode, enabled, parentFullCode, requestKey]);

  const isCurrent = enabled && state.requestKey === requestKey;
  return {
    ...(isCurrent ? state : INITIAL_LEVEL),
    loading: enabled && !isCurrent,
    retry: () => setRetry((value) => value + 1),
  };
}

export function TerritorialCascadeSelect({
  countryCode,
  provinceCode,
  cantonCode,
  districtCode,
  onProvinceCodeChange,
  onCantonCodeChange,
  onDistrictCodeChange,
  onValidityChange,
  disabled = false,
}: Props) {
  const normalizedCountry = countryCode.trim().toUpperCase();
  const provinces = useTerritorialLevel(normalizedCountry, undefined, true);
  const province = useMemo(
    () => provinces.items.find((item) => item.code === provinceCode),
    [provinceCode, provinces.items],
  );
  const cantons = useTerritorialLevel(
    normalizedCountry,
    province?.fullCode,
    Boolean(province),
  );
  const canton = useMemo(
    () => cantons.items.find((item) => item.code === cantonCode),
    [cantonCode, cantons.items],
  );
  const districts = useTerritorialLevel(
    normalizedCountry,
    canton?.fullCode,
    Boolean(canton),
  );
  const district = useMemo(
    () => districts.items.find((item) => item.code === districtCode),
    [districtCode, districts.items],
  );

  const valid = Boolean(province && canton && district);
  useEffect(() => {
    onValidityChange?.(valid);
  }, [onValidityChange, valid]);

  function changeProvince(code: string) {
    onProvinceCodeChange(code);
    onCantonCodeChange('');
    onDistrictCodeChange('');
  }

  function changeCanton(code: string) {
    onCantonCodeChange(code);
    onDistrictCodeChange('');
  }

  return (
    <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
      <TerritorialSelect
        id="fiscal-issuer-province"
        label="Provincia"
        value={provinceCode}
        state={provinces}
        unresolved={provinces.loaded && Boolean(provinceCode) && !province}
        disabled={disabled}
        onChange={changeProvince}
      />
      <TerritorialSelect
        id="fiscal-issuer-canton"
        label="Cantón"
        value={cantonCode}
        state={cantons}
        unresolved={cantons.loaded && Boolean(cantonCode) && !canton}
        disabled={disabled || !province}
        onChange={changeCanton}
      />
      <TerritorialSelect
        id="fiscal-issuer-district"
        label="Distrito"
        value={districtCode}
        state={districts}
        unresolved={districts.loaded && Boolean(districtCode) && !district}
        disabled={disabled || !canton}
        onChange={onDistrictCodeChange}
      />
    </div>
  );
}

function TerritorialSelect({
  id,
  label,
  value,
  state,
  unresolved,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  state: LevelState & { retry: () => void };
  unresolved: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const messageId = `${id}-message`;
  const emptyMessage =
    label === 'Cantón'
      ? 'No hay cantones disponibles.'
      : label === 'Distrito'
        ? 'No hay distritos disponibles.'
        : 'No hay provincias disponibles.';
  return (
    <label className="grid content-start gap-1 text-sm font-medium text-slate-700">
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || state.loading}
        required
        aria-describedby={state.error || unresolved ? messageId : undefined}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100"
      >
        <option value="">
          {state.loading ? `Cargando ${label.toLowerCase()}…` : `Seleccione ${label.toLowerCase()}`}
        </option>
        {unresolved && (
          <option value={value}>Código guardado {value} (no disponible)</option>
        )}
        {state.items.map((item) => (
          <option key={item.fullCode} value={item.code}>
            {item.code} — {item.name}
          </option>
        ))}
      </select>
      {state.error && (
        <span id={messageId} role="alert" className="text-xs text-red-700">
          {state.error}{' '}
          <button type="button" className="font-semibold underline" onClick={state.retry}>
            Intentar nuevamente
          </button>
        </span>
      )}
      {unresolved && !state.error && (
        <span id={messageId} role="alert" className="text-xs text-amber-700">
          La división territorial seleccionada ya no está disponible. Seleccione una opción vigente.
        </span>
      )}
      {state.loaded && state.items.length === 0 && !state.error && (
        <span role="status" className="text-xs text-slate-600">
          {emptyMessage}
        </span>
      )}
    </label>
  );
}

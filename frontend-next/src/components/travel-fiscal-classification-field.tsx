'use client';

import { useEffect, useRef, useState } from 'react';
import { getStoredSession } from '@/lib/auth-api';
import { getTenantBillingConfiguration } from '@/lib/fiscal-billing-admin-api';
import {
  canConfigureTravelFiscalClassification,
  hasTravelFiscalBillingCapability,
  type TravelFiscalClassificationOption,
  type TravelFiscalClassificationUsage,
} from '@/lib/travel-fiscal-classification';
import { listTravelFiscalClassifications } from '@/lib/travel-fiscal-classifications-api';

type FiscalSelectorState = {
  allowed: boolean;
  enabled: boolean;
  loading: boolean;
  error: string;
  options: TravelFiscalClassificationOption[];
};

export function useAdminTravelFiscalClassifications(
  usage: TravelFiscalClassificationUsage,
): FiscalSelectorState {
  const [state, setState] = useState<FiscalSelectorState>({
    allowed: false,
    enabled: false,
    loading: true,
    error: '',
    options: [],
  });
  const capabilityRequest = useRef<Promise<boolean> | null>(null);
  const optionsRequests = useRef(
    new Map<
      TravelFiscalClassificationUsage,
      Promise<TravelFiscalClassificationOption[]>
    >(),
  );

  useEffect(() => {
    let active = true;
    const role = getStoredSession()?.user?.role;
    const allowed = canConfigureTravelFiscalClassification(role);

    if (!allowed) {
      setState({
        allowed: false,
        enabled: false,
        loading: false,
        error: '',
        options: [],
      });
      return () => {
        active = false;
      };
    }

    setState((current) => ({ ...current, allowed: true, loading: true }));

    if (!capabilityRequest.current) {
      capabilityRequest.current = getTenantBillingConfiguration().then(
        hasTravelFiscalBillingCapability,
      );
    }

    void capabilityRequest.current
      .then(async (enabled) => {
        if (!enabled) {
          if (active) {
            setState({
              allowed: true,
              enabled: false,
              loading: false,
              error: '',
              options: [],
            });
          }
          return;
        }

        let request = optionsRequests.current.get(usage);
        if (!request) {
          request = listTravelFiscalClassifications(usage);
          optionsRequests.current.set(usage, request);
        }
        const options = await request;
        if (active) {
          setState({
            allowed: true,
            enabled: true,
            loading: false,
            error: '',
            options,
          });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            allowed: true,
            enabled: false,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : 'No se pudo cargar la configuración fiscal.',
            options: [],
          });
        }
      });

    return () => {
      active = false;
    };
  }, [usage]);

  return state;
}

type TravelFiscalClassificationFieldProps = {
  value: string;
  onChange: (value: string) => void;
  state: FiscalSelectorState;
  compact?: boolean;
};

export function TravelFiscalClassificationField({
  value,
  onChange,
  state,
  compact = false,
}: TravelFiscalClassificationFieldProps) {
  if (!state.allowed) return null;

  if (state.loading) {
    return (
      <p style={{ margin: 0, color: '#6b7280', fontSize: compact ? 12 : 13 }}>
        Cargando configuración fiscal…
      </p>
    );
  }

  if (!state.enabled) {
    return state.error ? (
      <p style={{ margin: 0, color: '#92400e', fontSize: compact ? 12 : 13 }}>
        No se pudo cargar la clasificación fiscal. El viaje puede guardarse sin ella.
      </p>
    ) : null;
  }

  return (
    <div>
      <label
        style={{
          display: 'block',
          marginBottom: compact ? 4 : 6,
          fontSize: compact ? 13 : 14,
          fontWeight: 500,
          color: '#111827',
        }}
      >
        Clasificación fiscal
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: '100%',
          padding: compact ? '8px 12px' : '10px 12px',
          border: '1px solid #d1d5db',
          borderRadius: compact ? 6 : 8,
          fontSize: compact ? 13 : 14,
          fontFamily: 'inherit',
          boxSizing: 'border-box',
          background: '#fff',
        }}
      >
        <option value="">Ninguna / No aplica</option>
        {state.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <p style={{ margin: '5px 0 0', color: '#6b7280', fontSize: 12 }}>
        Se usa solo para facturación electrónica; no cambia el precio del viaje.
      </p>
      {state.options.length === 0 ? (
        <p style={{ margin: '5px 0 0', color: '#92400e', fontSize: 12 }}>
          No hay clasificaciones fiscales configuradas para este tipo de viaje.
        </p>
      ) : null}
    </div>
  );
}

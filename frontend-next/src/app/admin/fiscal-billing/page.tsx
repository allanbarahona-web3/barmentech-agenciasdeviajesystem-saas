'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/loading-spinner';
import { ToastNotification, useToast } from '@/components/toast-notification';
import { getHomeRouteForRole, getStoredSession } from '@/lib/auth-api';
import {
  FiscalBillingAdminApiError,
  getTenantBillingConfiguration,
  updateTenantBillingConfiguration,
  type TenantBillingConfiguration,
  type UpdateTenantBillingConfiguration,
} from '@/lib/fiscal-billing-admin-api';

type FormState = UpdateTenantBillingConfiguration;

const EMPTY_FORM: FormState = {
  billingEnabled: false,
  externalRegistrationEnabled: false,
  electronicIssuanceEnabled: false,
  countryCode: 'CR',
  defaultCurrencyCode: 'CRC',
  fiscalTimezone: 'America/Costa_Rica',
  fiscalSchemaVersion: '4.4',
};

function toForm(configuration: TenantBillingConfiguration): FormState {
  return {
    billingEnabled: configuration.billingEnabled,
    externalRegistrationEnabled: configuration.externalRegistrationEnabled,
    electronicIssuanceEnabled: configuration.electronicIssuanceEnabled,
    countryCode: configuration.countryCode,
    defaultCurrencyCode: configuration.defaultCurrencyCode,
    fiscalTimezone: configuration.fiscalTimezone,
    fiscalSchemaVersion: configuration.fiscalSchemaVersion,
  };
}

function formatUpdatedAt(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('es-CR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function ToggleField({
  id,
  checked,
  title,
  description,
  disabled,
  onChange,
}: {
  id: string;
  checked: boolean;
  title: string;
  description: string;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start justify-between gap-6 rounded-xl border border-slate-200 bg-white p-4"
    >
      <span>
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-1 block max-w-2xl text-xs leading-5 text-slate-600">
          {description}
        </span>
      </span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-blue-700"
      />
    </label>
  );
}

export default function FiscalBillingAdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loadError, setLoadError] = useState<FiscalBillingAdminApiError | null>(null);
  const [reload, setReload] = useState(0);
  const { toasts, showSuccess, showError, dismissToast } = useToast();

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user?.id) {
      router.replace('/');
      return;
    }
    const role = String(session.user.role || '').toUpperCase();
    if (role !== 'ADMIN') {
      router.replace(getHomeRouteForRole(role));
      return;
    }

    const controller = new AbortController();
    void getTenantBillingConfiguration(controller.signal)
      .then((response) => {
        setConfigured(response.configured);
        setUpdatedAt(response.configuration.updatedAt);
        setForm(toForm(response.configuration));
        setLoadError(null);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const requestError =
          error instanceof FiscalBillingAdminApiError
            ? error
            : new FiscalBillingAdminApiError(
                'FISCAL_BILLING_ADMIN_REQUEST_FAILED',
                'No se pudo cargar la configuración fiscal.',
              );
        setLoadError(requestError);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload, router]);

  function setBoolean(field: keyof Pick<FormState, 'billingEnabled' | 'externalRegistrationEnabled' | 'electronicIssuanceEnabled'>, value: boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const timezone = form.fiscalTimezone.trim();
    const currency = form.defaultCurrencyCode.trim();
    if (!/^[A-Z]{3}$/.test(currency)) {
      showError('La moneda debe contener exactamente tres letras mayúsculas.');
      return;
    }
    if (!timezone || timezone.length > 100) {
      showError('La zona horaria fiscal es obligatoria y debe tener como máximo 100 caracteres.');
      return;
    }

    setSaving(true);
    try {
      const response = await updateTenantBillingConfiguration({
        billingEnabled: form.billingEnabled,
        externalRegistrationEnabled: form.externalRegistrationEnabled,
        electronicIssuanceEnabled: form.electronicIssuanceEnabled,
        countryCode: form.countryCode,
        defaultCurrencyCode: currency,
        fiscalTimezone: timezone,
        fiscalSchemaVersion: form.fiscalSchemaVersion,
      });
      setConfigured(response.configured);
      setUpdatedAt(response.configuration.updatedAt);
      setForm(toForm(response.configuration));
      showSuccess('Configuración fiscal guardada correctamente.');
    } catch (error) {
      showError(
        error instanceof FiscalBillingAdminApiError
          ? error.message
          : 'No se pudo guardar la configuración fiscal.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="app-shell">
        <div className="grid min-h-[360px] place-items-center">
          <LoadingSpinner size="large" message="Cargando configuración fiscal…" />
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="app-shell">
        <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">No se pudo cargar la configuración fiscal</h1>
          <p className="mt-2 text-sm text-slate-600">{loadError.message}</p>
          <p className="mt-2 font-mono text-xs text-slate-500">Código: {loadError.code}</p>
          <Button className="mt-5" variant="outline" onClick={() => { setLoading(true); setReload((value) => value + 1); }}>
            Intentar nuevamente
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Administración fiscal</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Configuración fiscal</h1>
              <p className="mt-2 text-sm text-slate-600">Configure las capacidades fiscales generales de la empresa.</p>
            </div>
            <Badge
              variant="outline"
              className={configured
                ? 'border-green-300 !bg-green-50 !text-green-800'
                : 'border-amber-300 !bg-amber-50 !text-amber-900'}
            >
              {configured ? 'Configurada' : 'Sin configurar'}
            </Badge>
            <Link href="/admin/fiscal-billing/issuers" className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
              Administrar emisores
            </Link>
          </div>
          {!configured && (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Esta configuración aún no se ha guardado. El formulario muestra los valores seguros predeterminados.
            </p>
          )}
          {updatedAt && <p className="mt-3 text-xs text-slate-500">Última actualización: {formatUpdatedAt(updatedAt)}</p>}
        </header>

        <form className="space-y-6" onSubmit={save}>
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Capacidades de facturación</h2>
            <div className="mt-4 grid gap-3">
              <ToggleField id="billing-enabled" checked={form.billingEnabled} disabled={saving} title="Facturación habilitada" description="Habilita el módulo de facturación para la empresa." onChange={(value) => setBoolean('billingEnabled', value)} />
              <ToggleField id="electronic-issuance-enabled" checked={form.electronicIssuanceEnabled} disabled={saving} title="Emisión electrónica habilitada" description="Permite la emisión fiscal mediante el proveedor electrónico cuando el resto de requisitos esté completo." onChange={(value) => setBoolean('electronicIssuanceEnabled', value)} />
              <ToggleField id="external-registration-enabled" checked={form.externalRegistrationEnabled} disabled={saving} title="Registro externo habilitado" description="Permite registrar documentos emitidos fuera de este flujo electrónico." onChange={(value) => setBoolean('externalRegistrationEnabled', value)} />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Paquete fiscal de Costa Rica</h2>
            <p className="mt-1 text-xs text-slate-600">Esta versión de la aplicación admite únicamente el paquete CR 4.4.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                País
                <input readOnly value={form.countryCode} className="rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-slate-700" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                Versión fiscal
                <input readOnly value={form.fiscalSchemaVersion} className="rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-slate-700" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                Moneda predeterminada para documentos nuevos
                <input
                  required
                  maxLength={3}
                  value={form.defaultCurrencyCode}
                  disabled={saving}
                  onChange={(event) => setForm((current) => ({ ...current, defaultCurrencyCode: event.target.value.toUpperCase() }))}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <span className="text-xs font-normal text-slate-500">Código de moneda de tres letras, por ejemplo CRC. Se utiliza únicamente cuando el documento no tiene una moneda de origen. Las Sales Orders y otros documentos existentes conservan su propia moneda.</span>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                Zona horaria fiscal
                <input
                  required
                  maxLength={100}
                  value={form.fiscalTimezone}
                  disabled={saving}
                  onChange={(event) => setForm((current) => ({ ...current, fiscalTimezone: event.target.value }))}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <span className="text-xs font-normal text-slate-500">Se eliminarán espacios al inicio y al final al guardar.</span>
              </label>
            </div>
          </section>

          <aside className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950">
            <h2 className="font-semibold">Próximo paso: configurar el emisor fiscal</h2>
            <p className="mt-1 leading-6">Habilitar esta configuración no es suficiente por sí solo. Antes de crear un borrador fiscal todavía se requiere un emisor fiscal activo y una actividad económica principal.</p>
          </aside>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving} className="min-w-48 !bg-blue-700 !text-white hover:!bg-blue-800">
              {saving ? 'Guardando…' : 'Guardar configuración'}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}

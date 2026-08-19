'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/confirm-modal';
import { LoadingSpinner } from '@/components/loading-spinner';
import { ToastNotification, useToast } from '@/components/toast-notification';
import { getHomeRouteForRole, getStoredSession } from '@/lib/auth-api';
import {
  assignIssuerEconomicActivity,
  deleteIssuerEconomicActivity,
  FiscalBillingAdminApiError,
  getAvailableEconomicActivities,
  getFiscalIssuer,
  listIssuerEconomicActivities,
  selectPrimaryIssuerEconomicActivity,
  type AvailableEconomicActivities,
  type FiscalIssuer,
  type FiscalIssuerEconomicActivity,
} from '@/lib/fiscal-billing-admin-api';

type Confirmation =
  | { kind: 'primary'; activity: FiscalIssuerEconomicActivity }
  | { kind: 'delete'; activity: FiscalIssuerEconomicActivity };

function safeError(error: unknown) {
  if (!(error instanceof FiscalBillingAdminApiError)) {
    return 'No se pudo completar la operación. Intente nuevamente.';
  }
  if (error.code === 'FISCAL_ISSUER_NOT_FOUND') {
    return 'El emisor fiscal no existe o no está disponible.';
  }
  return error.message;
}

function yesNo(value: boolean | undefined) {
  if (value === undefined) return null;
  return value ? 'Sí' : 'No';
}

export default function IssuerEconomicActivitiesPage() {
  const { issuerId } = useParams<{ issuerId: string }>();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [issuer, setIssuer] = useState<FiscalIssuer | null>(null);
  const [issuerError, setIssuerError] = useState('');
  const [assignments, setAssignments] = useState<FiscalIssuerEconomicActivity[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState('');
  const [assignmentsVersion, setAssignmentsVersion] = useState(0);
  const [available, setAvailable] = useState<AvailableEconomicActivities | null>(null);
  const [availableLoading, setAvailableLoading] = useState(true);
  const [availableError, setAvailableError] = useState('');
  const [availableVersion, setAvailableVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const { toasts, showSuccess, showError, dismissToast } = useToast();

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user?.id) {
      router.replace('/');
      return;
    }
    const role = String(session.user.role ?? '').toUpperCase();
    if (role !== 'ADMIN') {
      router.replace(getHomeRouteForRole(role));
      return;
    }
    setAuthorized(true);
  }, [router]);

  useEffect(() => {
    if (!authorized) return;
    const controller = new AbortController();
    void getFiscalIssuer(issuerId, controller.signal)
      .then((value) => {
        setIssuer(value);
        setIssuerError('');
      })
      .catch((error) => {
        if (!controller.signal.aborted) setIssuerError(safeError(error));
      });
    return () => controller.abort();
  }, [authorized, issuerId]);

  useEffect(() => {
    if (!authorized) return;
    const controller = new AbortController();
    setAssignmentsLoading(true);
    void listIssuerEconomicActivities(issuerId, controller.signal)
      .then((items) => {
        setAssignments(items);
        setAssignmentsError('');
      })
      .catch((error) => {
        if (!controller.signal.aborted) setAssignmentsError(safeError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setAssignmentsLoading(false);
      });
    return () => controller.abort();
  }, [assignmentsVersion, authorized, issuerId]);

  useEffect(() => {
    if (!authorized) return;
    const controller = new AbortController();
    setAvailableLoading(true);
    void getAvailableEconomicActivities(issuerId, controller.signal)
      .then((value) => {
        setAvailable(value);
        setAvailableError('');
      })
      .catch((error) => {
        if (!controller.signal.aborted) setAvailableError(safeError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setAvailableLoading(false);
      });
    return () => controller.abort();
  }, [authorized, availableVersion, issuerId]);

  const refreshAssignments = useCallback(() => {
    setAssignmentsVersion((value) => value + 1);
  }, []);

  async function addActivity(code: string) {
    if (saving) return;
    setSaving(true);
    try {
      await assignIssuerEconomicActivity(issuerId, code);
      showSuccess('Actividad económica agregada correctamente.');
      refreshAssignments();
    } catch (error) {
      showError(safeError(error));
    } finally {
      setSaving(false);
    }
  }

  async function confirmMutation() {
    if (saving) return;
    if (!confirmation) return;
    setSaving(true);
    try {
      if (confirmation.kind === 'primary') {
        await selectPrimaryIssuerEconomicActivity(
          issuerId,
          confirmation.activity.id,
        );
        showSuccess('Actividad económica principal actualizada correctamente.');
      } else {
        await deleteIssuerEconomicActivity(issuerId, confirmation.activity.id);
        showSuccess('Actividad económica eliminada correctamente.');
      }
      setConfirmation(null);
      refreshAssignments();
    } catch (error) {
      showError(safeError(error));
    } finally {
      setSaving(false);
    }
  }

  if (!authorized) {
    return (
      <main className="app-shell grid min-h-[360px] place-items-center">
        <LoadingSpinner size="large" message="Verificando acceso…" />
      </main>
    );
  }

  const assignedCodes = new Set(assignments.map((activity) => activity.code));
  const missingPrimary = assignments.length > 0 && !assignments.some((item) => item.isPrimary);

  return (
    <main className="app-shell">
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-xl border bg-white p-6 shadow-sm">
          <Link href="/admin/fiscal-billing/issuers" className="text-sm font-semibold text-blue-700">
            ← Emisores fiscales
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Actividades económicas</h1>
          {issuer ? (
            <div className="mt-3 text-sm text-slate-700">
              <strong>{issuer.displayName}</strong>
              <span className="ml-2">{issuer.legalName}</span>
              <span className="mt-1 block">
                {issuer.identificationTypeCode} · {issuer.identificationNumber}
              </span>
            </div>
          ) : issuerError ? (
            <p role="alert" className="mt-3 text-sm text-red-700">{issuerError}</p>
          ) : (
            <p role="status" className="mt-3 text-sm text-slate-600">Cargando emisor…</p>
          )}
        </header>

        <section aria-labelledby="assigned-title" className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 id="assigned-title" className="text-xl font-bold text-slate-900">Actividades asignadas</h2>
            {assignmentsError && <Button variant="outline" size="sm" onClick={refreshAssignments}>Reintentar</Button>}
          </div>
          {assignmentsLoading ? (
            <div role="status" className="py-8"><LoadingSpinner message="Cargando actividades asignadas…" /></div>
          ) : assignmentsError ? (
            <p role="alert" className="mt-4 text-sm text-red-700">{assignmentsError}</p>
          ) : assignments.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">Este emisor todavía no tiene actividades económicas asignadas.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {missingPrimary && (
                <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  Seleccione una actividad económica principal para completar la configuración fiscal del emisor.
                </p>
              )}
              {assignments.map((activity) => (
                <article key={activity.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="font-semibold text-slate-900">{activity.code}</code>
                      {activity.isPrimary && <Badge className="bg-blue-100 text-blue-800">Principal</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{activity.description ?? 'Sin descripción registrada'}</p>
                    <p className="mt-1 text-xs text-slate-500">Orden {activity.displayOrder} · Actualizada {new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(activity.updatedAt))}</p>
                  </div>
                  {!activity.isPrimary && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="!border-blue-300 !bg-blue-50 !text-blue-700 hover:!bg-blue-100 hover:!text-blue-800" disabled={saving} onClick={() => setConfirmation({ kind: 'primary', activity })}>Marcar como principal</Button>
                      <Button variant="outline" size="sm" className="!border-red-300 !bg-red-50 !text-red-700 hover:!bg-red-100 hover:!text-red-800" disabled={saving} onClick={() => setConfirmation({ kind: 'delete', activity })}>Eliminar</Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="available-title" className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 id="available-title" className="text-xl font-bold text-slate-900">Actividades oficiales en Hacienda</h2>
            {availableError && <Button variant="outline" size="sm" className="!border-blue-300 !bg-blue-50 !text-blue-700 hover:!bg-blue-100 hover:!text-blue-800" onClick={() => setAvailableVersion((value) => value + 1)}>Reintentar</Button>}
          </div>
          {availableLoading ? (
            <div role="status" className="py-8"><LoadingSpinner message="Consultando Hacienda…" /></div>
          ) : availableError ? (
            <p role="alert" className="mt-4 text-sm text-red-700">{availableError}</p>
          ) : available ? (
            <div className="mt-4 space-y-4">
              {(available.legalName || available.taxSituation) && (
                <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
                  {available.legalName && <p><strong>Nombre legal:</strong> {available.legalName}</p>}
                  {available.taxSituation?.status && <p><strong>Estado:</strong> {available.taxSituation.status}</p>}
                  {yesNo(available.taxSituation?.delinquent) && <p><strong>Morosidad:</strong> {yesNo(available.taxSituation?.delinquent)}</p>}
                  {yesNo(available.taxSituation?.omission) && <p><strong>Omisión:</strong> {yesNo(available.taxSituation?.omission)}</p>}
                  {available.taxSituation?.taxAdministration && <p><strong>Administración tributaria:</strong> {available.taxSituation.taxAdministration}</p>}
                </div>
              )}
              {available.activities.length === 0 ? (
                <p className="text-sm text-slate-600">Hacienda no devolvió actividades económicas disponibles para este contribuyente.</p>
              ) : available.activities.map((activity) => {
                const assigned = assignedCodes.has(activity.code);
                return (
                  <article key={activity.code} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
                    <div>
                      <code className="font-semibold text-slate-900">{activity.code}</code>
                      <p className="mt-1 text-sm text-slate-700">{activity.description}</p>
                      <div className="mt-1 flex gap-2 text-xs text-slate-500">
                        {activity.status && <span>Estado: {activity.status}</span>}
                        {activity.primary !== undefined && <span>Principal en Hacienda: {activity.primary ? 'Sí' : 'No'}</span>}
                      </div>
                    </div>
                    <Button size="sm" disabled={saving || assigned} onClick={() => void addActivity(activity.code)}>
                      {assigned ? 'Agregada' : 'Agregar'}
                    </Button>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>

      <ConfirmModal
        isOpen={Boolean(confirmation)}
        title={confirmation?.kind === 'primary' ? 'Cambiar actividad principal' : 'Eliminar actividad económica'}
        message={confirmation?.kind === 'primary'
          ? 'La actividad seleccionada reemplazará a la actividad principal actual.'
          : 'Solo las actividades no principales pueden eliminarse. ¿Desea eliminar esta actividad?'}
        confirmText={confirmation?.kind === 'primary' ? 'Marcar como principal' : 'Eliminar'}
        confirmVariant={confirmation?.kind === 'primary' ? 'primary' : 'danger'}
        isLoading={saving}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => void confirmMutation()}
      />
    </main>
  );
}

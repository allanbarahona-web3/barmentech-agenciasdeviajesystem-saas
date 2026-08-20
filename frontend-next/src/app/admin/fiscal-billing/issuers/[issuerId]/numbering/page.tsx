'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ConfirmModal } from '@/components/confirm-modal';
import { LoadingSpinner } from '@/components/loading-spinner';
import { ToastNotification, useToast } from '@/components/toast-notification';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getHomeRouteForRole, getStoredSession } from '@/lib/auth-api';
import {
  configureIssuerIntegratorMode,
  FiscalBillingAdminApiError,
  getFiscalIssuer,
  getFiscalNumberSequences,
  setFiscalNumberSequence,
  type FiscalIssuer,
  type FiscalNumberSequence,
  type FiscalNumberSequencesResponse,
  type ProviderNumberingVerification,
} from '@/lib/fiscal-billing-admin-api';

type Confirmation =
  | { kind: 'provider' }
  | { kind: 'sequence'; sequence: FiscalNumberSequence; requested: string };

function safeError(error: unknown) {
  return error instanceof FiscalBillingAdminApiError
    ? error.message
    : 'No se pudo completar la operación. Intente nuevamente.';
}

function validSequence(value: string) {
  return /^[1-9]\d{0,9}$/.test(value);
}

export default function FiscalIssuerNumberingPage() {
  const { issuerId } = useParams<{ issuerId: string }>();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [issuer, setIssuer] = useState<FiscalIssuer | null>(null);
  const [issuerError, setIssuerError] = useState('');
  const [sequences, setSequences] =
    useState<FiscalNumberSequencesResponse | null>(null);
  const [sequencesLoading, setSequencesLoading] = useState(true);
  const [sequencesError, setSequencesError] = useState('');
  const [sequencesVersion, setSequencesVersion] = useState(0);
  const [providerVerification, setProviderVerification] =
    useState<ProviderNumberingVerification | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const refreshController = useRef<AbortController | null>(null);
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
    setSequencesLoading(true);
    void getFiscalNumberSequences(issuerId, controller.signal)
      .then((value) => {
        setSequences(value);
        setSequencesError('');
      })
      .catch((error) => {
        if (!controller.signal.aborted) setSequencesError(safeError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSequencesLoading(false);
      });
    return () => controller.abort();
  }, [authorized, issuerId, sequencesVersion]);

  useEffect(() => {
    return () => refreshController.current?.abort();
  }, [issuerId]);

  const retrySequences = useCallback(() => {
    setSequencesVersion((value) => value + 1);
  }, []);

  function changeInput(documentTypeCode: string, value: string) {
    if (value !== '' && !/^[1-9]\d{0,9}$/.test(value)) return;
    setInputs((current) => ({ ...current, [documentTypeCode]: value }));
  }

  function requestSequenceSave(sequence: FiscalNumberSequence) {
    if (saving) return;
    const requested = inputs[sequence.documentTypeCode] ?? '';
    if (!validSequence(requested)) {
      showError(
        'Ingrese un número entero entre 1 y 9999999999, sin espacios, signos ni ceros iniciales.',
      );
      return;
    }
    setConfirmation({ kind: 'sequence', sequence, requested });
  }

  async function confirmMutation() {
    if (saving) return;
    if (!confirmation) return;
    setSaving(true);
    try {
      if (confirmation.kind === 'provider') {
        const result = await configureIssuerIntegratorMode(issuerId);
        setProviderVerification(result);
        setConfirmation(null);
        showSuccess('Modo integrador verificado correctamente.');
        return;
      }

      const documentTypeCode = confirmation.sequence.documentTypeCode;
      await setFiscalNumberSequence(
        issuerId,
        documentTypeCode,
        confirmation.requested,
      );
      refreshController.current?.abort();
      const controller = new AbortController();
      refreshController.current = controller;
      const refreshed = await getFiscalNumberSequences(
        issuerId,
        controller.signal,
      );
      setSequences(refreshed);
      setSequencesError('');
      setInputs((current) => ({ ...current, [documentTypeCode]: '' }));
      setConfirmation(null);
      showSuccess('Secuencia fiscal actualizada correctamente.');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        showError(safeError(error));
      }
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

  const sequenceConfirmation =
    confirmation?.kind === 'sequence' ? confirmation : null;

  return (
    <main className="app-shell">
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-xl border bg-white p-6 shadow-sm">
          <Link
            href="/admin/fiscal-billing/issuers"
            className="text-sm font-semibold text-blue-700"
          >
            ← Emisores fiscales
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Numeración fiscal
          </h1>
          {issuer ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-700">
              <strong>{issuer.displayName}</strong>
              <Badge
                variant="outline"
                className={
                  issuer.isActive
                    ? 'border-green-300 !bg-green-50 !text-green-800'
                    : 'border-slate-300 !bg-slate-50 !text-slate-700'
                }
              >
                {issuer.isActive ? 'Activo' : 'Inactivo'}
              </Badge>
              <span>
                Establecimiento:{' '}
                <code>{issuer.establishmentCode ?? '—'}</code>
              </span>
              <span>
                Terminal: <code>{issuer.terminalCode ?? '—'}</code>
              </span>
            </div>
          ) : issuerError ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {issuerError}
            </p>
          ) : (
            <p role="status" className="mt-3 text-sm text-slate-600">
              Cargando emisor…
            </p>
          )}
        </header>

        <section
          aria-labelledby="provider-mode-title"
          className="rounded-xl border bg-white p-6 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="provider-mode-title" className="text-xl font-bold text-slate-900">
                Modo integrador del proveedor
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Antes de configurar los consecutivos, verifique que el proveedor
                esté utilizando el modo integrador para este emisor.
              </p>
            </div>
            <Button
              className="bg-blue-700 text-white hover:bg-blue-800"
              disabled={saving || !issuer}
              onClick={() => {
                if (saving) return;
                setConfirmation({ kind: 'provider' });
              }}
            >
              Configurar y verificar modo integrador
            </Button>
          </div>
          {providerVerification && (
            <div
              role="status"
              className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-950"
            >
              <p className="font-semibold">Modo integrador verificado</p>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <div><dt className="text-xs text-green-800">Sucursal</dt><dd className="font-mono">{providerVerification.branchCode}</dd></div>
                <div><dt className="text-xs text-green-800">Terminal</dt><dd className="font-mono">{providerVerification.terminalCode}</dd></div>
                <div><dt className="text-xs text-green-800">Número informativo actual</dt><dd className="font-mono">{providerVerification.currentNumber}</dd></div>
                <div><dt className="text-xs text-green-800">Próximo número informativo</dt><dd className="font-mono">{providerVerification.nextNumber}</dd></div>
                <div><dt className="text-xs text-green-800">Preview del proveedor</dt><dd className="font-mono break-all">{providerVerification.nextConsecutivo20}</dd></div>
              </dl>
            </div>
          )}
        </section>

        <section
          aria-labelledby="sequences-title"
          className="rounded-xl border bg-white p-6 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="sequences-title" className="text-xl font-bold text-slate-900">
                Secuencias por tipo de documento
              </h2>
              <p className="mt-2 text-sm font-medium text-slate-700">
                Ingrese el próximo número disponible. Si el último documento
                utilizado fue 1092, configure 1093.
              </p>
            </div>
            {sequencesError && (
              <Button variant="outline" onClick={retrySequences} disabled={saving}>
                Reintentar
              </Button>
            )}
          </div>

          {sequencesLoading ? (
            <div role="status" className="py-10">
              <LoadingSpinner message="Cargando secuencias fiscales…" />
            </div>
          ) : sequencesError ? (
            <p role="alert" className="mt-5 text-sm text-red-700">
              {sequencesError}
            </p>
          ) : sequences ? (
            <div className="mt-5 space-y-4">
              {sequences.sequences.map((sequence) => (
                <article
                  key={sequence.documentTypeCode}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        <code>{sequence.documentTypeCode}</code> —{' '}
                        {sequence.documentTypeName}
                      </h3>
                      <Badge
                        variant="outline"
                        className={
                          sequence.configured
                            ? 'mt-2 border-green-300 !bg-green-50 !text-green-800'
                            : 'mt-2 border-slate-300 !bg-slate-50 !text-slate-700'
                        }
                      >
                        {sequence.configured ? 'Configurada' : 'Sin configurar'}
                      </Badge>
                    </div>
                    <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                      <Value label="Número inicial" value={sequence.startingSequenceNumber} />
                      <Value label="Próximo número" value={sequence.nextSequenceNumber} />
                      <Value label="Base de 10 dígitos" value={sequence.providerBasePreview} />
                      <Value label="Consecutivo de 20 caracteres" value={sequence.fullConsecutivePreview} />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <label className="grid min-w-[260px] flex-1 gap-1 text-sm font-medium text-slate-700">
                      Próximo número para {sequence.documentTypeCode} — {sequence.documentTypeName}
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[1-9][0-9]{0,9}"
                        maxLength={10}
                        value={inputs[sequence.documentTypeCode] ?? ''}
                        onChange={(event) =>
                          changeInput(sequence.documentTypeCode, event.target.value)
                        }
                        disabled={saving}
                        className="rounded-md border border-slate-300 px-3 py-2 font-mono"
                      />
                    </label>
                    <Button
                      className="bg-blue-700 text-white hover:bg-blue-800"
                      disabled={saving || !(inputs[sequence.documentTypeCode] ?? '')}
                      onClick={() => requestSequenceSave(sequence)}
                    >
                      Guardar secuencia {sequence.documentTypeCode}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          {saving && (
            <p role="status" aria-live="polite" className="mt-4 text-sm text-slate-600">
              Guardando configuración…
            </p>
          )}
        </section>
      </div>

      <ConfirmModal
        isOpen={confirmation?.kind === 'provider'}
        title="Configurar modo integrador"
        message={
          <div className="space-y-2 text-left">
            <p>Barmentech pasará a ser responsable de asignar los consecutivos fiscales.</p>
            <p>La operación usa las credenciales del proveedor configuradas en el backend actual.</p>
            <p>No emite documentos, no consume consecutivos y no modifica las secuencias locales.</p>
          </div>
        }
        confirmText="Configurar y verificar"
        isLoading={saving}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => void confirmMutation()}
      />

      <ConfirmModal
        isOpen={Boolean(sequenceConfirmation)}
        title={
          sequenceConfirmation?.sequence.configured
            ? 'Confirmar avance de numeración'
            : 'Confirmar número inicial'
        }
        message={
          sequenceConfirmation ? (
            sequenceConfirmation.sequence.configured ? (
              <div className="space-y-2 text-left">
                <p>
                  {sequenceConfirmation.sequence.documentTypeCode} —{' '}
                  {sequenceConfirmation.sequence.documentTypeName}: avanzar al número{' '}
                  <strong>{sequenceConfirmation.requested}</strong>.
                </p>
                <p>La secuencia solo puede avanzar. Los números omitidos pueden requerir justificación.</p>
                <p>Este cambio no puede revertirse desde esta pantalla.</p>
              </div>
            ) : (
              <div className="space-y-2 text-left">
                <p>
                  {sequenceConfirmation.sequence.documentTypeCode} —{' '}
                  {sequenceConfirmation.sequence.documentTypeName}: establecer el próximo número en{' '}
                  <strong>{sequenceConfirmation.requested}</strong>.
                </p>
                <p>Esto establece el punto de continuación operativo de la secuencia.</p>
                <p>Verifique el valor contra el sistema anterior antes de continuar.</p>
              </div>
            )
          ) : null
        }
        confirmText="Guardar numeración"
        isLoading={saving}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => void confirmMutation()}
      />
    </main>
  );
}

function Value({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="block">{label}</span>
      <code className="mt-1 block break-all text-sm font-semibold text-slate-900">
        {value ?? '—'}
      </code>
    </div>
  );
}

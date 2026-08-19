'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/confirm-modal';
import { LoadingSpinner } from '@/components/loading-spinner';
import { ToastNotification, useToast } from '@/components/toast-notification';
import { TerritorialCascadeSelect } from '@/components/territorial-cascade-select';
import { getHomeRouteForRole, getStoredSession } from '@/lib/auth-api';
import {
  listTerritorialSubdivisions,
  TerritorialCatalogApiError,
} from '@/lib/territorial-catalog-api';
import {
  createFiscalIssuer,
  FiscalBillingAdminApiError,
  getFiscalIssuer,
  listFiscalIssuers,
  updateFiscalIssuer,
  updateFiscalIssuerStatus,
  type FiscalIssuer,
  type FiscalIssuerInput,
} from '@/lib/fiscal-billing-admin-api';

type IssuerFormState = Omit<FiscalIssuerInput, 'displayName' | 'neighborhoodCode'>;

const EMPTY: IssuerFormState = {
  legalName: '', identificationTypeCode: '01', identificationNumber: '',
  commercialName: null, countryCode: 'CR', email: '', phoneCountryCode: null,
  phoneNumber: null, provinceCode: '', cantonCode: '', districtCode: '',
  otherAddressDetails: '', defaultCurrencyCode: null,
  establishmentCode: null, terminalCode: null,
};

const LABELS: Record<string, string> = {
  displayName: 'Nombre para mostrar', legalName: 'Razón social',
  identificationTypeCode: 'Tipo de identificación', identificationNumber: 'Número de identificación',
  countryCode: 'País', email: 'Correo electrónico', provinceCode: 'Código de provincia',
  cantonCode: 'Código de cantón', districtCode: 'Código de distrito',
  otherAddressDetails: 'Otras señas', establishmentCode: 'Código de establecimiento',
  terminalCode: 'Código de terminal',
};

function issuerForm(value: FiscalIssuer): IssuerFormState {
  return {
    legalName: value.legalName,
    identificationTypeCode: value.identificationTypeCode, identificationNumber: value.identificationNumber,
    commercialName: value.commercialName, countryCode: value.countryCode, email: value.email,
    phoneCountryCode: value.phoneCountryCode, phoneNumber: value.phoneNumber,
    provinceCode: value.provinceCode, cantonCode: value.cantonCode, districtCode: value.districtCode,
    otherAddressDetails: value.otherAddressDetails,
    defaultCurrencyCode: value.defaultCurrencyCode, establishmentCode: value.establishmentCode,
    terminalCode: value.terminalCode,
  };
}

function nullable(value: string | null) {
  return value?.trim() || null;
}

function payload(form: IssuerFormState): FiscalIssuerInput {
  const legalName = form.legalName.trim();
  const commercialName = nullable(form.commercialName);
  return {
    ...form,
    displayName: commercialName ?? legalName,
    legalName,
    identificationTypeCode: form.identificationTypeCode.trim(), identificationNumber: form.identificationNumber.trim(),
    commercialName: nullable(form.commercialName), countryCode: form.countryCode.trim().toUpperCase(),
    email: form.email.trim(), phoneCountryCode: nullable(form.phoneCountryCode), phoneNumber: nullable(form.phoneNumber),
    provinceCode: form.provinceCode.trim(), cantonCode: form.cantonCode.trim(), districtCode: form.districtCode.trim(),
    otherAddressDetails: form.otherAddressDetails.trim(),
    defaultCurrencyCode: nullable(form.defaultCurrencyCode)?.toUpperCase() ?? null,
    establishmentCode: nullable(form.establishmentCode), terminalCode: nullable(form.terminalCode),
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function errorMessage(error: unknown) {
  if (!(error instanceof FiscalBillingAdminApiError)) return 'No se pudo completar la operación.';
  if (error.code !== 'FISCAL_ISSUER_ACTIVATION_INCOMPLETE') return error.message;
  const fields = error.details?.missingFields;
  const missing = Array.isArray(fields)
    ? fields.filter((field): field is string => typeof field === 'string').map((field) => LABELS[field] ?? field)
    : [];
  return `${error.message}${missing.length ? ` Campos pendientes: ${missing.join(', ')}.` : ''}`;
}

function validate(form: IssuerFormState) {
  const required: Array<keyof IssuerFormState> = ['legalName', 'identificationTypeCode', 'identificationNumber', 'countryCode', 'email', 'provinceCode', 'cantonCode', 'districtCode', 'otherAddressDetails'];
  for (const field of required) {
    if (!String(form[field] ?? '').trim()) return `${LABELS[field] ?? field} es obligatorio.`;
  }
  const country = form.countryCode.trim().toUpperCase();
  if (country === 'CR' && !/^[1-7]$/.test(form.provinceCode.trim())) return 'El código de provincia de Costa Rica debe ser un dígito del 1 al 7.';
  if (country !== 'CR' && !/^\d{2}$/.test(form.provinceCode.trim())) return 'El código de provincia debe contener exactamente dos dígitos.';
  if (!/^\d{2}$/.test(form.cantonCode.trim()) || !/^\d{2}$/.test(form.districtCode.trim())) return 'Los códigos de cantón y distrito deben contener exactamente dos dígitos.';
  if (form.establishmentCode && !/^\d{3}$/.test(form.establishmentCode.trim())) return 'El establecimiento debe contener exactamente tres dígitos.';
  if (form.terminalCode && !/^\d{5}$/.test(form.terminalCode.trim())) return 'La terminal debe contener exactamente cinco dígitos.';
  if (form.defaultCurrencyCode && !/^[A-Za-z]{3}$/.test(form.defaultCurrencyCode.trim())) return 'La moneda debe contener exactamente tres letras.';
  return null;
}

export default function FiscalIssuerAdminPage() {
  const router = useRouter();
  const [issuers, setIssuers] = useState<FiscalIssuer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<IssuerFormState>(EMPTY);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [territorialSelectionValid, setTerritorialSelectionValid] = useState(false);
  const [statusTarget, setStatusTarget] = useState<FiscalIssuer | null>(null);
  const { toasts, showSuccess, showError, dismissToast } = useToast();
  const formDialogRef = useRef<HTMLFormElement>(null);
  const formOpenerRef = useRef<HTMLElement | null>(null);
  const refresh = useCallback(() => {
    setLoading(true);
    setReload((value) => value + 1);
  }, []);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user?.id) { router.replace('/'); return; }
    const role = String(session.user.role ?? '').toUpperCase();
    if (role !== 'ADMIN') { router.replace(getHomeRouteForRole(role)); return; }

    const controller = new AbortController();
    void listFiscalIssuers(controller.signal)
      .then((items) => { setIssuers(items); setLoadError(''); })
      .catch((error) => { if (!controller.signal.aborted) setLoadError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload, router]);

  useEffect(() => {
    if (!formOpen) return;
    formDialogRef.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
  }, [formOpen]);

  useEffect(() => {
    if (!formOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saving) return;
      setFormOpen(false);
      window.requestAnimationFrame(() => formOpenerRef.current?.focus());
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [formOpen, saving]);

  async function edit(issuer: FiscalIssuer) {
    formOpenerRef.current = document.activeElement as HTMLElement | null;
    setSaving(true);
    try {
      const detail = await getFiscalIssuer(issuer.id);
      setEditingId(detail.id); setForm(issuerForm(detail)); setFormOpen(true);
    } catch (error) { showError(errorMessage(error)); }
    finally { setSaving(false); }
  }

  function create() {
    formOpenerRef.current = document.activeElement as HTMLElement | null;
    setEditingId(null); setForm(EMPTY); setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    window.requestAnimationFrame(() => formOpenerRef.current?.focus());
  }

  function set<K extends keyof IssuerFormState>(field: K, value: IssuerFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const issue = validate(form);
    if (issue) { showError(issue); return; }
    if (form.countryCode.trim().toUpperCase() === 'CR' && !territorialSelectionValid) {
      showError('Seleccione una provincia, cantón y distrito vigentes.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateFiscalIssuer(editingId, payload(form));
        showSuccess('Emisor fiscal actualizado correctamente.');
      } else {
        await createFiscalIssuer(payload(form));
        showSuccess('Emisor fiscal creado correctamente.');
      }
      setFormOpen(false);
      window.requestAnimationFrame(() => formOpenerRef.current?.focus());
      refresh();
    } catch (error) { showError(errorMessage(error)); }
    finally { setSaving(false); }
  }

  async function mutateStatus() {
    if (saving) return;
    if (!statusTarget) return;
    setSaving(true);
    try {
      await updateFiscalIssuerStatus(statusTarget.id, !statusTarget.isActive);
      showSuccess(statusTarget.isActive ? 'Emisor fiscal desactivado correctamente.' : 'Emisor fiscal activado correctamente.');
      setStatusTarget(null);
      refresh();
    } catch (error) { showError(errorMessage(error)); }
    finally { setSaving(false); }
  }

  async function prepareStatusMutation(issuer: FiscalIssuer) {
    if (saving) return;
    if (issuer.isActive || issuer.countryCode.trim().toUpperCase() !== 'CR') {
      setStatusTarget(issuer);
      return;
    }

    setSaving(true);
    try {
      const roots = await listTerritorialSubdivisions('CR');
      const province = roots.subdivisions.find(
        (item) => item.code === issuer.provinceCode,
      );
      if (!province) throw new Error('unresolved');

      const cantons = await listTerritorialSubdivisions('CR', province.fullCode);
      const canton = cantons.subdivisions.find(
        (item) => item.code === issuer.cantonCode,
      );
      if (!canton) throw new Error('unresolved');

      const districts = await listTerritorialSubdivisions('CR', canton.fullCode);
      const district = districts.subdivisions.find(
        (item) => item.code === issuer.districtCode,
      );
      if (!district) throw new Error('unresolved');

      setStatusTarget(issuer);
    } catch (error) {
      showError(
        error instanceof TerritorialCatalogApiError
          ? error.message
          : 'La división territorial seleccionada ya no está disponible. Seleccione una opción vigente antes de activar el emisor.',
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading) return <main className="app-shell grid min-h-[360px] place-items-center"><LoadingSpinner size="large" message="Cargando emisores fiscales…" /></main>;
  return <main className="app-shell"><ToastNotification toasts={toasts} onDismiss={dismissToast} /><div className="mx-auto max-w-7xl space-y-5"><header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-6 shadow-sm"><div><Link href="/admin/fiscal-billing" className="text-sm font-semibold text-blue-700">← Configuración fiscal</Link><h1 className="mt-2 text-3xl font-bold text-slate-900">Emisores fiscales</h1><p className="mt-1 text-sm text-slate-600">Administre los datos registrados de quienes emiten documentos fiscales.</p></div><Button className="bg-blue-700 text-white hover:bg-blue-800" onClick={create}>Crear emisor</Button></header>
  {loadError ? <section className="rounded-xl border border-red-200 bg-white p-8 text-center"><p className="text-sm text-red-800">{loadError}</p><Button variant="outline" className="mt-4" onClick={refresh}>Intentar nuevamente</Button></section> : issuers.length === 0 ? <section className="rounded-xl border bg-white p-10 text-center text-sm text-slate-600">Configure un emisor antes de poder emitir documentos fiscales.</section> : <section className="overflow-x-auto rounded-xl border bg-white shadow-sm"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr>{['Emisor','Identificación','País','Establecimiento','Terminal','Estado','Actualizado','Acciones'].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y">{issuers.map((issuer) => <tr key={issuer.id}><td className="px-4 py-3"><strong>{issuer.displayName}</strong><span className="block text-xs text-slate-500">{issuer.legalName}</span></td><td className="px-4 py-3">{issuer.identificationTypeCode} · {issuer.identificationNumber}</td><td className="px-4 py-3">{issuer.countryCode}</td><td className="px-4 py-3 font-mono">{issuer.establishmentCode ?? '—'}</td><td className="px-4 py-3 font-mono">{issuer.terminalCode ?? '—'}</td><td className="px-4 py-3"><Badge variant="outline" className={issuer.isActive ? 'border-green-300 !bg-green-50 !text-green-800' : 'border-slate-300 !bg-slate-50 !text-slate-700'}>{issuer.isActive ? 'Activo' : 'Inactivo'}</Badge></td><td className="px-4 py-3 whitespace-nowrap">{formatDate(issuer.updatedAt)}</td><td className="px-4 py-3 whitespace-nowrap"><Button variant="outline" size="sm" onClick={() => void edit(issuer)} disabled={saving}>Editar</Button> <Button variant="outline" size="sm" onClick={() => void prepareStatusMutation(issuer)} disabled={saving}>{issuer.isActive ? 'Desactivar' : 'Activar'}</Button></td></tr>)}</tbody></table></section>}
  </div>{formOpen && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4"><form ref={formDialogRef} role="dialog" aria-modal="true" aria-labelledby="fiscal-issuer-form-title" onSubmit={save} className="mx-auto my-6 max-w-4xl rounded-xl bg-white p-6 shadow-xl"><div className="flex justify-between gap-4"><div><h2 id="fiscal-issuer-form-title" className="text-xl font-bold">{editingId ? 'Editar emisor fiscal' : 'Crear emisor fiscal'}</h2><p className="mt-1 text-sm text-slate-600">Los emisores nuevos se crean inactivos. Establecimiento y terminal son necesarios para activarlos.</p></div><button type="button" aria-label="Cerrar" className="text-2xl" onClick={closeForm}>×</button></div><div className="mt-5 grid gap-4 md:grid-cols-2">
  <Field label="Razón social" value={form.legalName} onChange={(v) => set('legalName', v)} required /><Field label="Nombre comercial (opcional)" value={form.commercialName ?? ''} onChange={(v) => set('commercialName', v)} /><label className="grid gap-1 text-sm font-medium">Tipo de identificación<select value={form.identificationTypeCode} onChange={(e) => set('identificationTypeCode', e.target.value)} className="rounded-md border px-3 py-2"><option value="01">01 — Cédula física</option><option value="02">02 — Cédula jurídica</option><option value="03">03 — DIMEX</option><option value="04">04 — NITE</option></select></label><Field label="Número de identificación" value={form.identificationNumber} onChange={(v) => set('identificationNumber', v)} required maxLength={30} /><Field label="País (código de 2 letras)" value={form.countryCode} onChange={(v) => set('countryCode', v)} required maxLength={2} /><Field label="Correo electrónico" type="email" value={form.email} onChange={(v) => set('email', v)} required /><Field label="Código telefónico" value={form.phoneCountryCode ?? ''} onChange={(v) => set('phoneCountryCode', v)} maxLength={4} /><Field label="Teléfono" value={form.phoneNumber ?? ''} onChange={(v) => set('phoneNumber', v)} maxLength={20} />{form.countryCode.trim().toUpperCase() === 'CR' ? <TerritorialCascadeSelect countryCode="CR" provinceCode={form.provinceCode} cantonCode={form.cantonCode} districtCode={form.districtCode} onProvinceCodeChange={(value) => set('provinceCode', value)} onCantonCodeChange={(value) => set('cantonCode', value)} onDistrictCodeChange={(value) => set('districtCode', value)} onValidityChange={setTerritorialSelectionValid} disabled={saving} /> : <><Field label="Código oficial de provincia" value={form.provinceCode} onChange={(v) => set('provinceCode', v)} required maxLength={2} inputMode="numeric" /><Field label="Código oficial de cantón (ej. 01)" value={form.cantonCode} onChange={(v) => set('cantonCode', v)} required maxLength={2} inputMode="numeric" /><Field label="Código oficial de distrito (ej. 01)" value={form.districtCode} onChange={(v) => set('districtCode', v)} required maxLength={2} inputMode="numeric" /></>}<Field label="Otras señas" value={form.otherAddressDetails} onChange={(v) => set('otherAddressDetails', v)} required /><Field label="Moneda predeterminada para documentos nuevos sin fuente" value={form.defaultCurrencyCode ?? ''} onChange={(v) => set('defaultCurrencyCode', v)} maxLength={3} /><Field label="Establecimiento (3 dígitos)" value={form.establishmentCode ?? ''} onChange={(v) => set('establishmentCode', v)} maxLength={3} inputMode="numeric" /><Field label="Terminal (5 dígitos)" value={form.terminalCode ?? ''} onChange={(v) => set('terminalCode', v)} maxLength={5} inputMode="numeric" /></div><div className="mt-6 flex justify-end gap-3"><Button type="button" variant="outline" className="!border-blue-300 !bg-blue-50 !text-blue-700 hover:!bg-blue-100 hover:!text-blue-800 dark:!border-blue-300 dark:!bg-blue-50 dark:!text-blue-700 dark:hover:!bg-blue-100" onClick={closeForm} disabled={saving}>Cancelar</Button><Button type="submit" className="bg-blue-700 text-white hover:bg-blue-800" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button></div></form></div>}
  <ConfirmModal isOpen={Boolean(statusTarget)} title={statusTarget?.isActive ? 'Desactivar emisor fiscal' : 'Activar emisor fiscal'} message={statusTarget?.isActive ? '¿Desea desactivar este emisor? No quedará disponible como emisor activo.' : <span>Solo un emisor puede permanecer activo para la empresa. {issuers.some((issuer) => issuer.isActive && issuer.id !== statusTarget?.id) ? 'Al continuar, este emisor reemplazará al emisor activo actual.' : '¿Desea activar este emisor?'}</span>} confirmText={statusTarget?.isActive ? 'Desactivar' : 'Activar'} confirmVariant={statusTarget?.isActive ? 'warning' : 'primary'} isLoading={saving} onCancel={() => setStatusTarget(null)} onConfirm={() => void mutateStatus()} /></main>;
}

function Field({ label, value, onChange, required, maxLength, inputMode, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; maxLength?: number; inputMode?: 'numeric'; type?: string }) { return <label className="grid gap-1 text-sm font-medium text-slate-700">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} maxLength={maxLength} inputMode={inputMode} className="rounded-md border border-slate-300 px-3 py-2" /></label>; }

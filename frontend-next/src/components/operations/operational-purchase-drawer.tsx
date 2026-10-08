'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { createOperationalPurchase, createStandaloneOperationalPurchase, operationsErrorMessage, uploadOperationalEvidence, uploadStandaloneOperationalEvidence, type CreateOperationalPurchaseInput, type OperationalRequirementDetail, type StandaloneOperationalRequirementDetail } from '@/lib/operations-api';
import { tenantDateTimeInputToUtc } from '@/shared/regional';
import { useTenantRegional } from '@/shared/regional/tenant-regional-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/patterns/form-field';
import { FormSheet } from '@/components/patterns/form-sheet';

const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const maxEvidenceBytes = 10 * 1024 * 1024;

type PurchaseForm = { providerName: string; supplierReference: string; amount: string; currency: string; taxAmount: string; purchasedAt: string; supplierInvoiceNumber: string; notes: string };
type ResolvedFulfillment = { id: string; created: boolean };
const emptyPurchase = (currency = ''): PurchaseForm => ({ providerName: '', supplierReference: '', amount: '', currency, taxAmount: '', purchasedAt: '', supplierInvoiceNumber: '', notes: '' });

export function OperationalPurchaseDrawer({ open, travelPackageId, requirementId, fulfillmentId, ensureFulfillment, providerName, soldValue, onOpenChange, onCreated }: { open: boolean; travelPackageId?: string | null; requirementId: string; fulfillmentId?: string | null; ensureFulfillment?: () => Promise<ResolvedFulfillment>; providerName?: string | null; soldValue?: OperationalRequirementDetail['soldValue'] | StandaloneOperationalRequirementDetail['soldValue']; onOpenChange: (open: boolean) => void; onCreated: (result: { evidenceUploadFailed: boolean }) => Promise<void> | void }) {
  const { timeZone, preferredCurrency } = useTenantRegional();
  const [form, setForm] = useState<PurchaseForm>(emptyPurchase());
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exactSoldValue = soldValue?.scope === 'EXACT_SERVICE_LINE' && soldValue.amount && soldValue.currency ? `${soldValue.currency} ${soldValue.amount}` : null;

  useEffect(() => {
    if (open) {
      setForm({ ...emptyPurchase(preferredCurrency), providerName: providerName ?? '' });
      setEvidenceFile(null);
      setError(null);
    }
  }, [open, fulfillmentId, preferredCurrency, providerName]);

  async function savePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const validation = validatePurchase(form);
    if (validation) { setError(validation); return; }
    setSaving(true);
    let createdFulfillment = false;
    try {
      const input = purchaseInput(form, timeZone);
      const resolvedFulfillment = fulfillmentId ? { id: fulfillmentId, created: false } : await ensureFulfillment?.();
      if (!resolvedFulfillment) throw new Error('OPERATIONAL_FULFILLMENT_REQUIRED');
      createdFulfillment = resolvedFulfillment.created;
      const effectiveFulfillmentId = resolvedFulfillment.id;
      const purchase = travelPackageId
        ? await createOperationalPurchase(travelPackageId, requirementId, effectiveFulfillmentId, input)
        : await createStandaloneOperationalPurchase(requirementId, effectiveFulfillmentId, input);
      let evidenceUploadFailed = false;
      if (evidenceFile) {
        try {
          if (travelPackageId) await uploadOperationalEvidence(travelPackageId, requirementId, effectiveFulfillmentId, { evidenceType: 'OTHER', operationalPurchaseId: purchase.id, file: evidenceFile });
          else await uploadStandaloneOperationalEvidence(requirementId, effectiveFulfillmentId, { evidenceType: 'OTHER', operationalPurchaseId: purchase.id, file: evidenceFile });
        } catch {
          evidenceUploadFailed = true;
        }
      }
      onOpenChange(false);
      await onCreated({ evidenceUploadFailed });
    } catch (reason) {
      setError(createdFulfillment ? 'La gestión se creó, pero no se pudo registrar la compra. Inténtelo de nuevo; se reutilizará esta gestión.' : message(reason, 'No se pudo registrar la compra.'));
    } finally {
      setSaving(false);
    }
  }

  return <FormSheet open={open} onOpenChange={(nextOpen) => !nextOpen && !saving && onOpenChange(false)} title="Registrar compra" description="La autorización financiera se valida en el backend al registrar la compra." contentClassName="space-y-4" actions={<><Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" form="operational-purchase-form" disabled={saving}>{saving ? 'Registrando...' : 'Registrar compra'}</Button></>}>
    <form id="operational-purchase-form" className="grid gap-4" onSubmit={savePurchase}>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {exactSoldValue ? <p className="text-sm"><span className="text-muted-foreground">Vendido:</span> {exactSoldValue}</p> : null}
      <FormField htmlFor="purchase-provider" label="Proveedor" required><Input id="purchase-provider" value={form.providerName} onChange={(event) => setForm((value) => ({ ...value, providerName: event.target.value }))} required maxLength={500} /></FormField>
      <FormField htmlFor="purchase-provider-reference" label="Referencia del proveedor"><Input id="purchase-provider-reference" value={form.supplierReference} onChange={(event) => setForm((value) => ({ ...value, supplierReference: event.target.value }))} maxLength={500} /></FormField>
      <div className="grid gap-3 sm:grid-cols-3"><FormField htmlFor="purchase-amount" label="Monto" required><Input id="purchase-amount" inputMode="decimal" value={form.amount} onChange={(event) => setForm((value) => ({ ...value, amount: event.target.value }))} required /></FormField><FormField htmlFor="purchase-currency" label="Moneda" required><Select id="purchase-currency" value={form.currency} onChange={(event) => setForm((value) => ({ ...value, currency: event.target.value }))} required><option value={preferredCurrency}>{preferredCurrency}</option>{preferredCurrency !== 'USD' ? <option value="USD">USD</option> : null}</Select></FormField><FormField htmlFor="purchase-tax" label="Impuesto"><Input id="purchase-tax" inputMode="decimal" value={form.taxAmount} onChange={(event) => setForm((value) => ({ ...value, taxAmount: event.target.value }))} /></FormField></div>
      <FormField htmlFor="purchase-date" label="Fecha de compra" required><Input id="purchase-date" type="datetime-local" value={form.purchasedAt} onChange={(event) => setForm((value) => ({ ...value, purchasedAt: event.target.value }))} required /></FormField>
      <FormField htmlFor="purchase-invoice" label="Número de factura del proveedor"><Input id="purchase-invoice" value={form.supplierInvoiceNumber} onChange={(event) => setForm((value) => ({ ...value, supplierInvoiceNumber: event.target.value }))} maxLength={191} /></FormField>
      <FormField htmlFor="purchase-evidence" label="Documento de respaldo (opcional)"><Input id="purchase-evidence" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; const fileError = file ? validateFile(file) : null; if (fileError) { setEvidenceFile(null); setError(fileError); return; } setEvidenceFile(file); }} /></FormField>
      <FormField htmlFor="purchase-notes" label="Notas"><Textarea id="purchase-notes" value={form.notes} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} maxLength={4000} /></FormField>
    </form>
  </FormSheet>;
}

function purchaseInput(form: PurchaseForm, timeZone: string): CreateOperationalPurchaseInput { return { providerName: form.providerName.trim(), supplierReference: textOrNull(form.supplierReference), amount: form.amount.trim(), currency: form.currency.trim().toUpperCase(), taxAmount: form.taxAmount.trim() || null, purchasedAt: tenantDateTimeInputToUtc(form.purchasedAt, timeZone)!, supplierInvoiceNumber: textOrNull(form.supplierInvoiceNumber), notes: textOrNull(form.notes) }; }
function validatePurchase(form: PurchaseForm) { if (!form.providerName.trim()) return 'Indique el proveedor.'; if (!isMoney(form.amount) || !isPositiveMoney(form.amount)) return 'El monto debe ser un decimal mayor que cero, con hasta cinco decimales.'; if (form.taxAmount.trim() && !isMoney(form.taxAmount)) return 'El impuesto debe ser un decimal igual o mayor que cero, con hasta cinco decimales.'; if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) return 'La moneda debe tener tres letras.'; if (!form.purchasedAt) return 'Indique la fecha de compra.'; return null; }
function isMoney(value: string) { return /^\d+(?:\.\d{1,5})?$/.test(value.trim()); }
function isPositiveMoney(value: string) { return value.replace(/[.0]/g, '').length > 0; }
function textOrNull(value: string) { return value.trim() || null; }
function validateFile(file: File) { if (file.size < 1) return 'El archivo está vacío.'; if (!allowedMimeTypes.has(file.type)) return 'Solo se permiten archivos PDF, JPEG, PNG o WebP.'; if (file.size > maxEvidenceBytes) return 'El archivo no puede superar 10 MiB.'; return null; }
function message(reason: unknown, fallback: string) { const value = reason instanceof Error ? reason.message : ''; if (value.includes('FINANCIAL_ELIGIBILITY_BLOCKED')) return 'Esta compra no puede registrarse porque la fuente comercial aún no está habilitada financieramente.'; if (value.includes('FINANCIAL_ELIGIBILITY_UNAVAILABLE')) return 'No existe información financiera suficiente para autorizar esta compra.'; if (value.includes('FULFILLMENT_CANCELLED')) return 'La gestión está cancelada y no admite nuevas compras.'; return operationsErrorMessage(reason, fallback); }

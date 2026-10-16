'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/patterns/form-field';
import { CustomerSearchSelector } from '@/features/customers/components/CustomerSearchSelector';
import { LeadQuickCreateModal } from '@/features/leads/components/LeadQuickCreateModal';
import type { Lead } from '@/lib/leads-api';
import type { CustomerListItem } from '@/lib/customers-api';
import type { CustomQuotation, CustomQuotationInput } from '@/lib/custom-quotations-api';
import { hasExactlyOneQuotationTarget } from '@/features/custom-quotations/custom-quotation-presentation';

type TargetMode = 'LEAD' | 'CUSTOMER';
type Props = { isOpen: boolean; onClose: () => void; quotation?: CustomQuotation; initialLead?: Lead | null; onSubmit: (input: CustomQuotationInput) => Promise<void> };
type FormValues = { currency: 'USD' | 'CRC'; title: string; commercialObservations: string; quotationValidUntil: string; paymentConditionType: '' | 'CASH' | 'CREDIT'; paymentTermValue: string };

const emptyForm: FormValues = { currency: 'USD', title: '', commercialObservations: '', quotationValidUntil: '', paymentConditionType: '', paymentTermValue: '' };

export function CustomQuotationEditorDialog({ isOpen, onClose, quotation, initialLead, onSubmit }: Props) {
  const [mode, setMode] = useState<TargetMode | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [customer, setCustomer] = useState<CustomerListItem | null>(null);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const target = quotation?.target;
    const startsCustomer = target?.type === 'CUSTOMER';
    const selectedLead = target?.type === 'LEAD'
      ? { id: target.id, fullName: target.displayName, email: target.email ?? '', phone: target.phone, companyName: target.companyName, status: 'OPEN' as const, convertedCustomerId: null, convertedAt: null, createdAt: '', updatedAt: '' }
      : (!quotation ? initialLead ?? null : null);
    setMode(startsCustomer ? 'CUSTOMER' : selectedLead ? 'LEAD' : null);
    setLead(selectedLead);
    setCustomer(target?.type === 'CUSTOMER' ? { id: target.id, fullName: target.displayName, idNumber: '—', email: target.email, phone: target.phone, createdAt: '' } : null);
    setForm(quotation ? { currency: quotation.currency, title: quotation.title, commercialObservations: quotation.commercialObservations ?? '', quotationValidUntil: quotation.quotationValidUntil?.slice(0, 10) ?? '', paymentConditionType: quotation.paymentConditionType ?? '', paymentTermValue: quotation.paymentTermValue?.toString() ?? '' } : emptyForm);
    setShowQuickCreate(false);
    setError(null);
  }, [initialLead, isOpen, quotation]);

  function chooseMode(next: TargetMode) {
    if (next === mode) {
      if (next === 'LEAD' && !lead) setShowQuickCreate(true);
      return;
    }
    setMode(next);
    setLead(null);
    setCustomer(null);
    setShowQuickCreate(next === 'LEAD');
    setError(null);
  }

  function setField<Key extends keyof FormValues>(key: Key, value: FormValues[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setPaymentCondition(paymentConditionType: FormValues['paymentConditionType']) {
    setForm((current) => ({ ...current, paymentConditionType, ...(paymentConditionType === 'CREDIT' ? {} : { paymentTermValue: '' }) }));
  }

  async function submit() {
    const leadId = mode === 'LEAD' ? lead?.id ?? null : null;
    const customerId = mode === 'CUSTOMER' ? customer?.id ?? null : null;
    if (!hasExactlyOneQuotationTarget(leadId, customerId)) { setError('Seleccione un prospecto o un cliente para la cotización.'); return; }
    if (!form.title.trim()) { setError('El nombre de la cotización es requerido.'); return; }
    if (form.paymentConditionType === 'CREDIT' && (!/^\d+$/.test(form.paymentTermValue) || Number(form.paymentTermValue) < 1)) { setError('Indique una cantidad de días válida.'); return; }
    setSaving(true); setError(null);
    try {
      await onSubmit({ ...(leadId ? { leadId } : { customerId: customerId! }), currency: form.currency, title: form.title.trim(), commercialObservations: form.commercialObservations.trim() || null, quotationValidUntil: form.quotationValidUntil || null, paymentConditionType: form.paymentConditionType || null, ...(form.paymentConditionType === 'CREDIT' ? { paymentTermValue: Number(form.paymentTermValue), paymentTermUnit: 'DAYS' } : {}) });
      onClose();
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'No se pudo guardar la cotización.'); }
    finally { setSaving(false); }
  }

  return <><Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{quotation ? 'Editar cotización' : 'Nueva cotización'}</DialogTitle><DialogDescription>Defina el destinatario y los datos comerciales del borrador.</DialogDescription></DialogHeader><div className="grid gap-5 py-2">
    {error ? <Alert variant="destructive"><AlertTitle>No se pudo guardar la cotización</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <section className="space-y-3"><h3 className="text-sm font-semibold">¿Para quién es la cotización?</h3><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={mode === 'LEAD' ? 'default' : 'outline'} onClick={() => chooseMode('LEAD')} disabled={saving}>Prospecto</Button><Button type="button" size="sm" variant={mode === 'CUSTOMER' ? 'default' : 'outline'} onClick={() => chooseMode('CUSTOMER')} disabled={saving}>Cliente existente</Button></div>
      {mode === 'LEAD' ? lead ? <SelectedRecipientSummary label="Prospecto seleccionado" fullName={lead.fullName} details={[lead.email, lead.phone, lead.companyName]} onChange={() => { setLead(null); setShowQuickCreate(true); }} disabled={saving} /> : <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">Cree un prospecto para continuar con la cotización.</p> : mode === 'CUSTOMER' ? customer ? <SelectedRecipientSummary label="Cliente seleccionado" fullName={customer.fullName} details={[customer.idNumber ? `ID ${customer.idNumber}` : null, customer.email, customer.phone]} onChange={() => setCustomer(null)} disabled={saving} /> : <div className="rounded-lg border border-border p-4"><CustomerSearchSelector selectedCustomer={null} onSelect={setCustomer} onClear={() => setCustomer(null)} description="Busque un cliente existente por identificación." /></div> : <p className="text-sm text-muted-foreground">Seleccione el destinatario de la cotización.</p>}</section>
    <div className="grid gap-4 sm:grid-cols-2"><FormField label="Nombre de la cotización" htmlFor="quotation-title" required className="sm:col-span-2"><Input id="quotation-title" value={form.title} onChange={(event) => setField('title', event.target.value)} disabled={saving} /></FormField><FormField label="Moneda" htmlFor="quotation-currency" required><Select id="quotation-currency" value={form.currency} onChange={(event) => setField('currency', event.target.value as FormValues['currency'])} disabled={saving}><option value="USD">USD</option><option value="CRC">CRC</option></Select></FormField><FormField label="Vigencia" htmlFor="quotation-validity"><Input id="quotation-validity" type="date" value={form.quotationValidUntil} onChange={(event) => setField('quotationValidUntil', event.target.value)} disabled={saving} /></FormField><FormField label="Condición de pago" htmlFor="quotation-payment"><Select id="quotation-payment" value={form.paymentConditionType} onChange={(event) => setPaymentCondition(event.target.value as FormValues['paymentConditionType'])} disabled={saving}><option value="">Sin definir</option><option value="CASH">Contado</option><option value="CREDIT">Crédito</option></Select></FormField>{form.paymentConditionType === 'CREDIT' ? <FormField label="Cantidad de días" htmlFor="quotation-term" required><Input id="quotation-term" inputMode="numeric" value={form.paymentTermValue} onChange={(event) => setField('paymentTermValue', event.target.value)} disabled={saving} /></FormField> : null}<FormField label="Observaciones comerciales" htmlFor="quotation-observations" className="sm:col-span-2"><Textarea id="quotation-observations" value={form.commercialObservations} onChange={(event) => setField('commercialObservations', event.target.value)} disabled={saving} /></FormField></div>
  </div><DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button><Button type="button" onClick={() => void submit()} disabled={saving}>{saving ? <><LoaderCircle className="animate-spin" aria-hidden="true" />Guardando…</> : quotation ? 'Guardar cambios' : 'Crear borrador'}</Button></DialogFooter></DialogContent></Dialog>
  <LeadQuickCreateModal isOpen={showQuickCreate} onClose={() => setShowQuickCreate(false)} onLeadCreated={(created) => { setLead(created); setShowQuickCreate(false); }} /></>;
}

function SelectedRecipientSummary({ label, fullName, details, onChange, disabled }: { label: string; fullName: string; details: Array<string | null | undefined>; onChange: () => void; disabled: boolean }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"><div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 font-medium">{fullName}</p>{details.filter((detail): detail is string => Boolean(detail)).map((detail) => <p key={detail} className="text-sm text-muted-foreground">{detail}</p>)}</div><Button type="button" variant="ghost" size="sm" onClick={onChange} disabled={disabled}>Cambiar</Button></div>;
}

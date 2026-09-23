'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle, Search, UserPlus } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/patterns/form-field';
import { CustomerSearchSelector } from '@/features/customers/components/CustomerSearchSelector';
import { LeadQuickCreateModal } from '@/features/leads/components/LeadQuickCreateModal';
import { getLeads, type Lead } from '@/lib/leads-api';
import type { CustomerListItem } from '@/lib/customers-api';
import type { CustomQuotation, CustomQuotationInput } from '@/lib/custom-quotations-api';
import { hasExactlyOneQuotationTarget } from '@/features/custom-quotations/custom-quotation-presentation';

type TargetMode = 'LEAD' | 'CUSTOMER';
type Props = { isOpen: boolean; onClose: () => void; quotation?: CustomQuotation; onSubmit: (input: CustomQuotationInput) => Promise<void> };
type FormValues = { currency: 'USD' | 'CRC'; title: string; commercialObservations: string; quotationValidUntil: string; paymentConditionType: '' | 'CASH' | 'CREDIT'; paymentTermValue: string; paymentTermUnit: 'DAYS' | 'MONTHS' };

const emptyForm: FormValues = { currency: 'USD', title: '', commercialObservations: '', quotationValidUntil: '', paymentConditionType: '', paymentTermValue: '', paymentTermUnit: 'DAYS' };

export function CustomQuotationEditorDialog({ isOpen, onClose, quotation, onSubmit }: Props) {
  const [mode, setMode] = useState<TargetMode>('LEAD');
  const [lead, setLead] = useState<Lead | null>(null);
  const [customer, setCustomer] = useState<CustomerListItem | null>(null);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadResults, setLeadResults] = useState<Lead[]>([]);
  const [searchingLeads, setSearchingLeads] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const target = quotation?.target;
    const startsCustomer = target?.type === 'CUSTOMER';
    setMode(startsCustomer ? 'CUSTOMER' : 'LEAD');
    setLead(target?.type === 'LEAD' ? { id: target.id, fullName: target.displayName, email: target.email ?? '', phone: target.phone, companyName: target.companyName, status: 'OPEN', convertedCustomerId: null, convertedAt: null, createdAt: '', updatedAt: '' } : null);
    setCustomer(target?.type === 'CUSTOMER' ? { id: target.id, fullName: target.displayName, idNumber: '—', email: target.email, phone: target.phone, createdAt: '' } : null);
    setForm(quotation ? { currency: quotation.currency, title: quotation.title, commercialObservations: quotation.commercialObservations ?? '', quotationValidUntil: quotation.quotationValidUntil?.slice(0, 10) ?? '', paymentConditionType: quotation.paymentConditionType ?? '', paymentTermValue: quotation.paymentTermValue?.toString() ?? '', paymentTermUnit: quotation.paymentTermUnit ?? 'DAYS' } : emptyForm);
    setLeadResults([]); setLeadSearch(''); setError(null);
  }, [isOpen, quotation]);

  async function searchLeads() {
    setSearchingLeads(true); setError(null);
    try { setLeadResults((await getLeads({ status: 'OPEN', search: leadSearch || undefined, pageSize: 20 })).items); }
    catch { setError('No se pudieron buscar los prospectos.'); }
    finally { setSearchingLeads(false); }
  }

  function chooseMode(next: TargetMode) { setMode(next); setLead(null); setCustomer(null); setError(null); }
  function setField<Key extends keyof FormValues>(key: Key, value: FormValues[Key]) { setForm((current) => ({ ...current, [key]: value })); }

  async function submit() {
    const leadId = mode === 'LEAD' ? lead?.id ?? null : null;
    const customerId = mode === 'CUSTOMER' ? customer?.id ?? null : null;
    if (!hasExactlyOneQuotationTarget(leadId, customerId)) { setError('Seleccione un prospecto o un cliente para la cotización.'); return; }
    if (!form.title.trim()) { setError('El título es requerido.'); return; }
    if (form.paymentConditionType === 'CREDIT' && (!/^\d+$/.test(form.paymentTermValue) || Number(form.paymentTermValue) < 1)) { setError('Indique un plazo de crédito válido.'); return; }
    setSaving(true); setError(null);
    try {
      await onSubmit({ ...(leadId ? { leadId } : { customerId: customerId! }), currency: form.currency, title: form.title.trim(), commercialObservations: form.commercialObservations.trim() || null, quotationValidUntil: form.quotationValidUntil || null, paymentConditionType: form.paymentConditionType || null, ...(form.paymentConditionType === 'CREDIT' ? { paymentTermValue: Number(form.paymentTermValue), paymentTermUnit: form.paymentTermUnit } : {}) });
      onClose();
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'No se pudo guardar la cotización.'); }
    finally { setSaving(false); }
  }

  return <><Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{quotation ? 'Editar cotización' : 'Nueva cotización'}</DialogTitle><DialogDescription>Defina el destinatario y los datos comerciales del borrador.</DialogDescription></DialogHeader><div className="grid gap-5 py-2">
    {error ? <Alert variant="destructive"><AlertTitle>No se pudo guardar la cotización</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <section className="space-y-3"><h3 className="text-sm font-semibold">¿Para quién es la cotización?</h3><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={mode === 'LEAD' ? 'default' : 'outline'} onClick={() => chooseMode('LEAD')} disabled={saving}>Prospecto</Button><Button type="button" size="sm" variant={mode === 'CUSTOMER' ? 'default' : 'outline'} onClick={() => chooseMode('CUSTOMER')} disabled={saving}>Cliente existente</Button></div>
      {mode === 'LEAD' ? <div className="rounded-lg border border-border p-4"><div className="flex gap-2"><Input value={leadSearch} onChange={(event) => setLeadSearch(event.target.value)} placeholder="Buscar prospecto" disabled={searchingLeads || saving} /><Button type="button" variant="outline" onClick={() => void searchLeads()} disabled={searchingLeads || saving}>{searchingLeads ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}Buscar</Button><Button type="button" variant="outline" onClick={() => setShowQuickCreate(true)} disabled={saving}><UserPlus aria-hidden="true" />Crear prospecto</Button></div>
        {lead ? <p className="mt-3 rounded-md bg-muted p-3 text-sm"><strong>Prospecto seleccionado:</strong> {lead.fullName} · {lead.email}<Button type="button" variant="ghost" size="sm" className="ml-2" onClick={() => setLead(null)}>Cambiar</Button></p> : null}
        {leadResults.length > 0 && !lead ? <div className="mt-3 grid gap-2">{leadResults.map((item) => <Button key={item.id} type="button" variant="outline" className="h-auto justify-start px-3 py-2 text-left" onClick={() => { setLead(item); setLeadResults([]); }}><span><strong>{item.fullName}</strong><br /><span className="text-xs text-muted-foreground">{item.email}{item.companyName ? ` · ${item.companyName}` : ''}</span></span></Button>)}</div> : null}</div> :
      <div className="rounded-lg border border-border p-4"><CustomerSearchSelector selectedCustomer={customer} onSelect={setCustomer} onClear={() => setCustomer(null)} description="Busque un cliente existente por identificación." /></div>}</section>
    <div className="grid gap-4 sm:grid-cols-2"><FormField label="Título o asunto" htmlFor="quotation-title" required className="sm:col-span-2"><Input id="quotation-title" value={form.title} onChange={(event) => setField('title', event.target.value)} disabled={saving} /></FormField><FormField label="Moneda" htmlFor="quotation-currency" required><Select id="quotation-currency" value={form.currency} onChange={(event) => setField('currency', event.target.value as FormValues['currency'])} disabled={saving}><option value="USD">USD</option><option value="CRC">CRC</option></Select></FormField><FormField label="Vigencia" htmlFor="quotation-validity"><Input id="quotation-validity" type="date" value={form.quotationValidUntil} onChange={(event) => setField('quotationValidUntil', event.target.value)} disabled={saving} /></FormField><FormField label="Condición de pago" htmlFor="quotation-payment"><Select id="quotation-payment" value={form.paymentConditionType} onChange={(event) => setField('paymentConditionType', event.target.value as FormValues['paymentConditionType'])} disabled={saving}><option value="">Sin definir</option><option value="CASH">Contado</option><option value="CREDIT">Crédito</option></Select></FormField>{form.paymentConditionType === 'CREDIT' ? <><FormField label="Plazo" htmlFor="quotation-term" required><Input id="quotation-term" inputMode="numeric" value={form.paymentTermValue} onChange={(event) => setField('paymentTermValue', event.target.value)} disabled={saving} /></FormField><FormField label="Unidad" htmlFor="quotation-term-unit" required><Select id="quotation-term-unit" value={form.paymentTermUnit} onChange={(event) => setField('paymentTermUnit', event.target.value as 'DAYS' | 'MONTHS')} disabled={saving}><option value="DAYS">Días</option><option value="MONTHS">Meses</option></Select></FormField></> : null}<FormField label="Observaciones comerciales" htmlFor="quotation-observations" className="sm:col-span-2"><Textarea id="quotation-observations" value={form.commercialObservations} onChange={(event) => setField('commercialObservations', event.target.value)} disabled={saving} /></FormField></div>
  </div><DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button><Button type="button" onClick={() => void submit()} disabled={saving}>{saving ? <><LoaderCircle className="animate-spin" aria-hidden="true" />Guardando…</> : quotation ? 'Guardar cambios' : 'Crear borrador'}</Button></DialogFooter></DialogContent></Dialog>
  <LeadQuickCreateModal isOpen={showQuickCreate} onClose={() => setShowQuickCreate(false)} onLeadCreated={(created) => { setLead(created); setShowQuickCreate(false); }} /></>;
}

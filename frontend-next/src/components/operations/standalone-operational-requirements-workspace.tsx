'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import { ClipboardList, FileText, Loader2, ShoppingCart } from 'lucide-react';
import {
  createStandaloneOperationalFulfillment,
  getStandaloneOperationalEvidenceAccess,
  getStandaloneOperationalRequirement,
  listStandaloneOperationalFulfillments,
  listCustomQuotationOperationsHistory,
  listCustomQuotationOperationsGroups,
  operationsErrorMessage,
  type OperationalRequirementStatus,
  transitionStandaloneOperationalFulfillment,
  updateStandaloneOperationalFulfillment,
  type OperationalFulfillmentStatus,
  type CustomQuotationFinanceEligibilityStatus,
  type CustomQuotationHistoryDatePreset,
  type CustomQuotationOperationsGroup,
  type CustomQuotationOperationsHistoryRow,
  type StandaloneOperationalFulfillmentSummary,
  type StandaloneOperationalRequirementDetail,
} from '@/lib/operations-api';
import { OperationalPurchaseDrawer } from '@/components/operations/operational-purchase-drawer';
import AttachmentViewer, { type Attachment } from '@/components/attachment-viewer';
import { formatFinanceMoneyDisplay } from '@/lib/finance-money-display';
import { useTenantDateTimeFormatter } from '@/shared/regional/tenant-regional-provider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const requirementLabels = { PENDING: 'Pendiente', IN_PROGRESS: 'En curso', FULFILLED: 'Completado', CANCELLED: 'Cancelado', NOT_APPLICABLE: 'No aplica' } as const;
const groupLabels = { PENDING: 'Pendiente', IN_PROGRESS: 'En curso', COMPLETED: 'Completada', CANCELLED: 'Cancelada', NOT_APPLICABLE: 'No aplica' } as const;
const fulfillmentLabels: Record<OperationalFulfillmentStatus, string> = { DRAFT: 'Preparando', RESERVED: 'Reservado', PURCHASED: 'Comprado', CONFIRMED: 'Confirmado', CANCELLED: 'Cancelado' };
const financeEligibilityLabels: Record<CustomQuotationFinanceEligibilityStatus, string> = {
  PENDIENTE_FACTURACION: 'Pendiente de facturación',
  PENDIENTE_ACEPTACION_FISCAL: 'Pendiente de aceptación fiscal',
  PENDIENTE_REGISTRO_FINANCIERO: 'Pendiente de registro financiero',
  PENDIENTE_PAGO: 'Pendiente de pago',
  LISTO_PARA_PROCESAR: 'Listo para procesar',
};
const financeEligibilityMessages: Record<CustomQuotationFinanceEligibilityStatus, string> = {
  PENDIENTE_FACTURACION: 'Este servicio requiere un documento fiscal antes de poder procesarse.',
  PENDIENTE_ACEPTACION_FISCAL: 'Este servicio podrá procesarse cuando el documento fiscal sea aceptado.',
  PENDIENTE_REGISTRO_FINANCIERO: 'La factura está aceptada, pero aún no tiene el registro financiero requerido.',
  PENDIENTE_PAGO: 'Este servicio podrá procesarse cuando el saldo esté cancelado.',
  LISTO_PARA_PROCESAR: 'Este servicio puede procesarse.',
};

function sourceLabel(sourceType: string | null) {
  if (sourceType === 'CUSTOM_QUOTATION_LINE') return 'Cotización personalizada';
  if (sourceType === 'MANUAL') return 'Manual';
  return sourceType?.replaceAll('_', ' ') ?? 'Sin referencia';
}
function statusVariant(status: string) {
  if (status === 'CANCELLED' || status === 'NOT_APPLICABLE') return 'destructive' as const;
  if (status === 'CONFIRMED' || status === 'FULFILLED' || status === 'PURCHASED') return 'success' as const;
  if (status === 'RESERVED' || status === 'IN_PROGRESS') return 'warning' as const;
  return 'secondary' as const;
}
function financeEligibilityVariant(status: CustomQuotationFinanceEligibilityStatus) {
  return status === 'LISTO_PARA_PROCESAR' ? 'success' as const : status === 'PENDIENTE_PAGO' ? 'warning' as const : 'secondary' as const;
}
function money(amount: string | null, currency: string | null) { return amount && currency ? formatFinanceMoneyDisplay(amount, currency) : 'No disponible'; }
function errorMessage(error: unknown, fallback: string) { return operationsErrorMessage(error, fallback); }
function confirmationErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.includes('OPERATIONAL_FULFILLMENT_CONFIRMATION_CONTEXT_REQUIRED')) return 'Ingrese una referencia de confirmación antes de confirmar la gestión.';
  return errorMessage(error, 'No se pudo confirmar la gestión.');
}
function fiscalDocumentTypeLabel(type: string | null) {
  if (type === '01') return 'Factura';
  if (type === '04') return 'Tiquete';
  return 'Documento fiscal';
}
function fiscalDocumentReference(group: CustomQuotationOperationsGroup) {
  if (!group.billingDocumentId) return 'Sin factura emitida';
  return `${fiscalDocumentTypeLabel(group.billingDocumentType)} ${group.fiscalDocumentNumber ?? 'sin número'}`;
}
function historyStatusLabel(status: CustomQuotationOperationsHistoryRow['finalStatus']) { return status === 'CONFIRMED' ? 'Confirmado' : 'Cancelado'; }

export function StandaloneOperationalRequirementsWorkspace() {
  const formatDateTime = useTenantDateTimeFormatter();
  const [view, setView] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const [items, setItems] = useState<CustomQuotationOperationsGroup[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<CustomQuotationOperationsGroup | null>(null);

  async function load(nextPage = page) {
    setLoading(true); setError(null);
    try { const response = await listCustomQuotationOperationsGroups({ page: nextPage, search: search || undefined }); setItems(response.items); setPagination({ total: response.total, totalPages: response.totalPages }); }
    catch (reason) { setError(errorMessage(reason, 'No se pudieron cargar las cotizaciones personalizadas.')); }
    finally { setLoading(false); }
  }
  async function refreshSelectedGroup(sourceId: string) {
    try {
      const response = await listCustomQuotationOperationsGroups({ page, search: search || undefined });
      setItems(response.items); setPagination({ total: response.total, totalPages: response.totalPages });
      setSelectedGroup((current) => current?.sourceId === sourceId ? response.items.find((item) => item.sourceId === sourceId) ?? current : current);
    } catch (reason) { setError(errorMessage(reason, 'No se pudo actualizar la cotización personalizada.')); }
  }
  useEffect(() => { void load(); }, []);

  return <main className="app-shell p-5"><div className="mx-auto max-w-7xl space-y-5">
    <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-primary">Operaciones</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Cotizaciones personalizadas</h1><p className="mt-1 text-sm text-muted-foreground">Trabajo operativo de clientes que no pertenece a un viaje.</p></div>{view === 'ACTIVE' ? <Button type="button" variant="outline" onClick={() => void load()}>Actualizar</Button> : null}</section>
    <div className="flex gap-2 border-b"><Button type="button" variant={view === 'ACTIVE' ? 'default' : 'ghost'} onClick={() => { setView('ACTIVE'); setSelectedGroup(null); }}>Activas</Button><Button type="button" variant={view === 'HISTORY' ? 'default' : 'ghost'} onClick={() => { setView('HISTORY'); setSelectedGroup(null); }}>Historial</Button></div>
    {view === 'ACTIVE' ? <>
      <Card><CardContent className="grid gap-3 py-4 md:grid-cols-[1fr_auto]"><Input aria-label="Buscar cotizaciones personalizadas" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente o servicio" /><Button type="button" onClick={() => { setPage(1); void load(1); }}>Buscar</Button></CardContent></Card>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList aria-hidden="true" size={20} /> Cola operativa</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Identificación</TableHead><TableHead>Documento fiscal</TableHead><TableHead>Cantidad de servicios</TableHead><TableHead>Valor total</TableHead><TableHead>Estado</TableHead><TableHead>Ingreso</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Cargando cotizaciones...</TableCell></TableRow> : items.length === 0 ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No hay cotizaciones personalizadas para los filtros seleccionados.</TableCell></TableRow> : items.map((item) => <TableRow key={item.sourceId} className="cursor-pointer hover:bg-muted/50" role="button" tabIndex={0} onClick={() => setSelectedGroup(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedGroup(item); } }}><TableCell className="font-medium">{item.customer?.fullName ?? 'Cliente no disponible'}</TableCell><TableCell>{identification(item.customer)}</TableCell><TableCell><p>{fiscalDocumentReference(item)}</p>{item.quotationNumber ? <p className="text-xs text-muted-foreground">Cotización #{item.quotationNumber}</p> : null}</TableCell><TableCell>{item.serviceCount}</TableCell><TableCell>{money(item.commercialValue.amount, item.commercialValue.currency)}</TableCell><TableCell><Badge variant={statusVariant(item.status)}>{groupLabels[item.status]}</Badge></TableCell><TableCell className="text-sm text-muted-foreground">{formatDateTime(item.createdAt)}</TableCell></TableRow>)}</TableBody></Table>{pagination.totalPages > 1 ? <div className="flex items-center justify-between border-t px-4 py-3 text-sm"><span className="text-muted-foreground">{pagination.total} cotizaciones</span><div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => { const next = page - 1; setPage(next); void load(next); }}>Anterior</Button><span>Página {page} de {pagination.totalPages}</span><Button type="button" size="sm" variant="outline" disabled={page >= pagination.totalPages} onClick={() => { const next = page + 1; setPage(next); void load(next); }}>Siguiente</Button></div></div> : null}</CardContent></Card>
    </> : <CustomQuotationHistory />}
  </div>{view === 'ACTIVE' && selectedGroup ? <CustomQuotationGroupDetail group={selectedGroup} onClose={() => setSelectedGroup(null)} onChanged={() => refreshSelectedGroup(selectedGroup.sourceId)} /> : null}</main>;
}

function CustomQuotationHistory() {
  const formatDateTime = useTenantDateTimeFormatter();
  const [items, setItems] = useState<CustomQuotationOperationsHistoryRow[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [datePreset, setDatePreset] = useState<CustomQuotationHistoryDatePreset | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<CustomQuotationOperationsHistoryRow | null>(null);

  async function load(nextPage = page) {
    setLoading(true); setError(null);
    try {
      const response = await listCustomQuotationOperationsHistory({
        page: nextPage,
        search: search || undefined,
        datePreset: datePreset || undefined,
        dateFrom: datePreset === 'CUSTOM' ? dateFrom || undefined : undefined,
        dateTo: datePreset === 'CUSTOM' ? dateTo || undefined : undefined,
      });
      setItems(response.items); setPagination({ total: response.total, totalPages: response.totalPages });
    } catch (reason) { setError(errorMessage(reason, 'No se pudo cargar el historial de compras.')); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  return <section className="space-y-4"><Card><CardContent className="grid gap-3 py-4 md:grid-cols-4"><Input aria-label="Buscar en historial" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, identificación, correo o factura" /><Select aria-label="Fecha de finalización" value={datePreset} onChange={(event) => setDatePreset(event.target.value as CustomQuotationHistoryDatePreset | '')}><option value="">Todas las fechas</option><option value="TODAY">Hoy</option><option value="LAST_7_DAYS">Últimos 7 días</option><option value="LAST_15_DAYS">Últimos 15 días</option><option value="LAST_MONTH">Último mes</option><option value="CUSTOM">Personalizado</option></Select>{datePreset === 'CUSTOM' ? <><Input aria-label="Desde" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /><Input aria-label="Hasta" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></> : null}<Button type="button" onClick={() => { setPage(1); void load(1); }}>Buscar</Button></CardContent></Card>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList aria-hidden="true" size={20} /> Historial de compras</CardTitle><p className="text-sm text-muted-foreground">Solo servicios finalizados; la fecha corresponde a la confirmación o cancelación registrada.</p></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Identificación</TableHead><TableHead>Correo</TableHead><TableHead>Documento fiscal</TableHead><TableHead>Servicio</TableHead><TableHead>Proveedor</TableHead><TableHead>Monto</TableHead><TableHead>Fecha</TableHead><TableHead>Estado</TableHead><TableHead><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">Cargando historial...</TableCell></TableRow> : items.length === 0 ? <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">No hay compras finalizadas para los filtros seleccionados.</TableCell></TableRow> : items.map((item) => <TableRow key={item.fulfillmentId}><TableCell className="font-medium">{item.customer?.fullName ?? 'Cliente no disponible'}</TableCell><TableCell>{identification(item.customer)}</TableCell><TableCell>{item.customer?.email ?? '—'}</TableCell><TableCell>{item.fiscalDocument ? `${fiscalDocumentTypeLabel(item.fiscalDocument.type)} ${item.fiscalDocument.number ?? 'sin número'}` : 'Sin factura emitida'}</TableCell><TableCell>{item.serviceDescription}</TableCell><TableCell>{item.purchase?.providerName ?? '—'}</TableCell><TableCell>{item.purchase ? money(item.purchase.amount, item.purchase.currency) : '—'}</TableCell><TableCell className="text-sm text-muted-foreground">{formatDateTime(item.finalizedAt)}</TableCell><TableCell><Badge variant={statusVariant(item.finalStatus)}>{historyStatusLabel(item.finalStatus)}</Badge></TableCell><TableCell><Button type="button" size="sm" variant="outline" onClick={() => setSelected(item)}>Ver detalle</Button></TableCell></TableRow>)}</TableBody></Table>{pagination.totalPages > 1 ? <div className="flex items-center justify-between border-t px-4 py-3 text-sm"><span className="text-muted-foreground">{pagination.total} servicios</span><div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => { const next = page - 1; setPage(next); void load(next); }}>Anterior</Button><span>Página {page} de {pagination.totalPages}</span><Button type="button" size="sm" variant="outline" disabled={page >= pagination.totalPages} onClick={() => { const next = page + 1; setPage(next); void load(next); }}>Siguiente</Button></div></div> : null}</CardContent></Card>
    {selected ? <CustomQuotationHistoryDetail item={selected} onClose={() => setSelected(null)} /> : null}
  </section>;
}

function CustomQuotationHistoryDetail({ item, onClose }: { item: CustomQuotationOperationsHistoryRow; onClose: () => void }) {
  const formatDateTime = useTenantDateTimeFormatter();
  const [evidenceViewer, setEvidenceViewer] = useState<Attachment | null>(null);
  async function resolveEvidenceUrl(attachment: Attachment, _signal: AbortSignal) { return (await getStandaloneOperationalEvidenceAccess(item.requirementId, item.fulfillmentId, attachment.id)).url; }
  const purchase = item.purchase;
  return <><Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Detalle histórico de compra</DialogTitle><DialogDescription>Registro de solo lectura de una operación finalizada.</DialogDescription></DialogHeader><div className="space-y-5"><section className="grid gap-4 rounded-lg border bg-muted/30 p-4 md:grid-cols-3"><Info label="Cliente" value={item.customer?.fullName ?? 'Cliente no disponible'} /><Info label="Identificación" value={identification(item.customer)} /><Info label="Correo" value={item.customer?.email ?? 'No disponible'} /><Info label="Cotización #" value={item.quotationNumber ?? 'No disponible'} /><Info label="Sales Order #" value={item.salesOrderNumber ?? 'No disponible'} /><Info label="Documento fiscal" value={item.fiscalDocument ? `${fiscalDocumentTypeLabel(item.fiscalDocument.type)} ${item.fiscalDocument.number ?? 'sin número'}` : 'Sin factura emitida'} />{item.fiscalDocument ? <div className="md:col-span-3"><Button asChild type="button" size="sm" variant="outline"><Link href={`/fiscal-billing/invoices/${encodeURIComponent(item.fiscalDocument.id)}`}>Ver documento fiscal</Link></Button></div> : null}</section><section><h2 className="font-semibold">Servicio</h2><div className="mt-2 grid gap-3 rounded-lg border p-4 md:grid-cols-3"><Info label="Descripción inmutable" value={item.serviceDescription} /><Info label="Estado final" value={historyStatusLabel(item.finalStatus)} /><Info label="Fecha final" value={formatDateTime(item.finalizedAt)} />{item.confirmationReference ? <Info label="Referencia de confirmación" value={item.confirmationReference} /> : null}{item.cancellationContext ? <Info label="Contexto de cancelación" value={item.cancellationContext} /> : null}</div></section><section><h2 className="font-semibold">Compra</h2>{purchase ? <div className="mt-2 grid gap-3 rounded-lg border p-4 md:grid-cols-3"><Info label="Proveedor" value={purchase.providerName} /><Info label="Monto" value={money(purchase.amount, purchase.currency)} /><Info label="Fecha de compra" value={formatDateTime(purchase.purchasedAt)} />{purchase.supplierReference ? <Info label="Referencia del proveedor" value={purchase.supplierReference} /> : null}{purchase.supplierInvoiceNumber ? <Info label="Factura del proveedor" value={purchase.supplierInvoiceNumber} /> : null}{purchase.taxAmount ? <Info label="Impuesto" value={money(purchase.taxAmount, purchase.currency)} /> : null}{purchase.notes ? <div className="md:col-span-3"><Info label="Notas" value={purchase.notes} /></div> : null}{purchase.evidenceCount > 0 ? <div className="md:col-span-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Evidencia</p><p className="mt-1 text-sm">{purchase.evidenceCount} {purchase.evidenceCount === 1 ? 'documento adjunto' : 'documentos adjuntos'}</p><div className="mt-2 flex flex-wrap gap-2">{purchase.evidence.map((evidence) => <Button key={evidence.id} type="button" size="sm" variant="outline" onClick={() => setEvidenceViewer({ id: evidence.id, originalFileName: evidence.originalFilename, mimeType: evidence.mimeType })}><FileText aria-hidden="true" size={16} /> Ver documento</Button>)}</div></div> : null}</div> : <p className="mt-2 rounded-lg border p-4 text-sm text-muted-foreground">No hay compra registrada para esta cancelación.</p>}</section></div><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cerrar</Button></DialogFooter></DialogContent></Dialog>{evidenceViewer ? <AttachmentViewer attachments={[evidenceViewer]} resolveAttachmentUrl={resolveEvidenceUrl} onClose={() => setEvidenceViewer(null)} /> : null}</>;
}

function CustomQuotationGroupDetail({ group, onClose, onChanged }: { group: CustomQuotationOperationsGroup; onClose: () => void; onChanged: () => Promise<void> }) {
  const formatDateTime = useTenantDateTimeFormatter();
  const [selectedRequirement, setSelectedRequirement] = useState<CustomQuotationOperationsGroup['requirements'][number] | null>(null);
  return <><Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Cotización personalizada</DialogTitle><DialogDescription>Servicios operativos de una misma cotización aceptada.</DialogDescription></DialogHeader><div className="space-y-5"><section className="grid gap-4 rounded-xl border border-primary/15 bg-primary/[0.04] p-5 shadow-sm md:grid-cols-3"><GroupedContextInfo label="Cliente" value={group.customer?.fullName ?? 'Cliente no disponible'} /><GroupedContextInfo label="Identificación" value={identification(group.customer)} /><GroupedContextInfo label="Documento fiscal" value={group.billingDocumentId ? fiscalDocumentTypeLabel(group.billingDocumentType) : 'Sin factura emitida'} neutral={!group.billingDocumentId} /><GroupedContextInfo label="Número fiscal" value={group.billingDocumentId ? group.fiscalDocumentNumber ?? 'Sin número' : 'No disponible'} /><GroupedContextInfo label="Total fiscal" value={group.fiscalTotal ? money(group.fiscalTotal.amount, group.fiscalTotal.currency) : 'No disponible'} /><GroupedContextInfo label="Cotización #" value={group.quotationNumber ?? 'Sin número'} /><GroupedContextInfo label="Sales Order #" value={group.salesOrderNumber ?? 'No disponible'} /><GroupedContextInfo label="Valor comercial total" value={money(group.commercialValue.amount, group.commercialValue.currency)} emphasized /><div><p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Estado</p><Badge className="mt-1.5" variant={statusVariant(group.status)}>{groupLabels[group.status]}</Badge></div><GroupedContextInfo label="Ingreso" value={formatDateTime(group.createdAt)} />{group.billingDocumentId ? <div className="md:col-span-3"><Button asChild type="button" size="sm" variant="outline"><Link href={`/fiscal-billing/invoices/${encodeURIComponent(group.billingDocumentId)}`}>Ver documento fiscal</Link></Button></div> : null}</section><section><div className="mb-3"><h2 className="font-semibold">Servicios</h2><p className="text-sm text-muted-foreground">Cada servicio conserva su gestión operativa independiente.</p></div><div className="space-y-3">{group.requirements.map((requirement) => <div key={requirement.requirementId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"><div><p className="font-medium text-foreground">{requirement.description}</p><p className="mt-1 text-sm font-semibold text-foreground">{money(requirement.commercialValue.amount, requirement.commercialValue.currency)}</p><div className="mt-2"><FinanceEligibilityBadge status={requirement.eligibilityStatus} /></div></div><div className="flex items-center gap-2"><Badge variant={statusVariant(requirement.status)}>{requirementLabels[requirement.status]}</Badge><Button type="button" size="sm" variant="outline" onClick={() => setSelectedRequirement(requirement)}>Gestionar servicio</Button></div></div>)}</div></section></div><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cerrar</Button></DialogFooter></DialogContent></Dialog>{selectedRequirement ? <StandaloneRequirementDetail requirementId={selectedRequirement.requirementId} financeEligibility={selectedRequirement} onClose={() => setSelectedRequirement(null)} onChanged={onChanged} /> : null}</>;
}

function GroupedContextInfo({ label, value, emphasized = false, neutral = false }: { label: string; value: string; emphasized?: boolean; neutral?: boolean }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">{label}</p>{neutral ? <Badge className="mt-1.5" variant="secondary">{value}</Badge> : <p className={`mt-1 text-sm ${emphasized ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}>{value}</p>}</div>;
}

function FinanceEligibilityBadge({ status }: { status: CustomQuotationFinanceEligibilityStatus }) {
  return <Badge variant={financeEligibilityVariant(status)}>{financeEligibilityLabels[status]}</Badge>;
}

function identification(customer: { idType: string | null; idNumber: string } | null) { return customer ? [customer.idType, customer.idNumber].filter(Boolean).join(' · ') || customer.idNumber : 'No disponible'; }

function StandaloneRequirementDetail({ requirementId, financeEligibility, onClose, onChanged }: { requirementId: string; financeEligibility: CustomQuotationOperationsGroup['requirements'][number]; onClose: () => void; onChanged: () => Promise<void> }) {
  const formatDateTime = useTenantDateTimeFormatter();
  const [requirement, setRequirement] = useState<StandaloneOperationalRequirementDetail | null>(null);
  const [fulfillments, setFulfillments] = useState<StandaloneOperationalFulfillmentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseFulfillmentId, setPurchaseFulfillmentId] = useState<string | null>(null);
  const [confirmationFulfillment, setConfirmationFulfillment] = useState<StandaloneOperationalFulfillmentSummary | null>(null);
  const [confirmationReference, setConfirmationReference] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [evidenceViewer, setEvidenceViewer] = useState<{ attachment: Attachment; fulfillmentId: string } | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { const [nextRequirement, nextFulfillments] = await Promise.all([getStandaloneOperationalRequirement(requirementId), listStandaloneOperationalFulfillments(requirementId)]); setRequirement(nextRequirement); setFulfillments(nextFulfillments.items); }
    catch (reason) { setError(errorMessage(reason, 'No se pudo cargar el servicio de la cotización personalizada.')); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [requirementId]);
  function openPurchase() { setError(null); setPurchaseFulfillmentId(null); setPurchaseOpen(true); }
  async function ensurePurchaseFulfillment() {
    if (purchaseFulfillmentId) return { id: purchaseFulfillmentId, created: false };
    const existing = fulfillments.find((fulfillment) => fulfillment.status === 'DRAFT' || fulfillment.status === 'RESERVED');
    if (existing) { setPurchaseFulfillmentId(existing.id); return { id: existing.id, created: false }; }
    const created = await createStandaloneOperationalFulfillment(requirementId, {});
    setPurchaseFulfillmentId(created.id);
    await load();
    return { id: created.id, created: true };
  }
  function openConfirmation(fulfillment: StandaloneOperationalFulfillmentSummary) { setConfirmationFulfillment(fulfillment); setConfirmationReference(''); setConfirmError(null); }
  function openPurchaseEvidence(fulfillmentId: string, evidence: NonNullable<NonNullable<StandaloneOperationalFulfillmentSummary['purchase']>['evidence']>) { setEvidenceViewer({ fulfillmentId, attachment: { id: evidence.id, originalFileName: evidence.originalFilename, mimeType: evidence.mimeType } }); }
  async function resolveEvidenceUrl(attachment: Attachment, _signal: AbortSignal) { if (!evidenceViewer) throw new Error('OPERATIONAL_EVIDENCE_NOT_SELECTED'); return (await getStandaloneOperationalEvidenceAccess(requirementId, evidenceViewer.fulfillmentId, attachment.id)).url; }
  async function confirmFulfillment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reference = confirmationReference.trim();
    if (!confirmationFulfillment || !reference) { setConfirmError('Ingrese la referencia de confirmación.'); return; }
    setConfirming(true); setConfirmError(null);
    try {
      await updateStandaloneOperationalFulfillment(requirementId, confirmationFulfillment.id, { confirmationReference: reference });
      await transitionStandaloneOperationalFulfillment(requirementId, confirmationFulfillment.id, 'CONFIRMED');
      setConfirmationFulfillment(null); setConfirmationReference('');
      await load(); await onChanged();
    } catch (reason) { setConfirmError(confirmationErrorMessage(reason)); }
    finally { setConfirming(false); }
  }

  const canProcess = financeEligibility.eligibilityStatus === 'LISTO_PARA_PROCESAR';
  const hasPurchase = fulfillments.some((fulfillment) => fulfillment.purchaseCount > 0 || fulfillment.status === 'PURCHASED');
  const terminalFulfillment = fulfillments.some((fulfillment) => fulfillment.status === 'CONFIRMED' || fulfillment.status === 'CANCELLED');
  const canRegisterPurchase = !hasPurchase && !terminalFulfillment;
  const financeMessage = financeEligibilityMessages[financeEligibility.eligibilityStatus];
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>Servicio de cotización personalizada</DialogTitle><DialogDescription>Contexto operativo del cliente, sin viaje ni pasajeros.</DialogDescription></DialogHeader>{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}{loading ? <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={16} /> Cargando servicio...</div> : requirement ? <div className="space-y-5"><section className="grid gap-4 rounded-lg border bg-muted/30 p-4 md:grid-cols-3"><Info label="Cliente" value={requirement.customer.fullName} /><Info label="Fuente" value={`${sourceLabel(requirement.source.type)}${requirement.source.reference ? ` · ${requirement.source.reference}` : ''}`} /><Info label="Valor comercial" value={money(requirement.soldValue.amount, requirement.soldValue.currency)} /><Info label="Servicio" value={requirement.servicePurposeName} /><Info label="Estado" value={requirementLabels[requirement.status]} /><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Elegibilidad financiera</p><div className="mt-1"><FinanceEligibilityBadge status={financeEligibility.eligibilityStatus} /></div></div><Info label="Ingreso" value={formatDateTime(requirement.createdAt)} /><div className="md:col-span-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Descripción inmutable</p><p className="mt-1 text-sm">{requirement.description}</p></div></section>
    <section><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Compras</h2><p className="text-sm text-muted-foreground">Registre la compra del proveedor; la gestión se crea internamente solo cuando es necesaria.</p></div>{canRegisterPurchase ? <Button type="button" size="sm" disabled={!canProcess} title={financeMessage} onClick={openPurchase}><ShoppingCart aria-hidden="true" size={16} /> Registrar compra</Button> : null}</div>{!canProcess && canRegisterPurchase ? <Alert><AlertDescription>{financeMessage}</AlertDescription></Alert> : null}<div className="mt-2 space-y-2">{fulfillments.length === 0 ? <Card><CardContent className="py-5 text-sm text-muted-foreground">No hay compras registradas para este servicio.</CardContent></Card> : fulfillments.map((fulfillment) => <Card key={fulfillment.id}><CardContent className="flex flex-wrap items-start justify-between gap-3 py-3">{fulfillment.purchase ? <PurchaseSummary purchase={fulfillment.purchase} formatDateTime={formatDateTime} onViewEvidence={(evidence) => openPurchaseEvidence(fulfillment.id, evidence)} /> : <div><p className="font-medium">{fulfillment.purchaseCount > 0 ? 'Compra registrada' : 'Sin compra registrada'}</p>{fulfillment.purchaseCount > 0 ? <p className="text-sm text-muted-foreground">Información de compra no disponible.</p> : null}</div>}<div className="flex items-center gap-2"><Badge variant={statusVariant(fulfillment.status)}>{fulfillmentLabels[fulfillment.status]}</Badge>{fulfillment.status === 'PURCHASED' && fulfillment.purchaseCount > 0 ? <Button type="button" size="sm" onClick={() => openConfirmation(fulfillment)}>Confirmar</Button> : null}</div></CardContent></Card>)}</div></section>
  </div> : null}<DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cerrar</Button></DialogFooter>
  {purchaseOpen && requirement ? <OperationalPurchaseDrawer open onOpenChange={(open) => { if (!open) { setPurchaseOpen(false); setPurchaseFulfillmentId(null); } }} requirementId={requirement.id} fulfillmentId={purchaseFulfillmentId} ensureFulfillment={ensurePurchaseFulfillment} soldValue={requirement.soldValue} onCreated={async ({ evidenceUploadFailed }) => { setPurchaseOpen(false); setPurchaseFulfillmentId(null); setError(evidenceUploadFailed ? 'Compra registrada correctamente, pero no se pudo cargar el documento.' : null); await load(); }} /> : null}
  <Dialog open={Boolean(confirmationFulfillment)} onOpenChange={(open) => { if (!open && !confirming) { setConfirmationFulfillment(null); setConfirmError(null); } }}><DialogContent><DialogHeader><DialogTitle>Confirmar gestión</DialogTitle><DialogDescription>Registre la referencia entregada por el proveedor antes de confirmar.</DialogDescription></DialogHeader><form onSubmit={confirmFulfillment} className="space-y-3"><label className="grid gap-2 text-sm font-medium">Referencia de confirmación<Input required autoFocus value={confirmationReference} onChange={(event) => setConfirmationReference(event.target.value)} placeholder="Código o número de confirmación" /></label><p className="text-sm text-muted-foreground">Código, número de confirmación, reserva, voucher o referencia entregada por el proveedor.</p>{confirmError ? <Alert variant="destructive"><AlertDescription>{confirmError}</AlertDescription></Alert> : null}<DialogFooter><Button type="button" variant="outline" disabled={confirming} onClick={() => { setConfirmationFulfillment(null); setConfirmError(null); }}>Cancelar</Button><Button type="submit" disabled={confirming || !confirmationReference.trim()}>{confirming ? 'Confirmando...' : 'Confirmar gestión'}</Button></DialogFooter></form></DialogContent></Dialog>
  {evidenceViewer ? <AttachmentViewer attachments={[evidenceViewer.attachment]} resolveAttachmentUrl={resolveEvidenceUrl} onClose={() => setEvidenceViewer(null)} /> : null}
  </DialogContent></Dialog>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm">{value}</p></div>; }

function PurchaseSummary({ purchase, formatDateTime, onViewEvidence }: { purchase: NonNullable<StandaloneOperationalFulfillmentSummary['purchase']>; formatDateTime: (value: string) => string; onViewEvidence: (evidence: NonNullable<NonNullable<StandaloneOperationalFulfillmentSummary['purchase']>['evidence']>) => void }) {
  const evidence = purchase.evidence;
  return <div className="min-w-0 space-y-2"><p className="font-medium">{purchase.providerName}</p><div className="grid gap-x-5 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2"><PurchaseField label="Monto" value={money(purchase.amount, purchase.currency)} /><PurchaseField label="Fecha de compra" value={formatDateTime(purchase.purchasedAt)} />{purchase.supplierReference ? <PurchaseField label="Referencia del proveedor" value={purchase.supplierReference} /> : null}{purchase.supplierInvoiceNumber ? <PurchaseField label="Factura del proveedor" value={purchase.supplierInvoiceNumber} /> : null}{purchase.taxAmount ? <PurchaseField label="Impuesto" value={money(purchase.taxAmount, purchase.currency)} /> : null}{purchase.evidenceCount > 0 ? <PurchaseField label="Documento" value={`${purchase.evidenceCount} ${purchase.evidenceCount === 1 ? 'documento adjunto' : 'documentos adjuntos'}`} /> : null}</div>{purchase.notes ? <p className="max-w-2xl text-sm text-muted-foreground">Notas: {purchase.notes}</p> : null}{evidence ? <Button type="button" size="sm" variant="outline" onClick={() => onViewEvidence(evidence)}><FileText aria-hidden="true" size={16} /> Ver documento</Button> : null}</div>;
}

function PurchaseField({ label, value }: { label: string; value: string }) { return <p><span className="font-medium text-foreground">{label}:</span> {value}</p>; }

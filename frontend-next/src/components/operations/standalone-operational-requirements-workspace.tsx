'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { ClipboardList, FileUp, Loader2, PackageCheck, Plus, ShoppingCart } from 'lucide-react';
import {
  createStandaloneOperationalFulfillment,
  createStandaloneOperationalPurchase,
  getStandaloneOperationalEvidenceAccess,
  getStandaloneOperationalRequirement,
  listStandaloneOperationalEvidence,
  listStandaloneOperationalFulfillments,
  listStandaloneOperationalPurchases,
  listStandaloneOperationalRequirements,
  operationsErrorMessage,
  type OperationalRequirementStatus,
  transitionStandaloneOperationalFulfillment,
  updateStandaloneOperationalFulfillment,
  uploadStandaloneOperationalEvidence,
  type OperationalEvidenceType,
  type OperationalFulfillmentStatus,
  type StandaloneOperationalFulfillmentSummary,
  type StandaloneOperationalRequirement,
  type StandaloneOperationalRequirementDetail,
} from '@/lib/operations-api';
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
const fulfillmentLabels: Record<OperationalFulfillmentStatus, string> = { DRAFT: 'Preparando', RESERVED: 'Reservado', PURCHASED: 'Comprado', CONFIRMED: 'Confirmado', CANCELLED: 'Cancelado' };
const evidenceLabels: Record<OperationalEvidenceType, string> = { SUPPLIER_QUOTE: 'Cotización del proveedor', BOOKING_CONFIRMATION: 'Confirmación de reserva', TICKET: 'Boleto', VOUCHER: 'Voucher', SUPPLIER_INVOICE: 'Factura del proveedor', RECEIPT: 'Recibo', INSURANCE_CERTIFICATE: 'Certificado de seguro', SCREENSHOT: 'Captura de pantalla', OTHER: 'Otro' };

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
function money(amount: string | null, currency: string | null) { return amount && currency ? `${currency} ${amount}` : 'No disponible'; }
function errorMessage(error: unknown, fallback: string) { return operationsErrorMessage(error, fallback); }

export function StandaloneOperationalRequirementsWorkspace() {
  const formatDateTime = useTenantDateTimeFormatter();
  const [items, setItems] = useState<StandaloneOperationalRequirement[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OperationalRequirementStatus | ''>('');
  const [sourceType, setSourceType] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load(nextPage = page) {
    setLoading(true); setError(null);
    try { const response = await listStandaloneOperationalRequirements({ page: nextPage, search: search || undefined, status: status || undefined, sourceType: sourceType || undefined }); setItems(response.items); setPagination({ total: response.total, totalPages: response.totalPages }); }
    catch (reason) { setError(errorMessage(reason, 'No se pudieron cargar las solicitudes independientes.')); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []); // Initial queue; filters are explicitly applied by the operator.
  const sourceTypes = useMemo(() => [...new Set(items.map((item) => item.source.type).filter((value): value is string => Boolean(value)))], [items]);
  const visibleItems = items;

  return <main className="app-shell p-5"><div className="mx-auto max-w-7xl space-y-5">
    <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-primary">Operaciones</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Solicitudes independientes</h1><p className="mt-1 text-sm text-muted-foreground">Trabajo operativo de clientes que no pertenece a un viaje.</p></div><Button type="button" variant="outline" onClick={() => void load()}>Actualizar</Button></section>
    <Card><CardContent className="grid gap-3 py-4 md:grid-cols-[1fr_180px_200px_auto]"><Input aria-label="Buscar solicitudes independientes" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente o servicio" /><Select aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value as OperationalRequirementStatus | '')}><option value="">Todos los estados</option>{Object.entries(requirementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select aria-label="Filtrar por fuente" value={sourceType} onChange={(event) => setSourceType(event.target.value)}><option value="">Todas las fuentes</option>{sourceTypes.map((value) => <option key={value} value={value}>{sourceLabel(value)}</option>)}</Select><Button type="button" onClick={() => { setPage(1); void load(1); }}>Aplicar filtros</Button></CardContent></Card>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList aria-hidden="true" size={20} /> Cola operativa</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Fuente</TableHead><TableHead>Servicio</TableHead><TableHead>Valor</TableHead><TableHead>Estado</TableHead><TableHead>Ingreso</TableHead><TableHead><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Cargando solicitudes...</TableCell></TableRow> : visibleItems.length === 0 ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No hay solicitudes independientes para los filtros seleccionados.</TableCell></TableRow> : visibleItems.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.customer.fullName}</TableCell><TableCell><Badge variant="info">{sourceLabel(item.source.type)}</Badge><p className="mt-1 text-xs text-muted-foreground">{item.source.reference ?? 'Sin referencia'}</p></TableCell><TableCell><p>{item.description}</p><p className="text-xs text-muted-foreground">{item.servicePurposeName}</p></TableCell><TableCell>{money(item.soldValue.amount, item.soldValue.currency)}</TableCell><TableCell><Badge variant={statusVariant(item.status)}>{requirementLabels[item.status]}</Badge></TableCell><TableCell className="text-sm text-muted-foreground">{formatDateTime(item.createdAt)}</TableCell><TableCell><Button type="button" size="sm" variant="outline" onClick={() => setSelectedId(item.id)}>Abrir</Button></TableCell></TableRow>)}</TableBody></Table>{pagination.totalPages > 1 ? <div className="flex items-center justify-between border-t px-4 py-3 text-sm"><span className="text-muted-foreground">{pagination.total} solicitudes</span><div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => { const next = page - 1; setPage(next); void load(next); }}>Anterior</Button><span>Página {page} de {pagination.totalPages}</span><Button type="button" size="sm" variant="outline" disabled={page >= pagination.totalPages} onClick={() => { const next = page + 1; setPage(next); void load(next); }}>Siguiente</Button></div></div> : null}</CardContent></Card>
  </div>{selectedId ? <StandaloneRequirementDetail requirementId={selectedId} onClose={() => setSelectedId(null)} /> : null}</main>;
}

function StandaloneRequirementDetail({ requirementId, onClose }: { requirementId: string; onClose: () => void }) {
  const formatDateTime = useTenantDateTimeFormatter();
  const [requirement, setRequirement] = useState<StandaloneOperationalRequirementDetail | null>(null);
  const [fulfillments, setFulfillments] = useState<StandaloneOperationalFulfillmentSummary[]>([]);
  const [selectedFulfillmentId, setSelectedFulfillmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [providerName, setProviderName] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try { const [nextRequirement, nextFulfillments] = await Promise.all([getStandaloneOperationalRequirement(requirementId), listStandaloneOperationalFulfillments(requirementId)]); setRequirement(nextRequirement); setFulfillments(nextFulfillments.items); setSelectedFulfillmentId((current) => current && nextFulfillments.items.some((item) => item.id === current) ? current : (nextFulfillments.items[0]?.id ?? null)); }
    catch (reason) { setError(errorMessage(reason, 'No se pudo cargar la solicitud independiente.')); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [requirementId]);
  async function createFulfillment(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(null); try { await createStandaloneOperationalFulfillment(requirementId, { providerName: providerName.trim() || null }); setProviderName(''); setCreateOpen(false); await load(); } catch (reason) { setError(errorMessage(reason, 'No se pudo crear la gestión.')); } finally { setSaving(false); } }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>Solicitud independiente</DialogTitle><DialogDescription>Contexto operativo del cliente, sin viaje ni pasajeros.</DialogDescription></DialogHeader>{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}{loading ? <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={16} /> Cargando solicitud...</div> : requirement ? <div className="space-y-5"><section className="grid gap-4 rounded-lg border bg-muted/30 p-4 md:grid-cols-3"><Info label="Cliente" value={requirement.customer.fullName} /><Info label="Fuente" value={`${sourceLabel(requirement.source.type)}${requirement.source.reference ? ` · ${requirement.source.reference}` : ''}`} /><Info label="Valor comercial" value={money(requirement.soldValue.amount, requirement.soldValue.currency)} /><Info label="Servicio" value={requirement.servicePurposeName} /><Info label="Estado" value={requirementLabels[requirement.status]} /><Info label="Ingreso" value={formatDateTime(requirement.createdAt)} /><div className="md:col-span-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Descripción inmutable</p><p className="mt-1 text-sm">{requirement.description}</p></div></section>
    <section><div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Gestiones</h2><p className="text-sm text-muted-foreground">No se asignan pasajeros a solicitudes independientes.</p></div><Button type="button" size="sm" onClick={() => setCreateOpen(true)}><Plus aria-hidden="true" size={16} /> Nueva gestión</Button></div><div className="space-y-2">{fulfillments.length === 0 ? <Card><CardContent className="py-5 text-sm text-muted-foreground">No hay gestiones creadas para esta solicitud.</CardContent></Card> : fulfillments.map((fulfillment) => <button type="button" key={fulfillment.id} onClick={() => setSelectedFulfillmentId(fulfillment.id)} className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${selectedFulfillmentId === fulfillment.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}><span><span className="font-medium">{fulfillment.providerName ?? 'Gestión sin proveedor'}</span><span className="ml-2 text-sm text-muted-foreground">{fulfillment.purchaseCount} compra(s)</span></span><Badge variant={statusVariant(fulfillment.status)}>{fulfillmentLabels[fulfillment.status]}</Badge></button>)}</div></section>
    {selectedFulfillmentId ? <StandaloneFulfillmentWorkflow requirementId={requirement.id} fulfillment={fulfillments.find((item) => item.id === selectedFulfillmentId) ?? null} soldCurrency={requirement.soldValue.currency} onChanged={() => void load()} /> : null}
  </div> : null}<DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cerrar</Button></DialogFooter>
  <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Nueva gestión</DialogTitle><DialogDescription>La gestión se crea sin asignaciones de pasajeros.</DialogDescription></DialogHeader><form onSubmit={createFulfillment} className="space-y-4"><Input value={providerName} onChange={(event) => setProviderName(event.target.value)} placeholder="Proveedor (opcional)" /><DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Crear gestión'}</Button></DialogFooter></form></DialogContent></Dialog>
  </DialogContent></Dialog>;
}

function StandaloneFulfillmentWorkflow({ requirementId, fulfillment, soldCurrency, onChanged }: { requirementId: string; fulfillment: StandaloneOperationalFulfillmentSummary | null; soldCurrency: string | null; onChanged: () => void }) {
  const formatDateTime = useTenantDateTimeFormatter();
  const fulfillmentId = fulfillment?.id ?? '';
  const [purchases, setPurchases] = useState<Array<{ id: string; providerName: string; amount: string; currency: string; purchasedAt: string }>>([]);
  const [evidence, setEvidence] = useState<Array<{ id: string; evidenceType: OperationalEvidenceType; originalFilename: string; createdAt: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({ providerName: '', amount: '', currency: soldCurrency ?? '', purchasedAt: '' });
  const [editingProvider, setEditingProvider] = useState(false);
  const [providerName, setProviderName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [evidenceType, setEvidenceType] = useState<OperationalEvidenceType>('OTHER');
  async function load() { try { const [nextPurchases, nextEvidence] = await Promise.all([listStandaloneOperationalPurchases(requirementId, fulfillmentId), listStandaloneOperationalEvidence(requirementId, fulfillmentId)]); setPurchases(nextPurchases.items); setEvidence(nextEvidence.items); } catch (reason) { setError(errorMessage(reason, 'No se pudieron cargar compras o documentos.')); } }
  useEffect(() => { void load(); }, [requirementId, fulfillmentId]);
  useEffect(() => { setProviderName(fulfillment?.providerName ?? ''); setEditingProvider(false); }, [fulfillment?.id, fulfillment?.providerName]);
  async function transition(targetStatus: OperationalFulfillmentStatus) { setError(null); try { await transitionStandaloneOperationalFulfillment(requirementId, fulfillmentId, targetStatus); onChanged(); } catch (reason) { setError(errorMessage(reason, 'No se pudo actualizar el estado de la gestión.')); } }
  async function createPurchase(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); try { await createStandaloneOperationalPurchase(requirementId, fulfillmentId, purchaseForm); setPurchaseOpen(false); await load(); onChanged(); } catch (reason) { setError(errorMessage(reason, 'La compra permanece bloqueada hasta que Finanzas la autorice.')); } }
  async function saveProvider(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); try { await updateStandaloneOperationalFulfillment(requirementId, fulfillmentId, { providerName: providerName.trim() || null }); setEditingProvider(false); onChanged(); } catch (reason) { setError(errorMessage(reason, 'No se pudo actualizar la gestión.')); } }
  async function upload(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!file) { setError('Seleccione un archivo.'); return; } setError(null); try { await uploadStandaloneOperationalEvidence(requirementId, fulfillmentId, { evidenceType, file }); setFile(null); await load(); } catch (reason) { setError(errorMessage(reason, 'No se pudo subir el documento.')); } }
  async function openEvidence(evidenceId: string) { try { window.open((await getStandaloneOperationalEvidenceAccess(requirementId, fulfillmentId, evidenceId)).url, '_blank', 'noopener,noreferrer'); } catch (reason) { setError(errorMessage(reason, 'No se pudo abrir el documento.')); } }
  if (!fulfillment) return null;
  const transitions = fulfillment.status === 'DRAFT' ? ['RESERVED', 'PURCHASED', 'CANCELLED'] as const : fulfillment.status === 'RESERVED' ? ['PURCHASED', 'CONFIRMED', 'CANCELLED'] as const : fulfillment.status === 'PURCHASED' ? ['CONFIRMED', 'CANCELLED'] as const : [];
  return <section className="space-y-4 rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Compra y documentos</h2><p className="text-sm text-muted-foreground">Las compras siguen la autorización financiera vigente.</p></div><div className="flex flex-wrap gap-2">{transitions.map((target) => <Button key={target} type="button" size="sm" variant={target === 'CANCELLED' ? 'outline' : 'default'} onClick={() => void transition(target)}>{fulfillmentLabels[target]}</Button>)}<Button type="button" size="sm" onClick={() => setPurchaseOpen(true)}><ShoppingCart aria-hidden="true" size={16} /> Registrar compra</Button></div></div>{editingProvider ? <form onSubmit={saveProvider} className="flex gap-2"><Input value={providerName} onChange={(event) => setProviderName(event.target.value)} placeholder="Proveedor" /><Button type="submit" size="sm">Guardar</Button><Button type="button" size="sm" variant="outline" onClick={() => setEditingProvider(false)}>Cancelar</Button></form> : <div className="flex items-center justify-between rounded border p-2 text-sm"><span>Proveedor: {fulfillment.providerName ?? 'Sin definir'}</span><Button type="button" size="sm" variant="ghost" onClick={() => setEditingProvider(true)}>Editar</Button></div>}{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}<div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Compras</CardTitle></CardHeader><CardContent className="space-y-2">{purchases.length === 0 ? <p className="text-sm text-muted-foreground">Sin compras registradas.</p> : purchases.map((purchase) => <div key={purchase.id} className="rounded border p-2 text-sm"><p className="font-medium">{purchase.providerName} · {purchase.currency} {purchase.amount}</p><p className="text-muted-foreground">{formatDateTime(purchase.purchasedAt)}</p></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Evidencia</CardTitle></CardHeader><CardContent className="space-y-3"><form onSubmit={upload} className="space-y-2"><Select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as OperationalEvidenceType)}>{Object.entries(evidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><Button type="submit" size="sm" variant="outline"><FileUp aria-hidden="true" size={16} /> Subir evidencia</Button></form>{evidence.map((item) => <button type="button" key={item.id} onClick={() => void openEvidence(item.id)} className="block w-full rounded border p-2 text-left text-sm hover:bg-muted/50"><p className="font-medium">{item.originalFilename}</p><p className="text-muted-foreground">{evidenceLabels[item.evidenceType]} · {formatDateTime(item.createdAt)}</p></button>)}</CardContent></Card></div><Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}><DialogContent><DialogHeader><DialogTitle>Registrar compra</DialogTitle><DialogDescription>La autorización financiera se valida en el backend.</DialogDescription></DialogHeader><form onSubmit={createPurchase} className="space-y-3"><Input required placeholder="Proveedor" value={purchaseForm.providerName} onChange={(event) => setPurchaseForm({ ...purchaseForm, providerName: event.target.value })} /><div className="grid grid-cols-2 gap-3"><Input required inputMode="decimal" placeholder="Monto" value={purchaseForm.amount} onChange={(event) => setPurchaseForm({ ...purchaseForm, amount: event.target.value })} /><Input required maxLength={3} placeholder="Moneda" value={purchaseForm.currency} onChange={(event) => setPurchaseForm({ ...purchaseForm, currency: event.target.value.toUpperCase() })} /></div><Input required type="date" value={purchaseForm.purchasedAt} onChange={(event) => setPurchaseForm({ ...purchaseForm, purchasedAt: event.target.value })} /><DialogFooter><Button type="submit"><PackageCheck aria-hidden="true" size={16} /> Guardar compra</Button></DialogFooter></form></DialogContent></Dialog></section>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm">{value}</p></div>; }

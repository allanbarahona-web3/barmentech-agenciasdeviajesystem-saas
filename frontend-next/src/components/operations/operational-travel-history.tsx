'use client';

import { useEffect, useState } from 'react';
import { FileText, History } from 'lucide-react';
import AttachmentViewer, { type Attachment } from '@/components/attachment-viewer';
import { getOperationalEvidenceAccess, getOperationalPassengerRoster, getOperationalTravelHistoryDetail, listOperationalTravelHistory, operationsErrorMessage, type OperationalPassengerRosterRow, type OperationalTravelHistoryDatePreset, type OperationalTravelHistoryDetail, type OperationalTravelHistoryItem, type OperationalTravelHistoryStatus, type OperationalWorkSourceCategory } from '@/lib/operations-api';
import { formatFinanceMoneyDisplay } from '@/lib/finance-money-display';
import { getAvailableTravelPackages, type TravelPackage } from '@/lib/travel-packages-api';
import { formatBusinessDate } from '@/shared/regional';
import { useTenantDateTimeFormatter } from '@/shared/regional/tenant-regional-provider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const sourceLabels: Record<Exclude<OperationalWorkSourceCategory, 'ALL'>, string> = { BASE_TRIP: 'Viaje base', ADDITIONAL_SERVICES: 'Servicio adicional' };
const terminalLabels: Record<Exclude<OperationalTravelHistoryStatus, 'ALL'>, string> = { CONFIRMED: 'Confirmado', CANCELLED: 'Cancelado' };

export function OperationalTravelHistory({ travelPackageId }: { travelPackageId: string }) {
  const formatDateTime = useTenantDateTimeFormatter();
  const [selectedTravelPackageId, setSelectedTravelPackageId] = useState(travelPackageId);
  const [travelPackages, setTravelPackages] = useState<TravelPackage[]>([]);
  const [passengerOptions, setPassengerOptions] = useState<OperationalPassengerRosterRow[]>([]);
  const [items, setItems] = useState<OperationalTravelHistoryItem[]>([]);
  const [page, setPage] = useState(1), [total, setTotal] = useState(0), [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<OperationalTravelHistoryDatePreset | ''>('');
  const [dateFrom, setDateFrom] = useState(''), [dateTo, setDateTo] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [sourceCategory, setSourceCategory] = useState<OperationalWorkSourceCategory>('ALL');
  const [terminalStatus, setTerminalStatus] = useState<OperationalTravelHistoryStatus>('ALL');
  const [detail, setDetail] = useState<OperationalTravelHistoryDetail | null>(null), [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState<string | null>(null);

  async function load(nextPage = page, historyTravelPackageId = selectedTravelPackageId, historyParticipantId = participantId) {
    setLoading(true); setError(null);
    try {
      const response = await listOperationalTravelHistory({
        page: nextPage,
        travelPackageId: historyTravelPackageId || undefined,
        travelPackageParticipantId: historyParticipantId || undefined,
        sourceCategory,
        terminalStatus,
        datePreset: datePreset || undefined,
        dateFrom: datePreset === 'CUSTOM' ? dateFrom || undefined : undefined,
        dateTo: datePreset === 'CUSTOM' ? dateTo || undefined : undefined,
      });
      setItems(response.items); setTotal(response.total); setTotalPages(response.totalPages); setPage(response.page);
    } catch (reason) { setError(operationsErrorMessage(reason, 'No se pudo cargar el historial operativo.')); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    void getAvailableTravelPackages()
      .then((available) => { if (active) setTravelPackages(available); })
      .catch(() => { /* Current-trip history remains available if the optional selector cannot load. */ });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setSelectedTravelPackageId(travelPackageId);
  }, [travelPackageId]);

  useEffect(() => {
    let active = true;
    setParticipantId('');
    setPage(1);
    void load(1, selectedTravelPackageId, '');
    if (!selectedTravelPackageId) return () => { active = false; };
    void getOperationalPassengerRoster(selectedTravelPackageId)
      .then((response) => { if (active) setPassengerOptions(response.items); })
      .catch(() => { if (active) setPassengerOptions([]); });
    return () => { active = false; };
    // A selected trip owns one bounded roster query; history rows never query passengers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTravelPackageId]);

  async function openDetail(fulfillmentId: string) {
    setDetail(null); setDetailError(null); setDetailLoading(true);
    try { setDetail(await getOperationalTravelHistoryDetail(fulfillmentId)); }
    catch (reason) { setDetailError(operationsErrorMessage(reason, 'No se pudo cargar el detalle histórico.')); }
    finally { setDetailLoading(false); }
  }

  const resetPage = () => setPage(1);
  return <section className="space-y-4" aria-label="Historial operativo"><div><h2 className="text-2xl font-semibold">Historial</h2><p className="text-sm text-muted-foreground">Solo operaciones confirmadas o canceladas. Puede consultar este viaje, otro viaje disponible o un pasajero sin limitarlo a un viaje.</p></div>
    <Card><CardContent className="grid gap-3 py-4 md:grid-cols-3 xl:grid-cols-6"><Select aria-label="Fecha de finalización" value={datePreset} onChange={(event) => { setDatePreset(event.target.value as OperationalTravelHistoryDatePreset | ''); resetPage(); }}><option value="">Todas las fechas</option><option value="TODAY">Hoy</option><option value="LAST_7_DAYS">7 días</option><option value="LAST_30_DAYS">1 mes</option><option value="CUSTOM">Personalizado</option></Select><Select aria-label="Viaje" value={selectedTravelPackageId} onChange={(event) => { setSelectedTravelPackageId(event.target.value); resetPage(); }}><option value="">Todos los viajes</option>{[...travelPackages, ...(travelPackages.some((travelPackage) => travelPackage.id === travelPackageId) ? [] : [{ id: travelPackageId, name: 'Viaje actual' } as TravelPackage])].map((travelPackage) => <option key={travelPackage.id} value={travelPackage.id}>{travelPackage.name}</option>)}</Select><Select aria-label="Pasajero" value={participantId} onChange={(event) => { setParticipantId(event.target.value); resetPage(); }}><option value="">Todos los pasajeros</option>{passengerOptions.map((passenger) => <option key={passenger.travelPackageParticipantId} value={passenger.travelPackageParticipantId}>{passenger.fullName}</option>)}</Select><Select aria-label="Origen" value={sourceCategory} onChange={(event) => { setSourceCategory(event.target.value as OperationalWorkSourceCategory); resetPage(); }}><option value="ALL">Todos</option><option value="BASE_TRIP">Viaje base</option><option value="ADDITIONAL_SERVICES">Servicios adicionales</option></Select><Select aria-label="Estado final" value={terminalStatus} onChange={(event) => { setTerminalStatus(event.target.value as OperationalTravelHistoryStatus); resetPage(); }}><option value="ALL">Todos los estados</option><option value="CONFIRMED">Confirmado</option><option value="CANCELLED">Cancelado</option></Select><Button type="button" onClick={() => void load(1)}>Aplicar filtros</Button>{datePreset === 'CUSTOM' ? <><Input aria-label="Desde" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); resetPage(); }} /><Input aria-label="Hasta" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); resetPage(); }} /></> : null}</CardContent></Card>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><History aria-hidden="true" size={20} /> Operaciones finalizadas</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><Table className="min-w-[1050px]"><TableHeader><TableRow><TableHead>Fecha final</TableHead><TableHead>Viaje / origen</TableHead><TableHead>Servicio</TableHead><TableHead>Pasajeros</TableHead><TableHead>Proveedor / reserva</TableHead><TableHead>Compra</TableHead><TableHead>Evidencia</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Cargando historial...</TableCell></TableRow> : items.length === 0 ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No hay operaciones históricas para los filtros seleccionados.</TableCell></TableRow> : items.map((item) => <TableRow key={item.fulfillmentId} className="cursor-pointer hover:bg-muted/50" role="button" tabIndex={0} onClick={() => void openDetail(item.fulfillmentId)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openDetail(item.fulfillmentId); } }}><TableCell className="text-sm text-muted-foreground">{formatDateTime(item.terminalAt)}</TableCell><TableCell><p className="font-medium">{item.trip.name ?? 'Viaje no disponible'}</p>{item.sourceCategory ? <Badge className="mt-1" variant="outline">{sourceLabels[item.sourceCategory]}</Badge> : null}</TableCell><TableCell><p className="font-medium">{item.requirement.servicePurposeName}</p><p className="max-w-60 truncate text-sm text-muted-foreground">{item.requirement.description ?? 'Sin descripción'}</p></TableCell><TableCell>{item.passengers.length ? <><p>{item.passengers.map((passenger) => passenger.fullName).join(', ')}</p><p className="text-xs text-muted-foreground">{item.passengerCount} {item.passengerCount === 1 ? 'pasajero' : 'pasajeros'}</p></> : 'Sin pasajeros'}</TableCell><TableCell><p>{item.reservation.providerName ?? '—'}</p><p className="text-xs text-muted-foreground">{item.reservation.reservationCode ?? item.reservation.providerReference ?? 'Sin reserva'}</p></TableCell><TableCell>{item.purchase ? <><p className="font-medium">{money(item.purchase.amount, item.purchase.currency)}</p>{item.purchase.taxAmount ? <p className="text-xs text-muted-foreground">Impuesto: {money(item.purchase.taxAmount, item.purchase.currency)}</p> : null}</> : '—'}</TableCell><TableCell>{item.evidenceCount > 0 ? <span className="inline-flex items-center gap-1"><FileText aria-hidden="true" size={15} />{item.evidenceCount}</span> : '—'}</TableCell><TableCell><Badge variant={item.terminalStatus === 'CONFIRMED' ? 'success' : 'destructive'}>{terminalLabels[item.terminalStatus]}</Badge></TableCell></TableRow>)}</TableBody></Table>{totalPages > 1 ? <div className="flex items-center justify-between border-t px-4 py-3 text-sm"><span className="text-muted-foreground">{total} operaciones</span><div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>Anterior</Button><span>Página {page} de {totalPages}</span><Button type="button" size="sm" variant="outline" disabled={page >= totalPages || loading} onClick={() => void load(page + 1)}>Siguiente</Button></div></div> : null}</CardContent></Card>
    {(detail || detailLoading || detailError) ? <OperationalTravelHistoryDetailDialog detail={detail} loading={detailLoading} error={detailError} formatDateTime={formatDateTime} onClose={() => { setDetail(null); setDetailError(null); }} /> : null}
  </section>;
}

function OperationalTravelHistoryDetailDialog({ detail, loading, error, formatDateTime, onClose }: { detail: OperationalTravelHistoryDetail | null; loading: boolean; error: string | null; formatDateTime: (value: string) => string; onClose: () => void }) {
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  async function resolveAttachmentUrl(current: Attachment, _signal: AbortSignal) {
    if (!detail) throw new Error('Detalle histórico no disponible');
    return (await getOperationalEvidenceAccess(detail.trip.travelPackageId, detail.requirementId, detail.fulfillmentId, current.id)).url;
  }
  return <><Dialog open onOpenChange={(open) => { if (!open && !loading) onClose(); }}><DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>Detalle histórico operativo</DialogTitle><DialogDescription>Registro de solo lectura de una operación finalizada.</DialogDescription></DialogHeader>{loading ? <p className="py-10 text-center text-sm text-muted-foreground">Cargando detalle...</p> : error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : detail ? <div className="space-y-5"><section><h3 className="font-semibold">Viaje y servicio</h3><div className="mt-2 grid gap-3 rounded-lg border p-4 md:grid-cols-3"><Info label="Viaje" value={detail.trip.name ?? 'No disponible'} /><Info label="Fechas" value={dateRange(detail.trip.departureDate, detail.trip.returnDate)} /><Info label="Origen" value={detail.sourceCategory ? sourceLabels[detail.sourceCategory] : 'No disponible'} /><Info label="Servicio" value={detail.requirement.servicePurposeName} /><Info label="Estado final" value={terminalLabels[detail.terminalStatus]} /><Info label="Fecha final" value={formatDateTime(detail.terminalAt)} /><div className="md:col-span-3"><Info label="Descripción" value={detail.requirement.description ?? 'Sin descripción'} /></div></div></section><section><h3 className="font-semibold">Pasajeros</h3><div className="mt-2 rounded-lg border p-4">{detail.passengers.length ? <ul className="grid gap-2 sm:grid-cols-2">{detail.passengers.map((passenger) => <li key={passenger.travelPackageParticipantId}>{passenger.fullName}<span className="text-sm text-muted-foreground"> · {passenger.role}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Sin pasajeros asignados.</p>}</div></section><section><h3 className="font-semibold">Reserva</h3><div className="mt-2 grid gap-3 rounded-lg border p-4 md:grid-cols-3"><Info label="Proveedor" value={detail.reservation.providerName ?? 'No disponible'} /><Info label="Referencia del proveedor" value={detail.reservation.providerReference ?? '—'} /><Info label="Código de reserva" value={detail.reservation.reservationCode ?? '—'} /><Info label="Inicio del servicio" value={optionalDateTime(detail.reservation.serviceStartAt, formatDateTime)} /><Info label="Fin del servicio" value={optionalDateTime(detail.reservation.serviceEndAt, formatDateTime)} />{detail.detailPayload ? <div className="md:col-span-3"><Info label="Detalle operativo" value={<pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(detail.detailPayload, null, 2)}</pre>} /></div> : null}</div></section><section><h3 className="font-semibold">Compra</h3>{detail.purchases.length ? <div className="mt-2 space-y-3">{detail.purchases.map((purchase) => <div key={purchase.purchaseId} className="grid gap-3 rounded-lg border p-4 md:grid-cols-3"><Info label="Proveedor" value={purchase.providerName} /><Info label="Monto" value={money(purchase.amount, purchase.currency)} /><Info label="Impuesto" value={purchase.taxAmount ? money(purchase.taxAmount, purchase.currency) : '—'} /><Info label="Referencia" value={purchase.supplierReference ?? '—'} /><Info label="Factura de proveedor" value={purchase.supplierInvoiceNumber ?? '—'} /><Info label="Fecha de compra" value={formatDateTime(purchase.purchasedAt)} />{purchase.notes ? <div className="md:col-span-3"><Info label="Notas" value={purchase.notes} /></div> : null}</div>)}</div> : <p className="mt-2 rounded-lg border p-4 text-sm text-muted-foreground">No hay compra registrada para esta cancelación.</p>}</section><section><h3 className="font-semibold">Confirmación o cancelación</h3><div className="mt-2 grid gap-3 rounded-lg border p-4 md:grid-cols-3"><Info label="Referencia de confirmación" value={detail.terminalContext.confirmationReference ?? '—'} /><Info label="Voucher" value={detail.terminalContext.voucherReference ?? '—'} /><Info label="Tiquete" value={detail.terminalContext.ticketReference ?? '—'} />{detail.terminalContext.confirmationNotes ? <div className="md:col-span-3"><Info label="Notas" value={detail.terminalContext.confirmationNotes} /></div> : null}</div></section><section><h3 className="font-semibold">Evidencia</h3><div className="mt-2 rounded-lg border p-4">{detail.evidence.length ? <div className="space-y-2">{detail.evidence.map((evidence) => <div key={evidence.evidenceId} className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">{evidence.originalFilename} <span className="text-muted-foreground">· {evidence.mimeType} · {formatBytes(evidence.byteSize)}</span></span><Button type="button" size="sm" variant="outline" onClick={() => setAttachment({ id: evidence.evidenceId, originalFileName: evidence.originalFilename, mimeType: evidence.mimeType })}><FileText aria-hidden="true" size={16} /> Abrir</Button></div>)}</div> : <p className="text-sm text-muted-foreground">No hay evidencia asociada.</p>}</div></section></div> : null}<DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cerrar</Button></DialogFooter></DialogContent></Dialog>{attachment ? <AttachmentViewer attachments={[attachment]} resolveAttachmentUrl={resolveAttachmentUrl} onClose={() => setAttachment(null)} /> : null}</>;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><div className="mt-1 text-sm">{value}</div></div>; }
function money(amount: string, currency: string) { return formatFinanceMoneyDisplay(amount, currency); }
function optionalDateTime(value: string | null, formatDateTime: (value: string) => string) { return value ? formatDateTime(value) : '—'; }
function dateRange(start: string | null, end: string | null) { return start ? `${formatBusinessDate(start)}${end ? ` — ${formatBusinessDate(end)}` : ''}` : 'No disponible'; }
function formatBytes(bytes: number) { return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`; }

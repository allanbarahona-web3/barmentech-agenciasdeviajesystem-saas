'use client';

import { useEffect, useState } from 'react';
import { FileText, History } from 'lucide-react';
import AttachmentViewer, { type Attachment } from '@/components/attachment-viewer';
import { HistoryCustomDateControls, HistoryDetailDialog, HistoryError, HistoryEvidenceEmpty, HistoryEvidenceRow, HistoryFilterBar, HistoryInfo, HistoryMetadataGrid, HistoryPagination, HistoryPurchaseCard, HistoryPurchaseEmpty, HistoryTableShell, HistoryTableStateRow, HistoryTerminalState, HistoryTypedServiceDetails, TerminalStatusBadge } from '@/components/operations/operations-history-presentation';
import { getOperationalEvidenceAccess, getOperationalPassengerRoster, getOperationalTravelHistoryDetail, listOperationalTravelHistory, operationsErrorMessage, type OperationalPassengerRosterRow, type OperationalTravelHistoryDatePreset, type OperationalTravelHistoryDetail, type OperationalTravelHistoryItem, type OperationalTravelHistoryStatus, type OperationalWorkSourceCategory } from '@/lib/operations-api';
import { addFinanceMoneyDisplayValues, formatFinanceMoneyDisplay } from '@/lib/finance-money-display';
import { getAvailableTravelPackages, type TravelPackage } from '@/lib/travel-packages-api';
import { formatBusinessDate } from '@/shared/regional';
import { useTenantDateTimeFormatter } from '@/shared/regional/tenant-regional-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const sourceLabels: Record<Exclude<OperationalWorkSourceCategory, 'ALL'>, string> = { BASE_TRIP: 'Viaje base', ADDITIONAL_SERVICES: 'Servicio adicional' };

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
    void getAvailableTravelPackages().then((available) => { if (active) setTravelPackages(available); }).catch(() => { /* Current-trip history remains available if the optional selector cannot load. */ });
    return () => { active = false; };
  }, []);
  useEffect(() => { setSelectedTravelPackageId(travelPackageId); }, [travelPackageId]);
  useEffect(() => {
    let active = true;
    setParticipantId(''); setPage(1);
    void load(1, selectedTravelPackageId, '');
    if (!selectedTravelPackageId) return () => { active = false; };
    void getOperationalPassengerRoster(selectedTravelPackageId).then((response) => { if (active) setPassengerOptions(response.items); }).catch(() => { if (active) setPassengerOptions([]); });
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
    <HistoryFilterBar><Select aria-label="Fecha de finalización" value={datePreset} onChange={(event) => { setDatePreset(event.target.value as OperationalTravelHistoryDatePreset | ''); resetPage(); }}><option value="">Todas las fechas</option><option value="TODAY">Hoy</option><option value="LAST_7_DAYS">7 días</option><option value="LAST_30_DAYS">1 mes</option><option value="CUSTOM">Personalizado</option></Select><Select aria-label="Viaje" value={selectedTravelPackageId} onChange={(event) => { setSelectedTravelPackageId(event.target.value); resetPage(); }}><option value="">Todos los viajes</option>{[...travelPackages, ...(travelPackages.some((travelPackage) => travelPackage.id === travelPackageId) ? [] : [{ id: travelPackageId, name: 'Viaje actual' } as TravelPackage])].map((travelPackage) => <option key={travelPackage.id} value={travelPackage.id}>{travelPackage.name}</option>)}</Select><Select aria-label="Pasajero" value={participantId} onChange={(event) => { setParticipantId(event.target.value); resetPage(); }}><option value="">Todos los pasajeros</option>{passengerOptions.map((passenger) => <option key={passenger.travelPackageParticipantId} value={passenger.travelPackageParticipantId}>{passenger.fullName}</option>)}</Select><Select aria-label="Origen" value={sourceCategory} onChange={(event) => { setSourceCategory(event.target.value as OperationalWorkSourceCategory); resetPage(); }}><option value="ALL">Todos</option><option value="BASE_TRIP">Viaje base</option><option value="ADDITIONAL_SERVICES">Servicios adicionales</option></Select><Select aria-label="Estado final" value={terminalStatus} onChange={(event) => { setTerminalStatus(event.target.value as OperationalTravelHistoryStatus); resetPage(); }}><option value="ALL">Todos los estados</option><option value="CONFIRMED">Confirmado</option><option value="CANCELLED">Cancelado</option></Select><Button type="button" onClick={() => void load(1)}>Aplicar filtros</Button>{datePreset === 'CUSTOM' ? <HistoryCustomDateControls dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={(value) => { setDateFrom(value); resetPage(); }} onDateToChange={(value) => { setDateTo(value); resetPage(); }} /> : null}</HistoryFilterBar>
    <HistoryError message={error} />
    <HistoryTableShell title="Operaciones finalizadas" icon={<History aria-hidden="true" size={20} />} minWidth="min-w-[1050px]" footer={<HistoryPagination total={total} totalLabel="operaciones" page={page} totalPages={totalPages} loading={loading} onPrevious={() => void load(page - 1)} onNext={() => void load(page + 1)} />}><Table><TableHeader><TableRow><TableHead>Fecha final</TableHead><TableHead>Viaje / origen</TableHead><TableHead>Servicio</TableHead><TableHead>Pasajeros</TableHead><TableHead>Proveedor / reserva</TableHead><TableHead>Compra</TableHead><TableHead>Evidencia</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>{loading || items.length === 0 ? <HistoryTableStateRow colSpan={8} loading={loading} emptyMessage="No hay operaciones históricas para los filtros seleccionados." /> : items.map((item) => <TableRow key={item.fulfillmentId} className="cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50" role="button" tabIndex={0} onClick={() => void openDetail(item.fulfillmentId)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openDetail(item.fulfillmentId); } }}><TableCell className="text-sm text-muted-foreground">{formatDateTime(item.terminalAt)}</TableCell><TableCell><p className="font-medium">{item.trip.name ?? 'Viaje no disponible'}</p>{item.sourceCategory ? <Badge className="mt-1" variant="outline">{sourceLabels[item.sourceCategory]}</Badge> : null}</TableCell><TableCell><p className="font-medium">{item.requirement.servicePurposeName}</p><p className="max-w-60 truncate text-sm text-muted-foreground">{item.requirement.description ?? 'Sin descripción'}</p></TableCell><TableCell>{item.passengers.length ? <><p>{item.passengers.map((passenger) => passenger.fullName).join(', ')}</p><p className="text-xs text-muted-foreground">{item.passengerCount} {item.passengerCount === 1 ? 'pasajero' : 'pasajeros'}</p></> : 'Sin pasajeros'}</TableCell><TableCell><p>{item.reservation.providerName ?? '—'}</p><p className="text-xs text-muted-foreground">{item.reservation.reservationCode ?? item.reservation.providerReference ?? 'Sin reserva'}</p></TableCell><TableCell>{item.purchase ? <><p className="font-medium">Total: {money(addFinanceMoneyDisplayValues(item.purchase.amount, item.purchase.taxAmount), item.purchase.currency)}</p><p className="text-xs text-muted-foreground">Subtotal: {money(item.purchase.amount, item.purchase.currency)} · Impuesto: {money(item.purchase.taxAmount ?? '0', item.purchase.currency)}</p></> : '—'}</TableCell><TableCell>{item.evidenceCount > 0 ? <span className="inline-flex items-center gap-1"><FileText aria-hidden="true" size={15} />{item.evidenceCount}</span> : '—'}</TableCell><TableCell><TerminalStatusBadge status={item.terminalStatus} /></TableCell></TableRow>)}</TableBody></Table></HistoryTableShell>
    {(detail || detailLoading || detailError) ? <OperationalTravelHistoryDetailDialog detail={detail} loading={detailLoading} error={detailError} formatDateTime={formatDateTime} onClose={() => { setDetail(null); setDetailError(null); }} /> : null}
  </section>;
}

function OperationalTravelHistoryDetailDialog({ detail, loading, error, formatDateTime, onClose }: { detail: OperationalTravelHistoryDetail | null; loading: boolean; error: string | null; formatDateTime: (value: string) => string; onClose: () => void }) {
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  async function resolveAttachmentUrl(current: Attachment, _signal: AbortSignal) {
    if (!detail) throw new Error('Detalle histórico no disponible');
    return (await getOperationalEvidenceAccess(detail.trip.travelPackageId, detail.requirementId, detail.fulfillmentId, current.id)).url;
  }
  return <><HistoryDetailDialog title="Detalle histórico operativo" description="Registro de solo lectura de una operación finalizada." loading={loading} error={error} onClose={onClose}>{detail ? <div className="space-y-5"><section><h3 className="font-semibold">Viaje y servicio</h3><HistoryMetadataGrid><HistoryInfo label="Viaje" value={detail.trip.name ?? 'No disponible'} /><HistoryInfo label="Fechas" value={dateRange(detail.trip.departureDate, detail.trip.returnDate)} /><HistoryInfo label="Origen" value={detail.sourceCategory ? sourceLabels[detail.sourceCategory] : 'No disponible'} /><HistoryInfo label="Servicio" value={detail.requirement.servicePurposeName} /><div className="md:col-span-3"><HistoryInfo label="Descripción" value={detail.requirement.description ?? 'Sin descripción'} /></div></HistoryMetadataGrid></section><section><h3 className="font-semibold">Pasajeros</h3><div className="mt-2 rounded-lg border p-4">{detail.passengers.length ? <ul className="grid gap-2 sm:grid-cols-2">{detail.passengers.map((passenger) => <li key={passenger.travelPackageParticipantId}>{passenger.fullName}<span className="text-sm text-muted-foreground"> · {passenger.role}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Sin pasajeros asignados.</p>}</div></section><section><h3 className="font-semibold">Reserva y servicio</h3><HistoryMetadataGrid><HistoryInfo label="Proveedor" value={detail.reservation.providerName ?? 'No disponible'} /><HistoryInfo label="Referencia del proveedor" value={detail.reservation.providerReference ?? '—'} /><HistoryInfo label="Reserva" value={detail.reservation.reservationCode ?? '—'} /><HistoryInfo label="Inicio del servicio" value={optionalDateTime(detail.reservation.serviceStartAt, formatDateTime)} /><HistoryInfo label="Fin del servicio" value={optionalDateTime(detail.reservation.serviceEndAt, formatDateTime)} /></HistoryMetadataGrid></section><HistoryTypedServiceDetails servicePurposeCode={detail.requirement.servicePurposeCode} detailVersion={detail.detailVersion} detailPayload={detail.detailPayload} /><section><h3 className="font-semibold">Compra</h3>{detail.purchases.length ? <div className="space-y-3">{detail.purchases.map((purchase) => <HistoryPurchaseCard key={purchase.purchaseId} providerName={purchase.providerName} supplierReference={purchase.supplierReference} amount={purchase.amount} currency={purchase.currency} taxAmount={purchase.taxAmount} purchasedAt={purchase.purchasedAt} supplierInvoiceNumber={purchase.supplierInvoiceNumber} notes={purchase.notes} formatDateTime={formatDateTime} />)}</div> : <HistoryPurchaseEmpty />}</section><section><h3 className="font-semibold">Evidencia</h3><div className="mt-2 rounded-lg border p-4">{detail.evidence.length ? <div className="space-y-2">{detail.evidence.map((evidence) => <HistoryEvidenceRow key={evidence.evidenceId} fileName={evidence.originalFilename} mimeType={evidence.mimeType} evidenceType={evidence.evidenceType} byteSize={evidence.byteSize} purchaseId={evidence.purchaseId} onView={() => setAttachment({ id: evidence.evidenceId, originalFileName: evidence.originalFilename, mimeType: evidence.mimeType })} />)}</div> : <HistoryEvidenceEmpty />}</div></section><HistoryTerminalState status={detail.terminalStatus} terminalAt={detail.terminalAt} formatDateTime={formatDateTime} confirmationReference={detail.terminalContext.confirmationReference} voucherReference={detail.terminalContext.voucherReference} ticketReference={detail.terminalContext.ticketReference} notes={detail.terminalContext.confirmationNotes} /></div> : null}</HistoryDetailDialog>{attachment ? <AttachmentViewer attachments={[attachment]} resolveAttachmentUrl={resolveAttachmentUrl} onClose={() => setAttachment(null)} /> : null}</>;
}

function money(amount: string, currency: string) { return formatFinanceMoneyDisplay(amount, currency); }
function optionalDateTime(value: string | null, formatDateTime: (value: string) => string) { return value ? formatDateTime(value) : '—'; }
function dateRange(start: string | null, end: string | null) { return start ? `${formatBusinessDate(start)}${end ? ` — ${formatBusinessDate(end)}` : ''}` : 'No disponible'; }

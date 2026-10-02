'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, MapPin, Search, Users } from 'lucide-react';
import { listOperationsTravelPackages, operationsErrorMessage, type OperationsReadinessState, type OperationsTravelPackageSummary, type OperationsTravelType, type PaginatedOperationsTravelPackages } from '@/lib/operations-api';
import { formatBusinessDate } from '@/shared/regional';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageLoader } from '@/components/loading-spinner';

export function OperationsTravelPackageList({ travelType }: { travelType: OperationsTravelType }) {
  const router = useRouter();
  const title = travelType === 'MIGRATION' ? 'Migraciones' : 'Internacionales';
  const [data, setData] = useState<PaginatedOperationsTravelPackages | null>(null);
  const [page, setPage] = useState(1); const [searchDraft, setSearchDraft] = useState(''); const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    void listOperationsTravelPackages(travelType, page, search).then((result) => { if (active) setData(result); }).catch((reason) => { if (active) setError(operationsErrorMessage(reason, 'No se pudieron cargar los viajes.')); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search, travelType]);
  function submitSearch(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setPage(1); setSearch(searchDraft.trim()); }
  if (loading && !data) return <PageLoader message="Cargando viajes..." />;
  return <main className="app-shell p-5"><div className="mx-auto max-w-6xl space-y-5">
    <div className="rounded-2xl border border-border bg-card px-5 py-5 shadow-ui-xs sm:px-6"><Button type="button" variant="link" className="px-0" onClick={() => router.push('/operations')}>Operaciones</Button><div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><ClipboardCheck aria-hidden="true" size={21} /></span><div><p className="text-sm font-medium text-primary">Selección de viaje</p><h1 className="text-2xl font-semibold tracking-tight">{title}</h1></div></div><p className="mt-3 text-sm text-muted-foreground">Seleccione un viaje para revisar su preparación operativa.</p></div>{data ? <Badge variant="outline">{data.total} {data.total === 1 ? 'viaje' : 'viajes'}</Badge> : null}</div></div>
    <form className="flex max-w-xl gap-2" onSubmit={submitSearch}><div className="relative min-w-0 flex-1"><Search aria-hidden="true" size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Buscar por nombre o código" aria-label="Buscar viaje" /></div><Button type="submit" variant="outline" disabled={loading}>Buscar</Button></form>
    {error ? <Alert variant="destructive"><AlertTitle>No se pudieron cargar los viajes</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {data?.items.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{search ? 'No hay resultados para esta búsqueda.' : `No hay viajes de ${title.toLowerCase()} para mostrar.`}</CardContent></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data?.items.map((trip) => <OperationsTripCard key={trip.travelPackageId} trip={trip} onOpen={() => router.push(`/operations/trips/${trip.travelPackageId}`)} />)}</div>}
    {data && data.totalPages > 1 ? <div className="flex items-center justify-between gap-3 border-t border-border pt-4"><span className="text-sm text-muted-foreground">Página {data.page} de {data.totalPages} · {data.total} viajes</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={loading || data.page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft aria-hidden="true" />Anterior</Button><Button type="button" variant="outline" size="sm" disabled={loading || data.page >= data.totalPages} onClick={() => setPage((current) => current + 1)}>Siguiente<ChevronRight aria-hidden="true" /></Button></div></div> : null}
  </div></main>;
}

function OperationsTripCard({ trip, onOpen }: { trip: OperationsTravelPackageSummary; onOpen: () => void }) {
  const progressLabel = trip.operational.progressPercent === null ? 'Sin requerimientos' : `${trip.operational.progressPercent}%`;
  return <Card role="button" tabIndex={0} aria-label={`Abrir operaciones para ${trip.name}`} className="group cursor-pointer overflow-hidden border-t-4 border-t-primary/60 transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-accent/25 hover:shadow-ui-md focus-visible:ring-2 focus-visible:ring-ring" onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }}><CardHeader className="pb-3"><div className="min-w-0"><CardTitle className="truncate">{trip.name}</CardTitle><p className="mt-1 font-mono text-xs font-medium tracking-wide text-primary/80">{trip.packageCode}</p></div><ReadinessBadge state={trip.operational.readinessState} /></CardHeader><CardContent className="space-y-3 text-sm">{trip.destination ? <p className="flex items-center gap-2 text-muted-foreground"><MapPin aria-hidden="true" size={16} className="text-primary" />{trip.destination}</p> : null}<p className="flex items-center gap-2 text-muted-foreground"><CalendarDays aria-hidden="true" size={16} className="text-primary" />{formatBusinessDate(trip.departureDate)} — {formatBusinessDate(trip.returnDate)}</p><div className="rounded-lg bg-muted/50 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">Preparación operativa</span><span className="font-semibold tabular-nums">{progressLabel}</span></div>{trip.operational.progressPercent !== null ? <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, trip.operational.progressPercent))}%` }} /></div> : null}</div><div className="grid grid-cols-3 gap-2 border-t border-border pt-3"><Summary value={`${trip.operational.completePassengerCount}/${trip.passengerCount}`} label="Pasajeros completos" /><Summary value={trip.operational.criticalPending} label="Críticos pendientes" /><Summary value={trip.operational.criticalDueSoon} label="Vence pronto" /></div><p className="pt-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">Abrir vista operativa</p></CardContent></Card>;
}

function Summary({ value, label }: { value: string | number; label: string }) { return <div className="min-w-0 text-center"><div className="font-semibold tabular-nums">{value}</div><div className="mt-0.5 text-xs leading-4 text-muted-foreground">{label}</div></div>; }
function ReadinessBadge({ state }: { state: OperationsReadinessState }) { const values: Record<OperationsReadinessState, { label: string; variant: 'success' | 'warning' | 'destructive' | 'outline' }> = { READY: { label: 'Listo', variant: 'success' }, AT_RISK: { label: 'En riesgo', variant: 'warning' }, NOT_READY: { label: 'No listo', variant: 'destructive' }, NO_CRITICAL_REQUIREMENTS: { label: 'Sin críticos definidos', variant: 'outline' } }; const value = values[state]; return <Badge variant={value.variant}>{value.label}</Badge>; }

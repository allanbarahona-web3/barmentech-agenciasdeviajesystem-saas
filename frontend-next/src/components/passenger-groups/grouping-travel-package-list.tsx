'use client';

import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight, Layers3, MapPin, Search, UserMinus, Users } from 'lucide-react';
import { getHomeRouteForRole, getStoredSession } from '@/lib/auth-api';
import { listGroupingTravelPackages, type GroupingTravelPackageType, type PaginatedGroupingTravelPackages } from '@/lib/passenger-groups-api';
import { formatBusinessDate } from '@/shared/regional';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageLoader } from '@/components/loading-spinner';

const allowedRoles = ['ADMIN', 'AGENT', 'AGENTE', 'OPERACIONES', 'OPERATIONS'];

export function GroupingTravelPackageList({ travelType }: { travelType: GroupingTravelPackageType }) {
  const router = useRouter();
  const title = travelType === 'MIGRATION' ? 'Migraciones' : 'Internacionales';
  const [data, setData] = useState<PaginatedGroupingTravelPackages | null>(null);
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user?.id) {
      router.replace('/');
      return;
    }
    const role = String(session.user.role || '').toUpperCase();
    if (!allowedRoles.includes(role)) {
      router.replace(getHomeRouteForRole(role));
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    void listGroupingTravelPackages(travelType, page, search)
      .then((result) => { if (active) setData(result); })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los viajes.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, router, search, travelType]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  if (loading && !data) return <PageLoader message="Cargando viajes..." />;

  return (
    <main className="app-shell p-5">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-2xl border border-border bg-card px-5 py-5 shadow-ui-xs sm:px-6">
          <Button type="button" variant="link" className="px-0" onClick={() => router.push('/groups')}>Agrupaciones</Button>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Layers3 aria-hidden="true" size={21} /></span>
                <div><p className="text-sm font-medium text-primary">Selección de viaje</p><h1 className="text-2xl font-semibold tracking-tight">{title}</h1></div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">Seleccione un viaje para organizar sus pasajeros.</p>
            </div>
            {data ? <Badge variant="outline">{data.total} {data.total === 1 ? 'viaje' : 'viajes'}</Badge> : null}
          </div>
        </div>

        <form className="flex max-w-xl gap-2" onSubmit={submitSearch}>
          <div className="relative min-w-0 flex-1"><Search aria-hidden="true" size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Buscar por nombre o código" aria-label="Buscar viaje" /></div>
          <Button type="submit" variant="outline" disabled={loading}>Buscar</Button>
        </form>

        {error ? <Alert variant="destructive"><AlertTitle>No se pudieron cargar los viajes</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

        {data?.items.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No hay viajes de {title.toLowerCase()} para mostrar.</CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data?.items.map((trip) => (
              <Card
                key={trip.travelPackageId}
                role="button"
                tabIndex={0}
                aria-label={`Abrir grupos de pasajeros para ${trip.name}`}
                className="group cursor-pointer overflow-hidden border-t-4 border-t-primary/60 transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-accent/25 hover:shadow-ui-md focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => router.push(`/trips/${trip.travelPackageId}/groups`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    router.push(`/trips/${trip.travelPackageId}/groups`);
                  }
                }}
              >
                <CardHeader className="pb-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{trip.name}</CardTitle>
                    <p className="mt-1 font-mono text-xs font-medium tracking-wide text-primary/80">{trip.packageCode}</p>
                  </div>
                  <StatusBadge status={trip.status} />
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {trip.destination ? <p className="flex items-center gap-2 text-muted-foreground"><MapPin aria-hidden="true" size={16} className="text-primary" />{trip.destination}</p> : null}
                  <p className="flex items-center gap-2 text-muted-foreground"><CalendarDays aria-hidden="true" size={16} className="text-primary" />{formatBusinessDate(trip.departureDate)} — {formatBusinessDate(trip.returnDate)}</p>
                  <div className="grid grid-cols-3 gap-2 border-t border-border pt-4">
                    <SummaryCount value={trip.passengerCount} label="Pasajeros" icon={<Users aria-hidden="true" size={16} />} tone="default" />
                    <SummaryCount value={trip.groupedPassengerCount} label="Con agrupación" icon={<Layers3 aria-hidden="true" size={16} />} tone="grouped" />
                    <SummaryCount value={trip.ungroupedPassengerCount} label="Sin agrupación" icon={<UserMinus aria-hidden="true" size={16} />} tone="ungrouped" />
                  </div>
                  <p className="pt-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">Abrir grupos de pasajeros</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {data && data.totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-sm text-muted-foreground">Página {data.page} de {data.totalPages} · {data.total} viajes</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={loading || data.page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft aria-hidden="true" />Anterior</Button>
              <Button type="button" variant="outline" size="sm" disabled={loading || data.page >= data.totalPages} onClick={() => setPage((current) => current + 1)}>Siguiente<ChevronRight aria-hidden="true" /></Button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function SummaryCount({ value, label, icon, tone }: { value: number; label: string; icon: ReactNode; tone: 'default' | 'grouped' | 'ungrouped' }) {
  const toneClass = tone === 'grouped'
    ? 'bg-primary/10 text-primary'
    : tone === 'ungrouped'
      ? 'bg-muted text-muted-foreground'
      : 'bg-secondary text-secondary-foreground';
  return <div className="min-w-0 text-center"><span className={`mx-auto flex size-8 items-center justify-center rounded-lg ${toneClass}`}>{icon}</span><div className="mt-2 font-semibold tabular-nums">{value}</div><div className="mt-0.5 text-xs leading-4 text-muted-foreground">{label}</div></div>;
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'OPEN' ? 'success' : status === 'CANCELLED' ? 'outline' : 'warning';
  const label = status === 'OPEN' ? 'Abierto' : status === 'CANCELLED' ? 'Cancelado' : status === 'COMPLETED' ? 'Finalizado' : 'Cerrado';
  return <Badge variant={variant}>{label}</Badge>;
}

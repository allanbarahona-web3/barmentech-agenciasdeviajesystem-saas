'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { OperationalReadinessDashboard } from '@/components/operations/operational-readiness-dashboard';
import { OperationalUnifiedWorkspace } from '@/components/operations/operational-unified-workspace';
import { getTravelPackageById, type TravelPackage } from '@/lib/travel-packages-api';
import { formatBusinessDate } from '@/shared/regional';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { OperationsTimingProfiler } from '@/components/operations/operations-timing-profiler';

type Section = 'summary' | 'operation';
type TripContext = Pick<TravelPackage, 'id' | 'name' | 'packageCode' | 'departureDate' | 'returnDate' | 'destination' | 'status' | 'travelType'>;

export function OperationsTripShell({ travelPackageId }: { travelPackageId: string }) {
  const router = useRouter();
  const [section, setSection] = useState<Section>('summary');
  const [operationVisited, setOperationVisited] = useState(false);
  const [coverageVersion, setCoverageVersion] = useState(0);
  const [tripContext, setTripContext] = useState<TripContext | null>(null);
  useEffect(() => { let active = true; void getTravelPackageById(travelPackageId).then((trip) => { if (active) setTripContext(trip); }).catch(() => { if (active) setTripContext(null); }); return () => { active = false; }; }, [travelPackageId]);
  const selectSection = (next: Section) => { if (next === 'operation') setOperationVisited(true); setSection(next); };
  return <main className="app-shell p-5"><div className="mx-auto max-w-[1500px] space-y-5"><Button type="button" variant="link" className="px-0" onClick={() => router.push('/operations')}>Operaciones</Button><OperationsTimingProfiler id="operations-trip-header"><TripContextHeader trip={tripContext} /></OperationsTimingProfiler><WorkspaceNav section={section} onSelect={selectSection} />
    <div hidden={section !== 'summary'}><OperationsTimingProfiler id="operations-readiness-dashboard"><OperationalReadinessDashboard travelPackageId={travelPackageId} refreshVersion={coverageVersion} onViewPassengers={() => selectSection('operation')} /></OperationsTimingProfiler></div>
    {operationVisited ? <div hidden={section !== 'operation'}><OperationsTimingProfiler id="operations-unified-workspace"><OperationalUnifiedWorkspace travelPackageId={travelPackageId} onCoverageChanged={() => setCoverageVersion((version) => version + 1)} /></OperationsTimingProfiler></div> : null}
  </div></main>;
}

function WorkspaceNav({ section, onSelect }: { section: Section; onSelect: (section: Section) => void }) { return <nav className="flex flex-wrap gap-2" aria-label="Secciones del espacio operativo"><Button type="button" size="sm" variant={section === 'summary' ? 'default' : 'outline'} aria-current={section === 'summary' ? 'page' : undefined} onClick={() => onSelect('summary')}>Resumen</Button><Button type="button" size="sm" variant={section === 'operation' ? 'default' : 'outline'} aria-current={section === 'operation' ? 'page' : undefined} onClick={() => onSelect('operation')}>Operación</Button></nav>; }

function TripContextHeader({ trip }: { trip: TripContext | null }) { return <Card aria-label="Contexto del viaje"><CardContent className="py-4">{trip ? <div className="space-y-1"><p className="text-sm font-medium text-primary">Espacio operativo</p><h1 className="text-xl font-semibold">{trip.name}</h1><p className="text-sm text-muted-foreground"><span className="font-mono">{trip.packageCode}</span> · {formatBusinessDate(trip.departureDate)} — {formatBusinessDate(trip.returnDate)}</p><p className="text-sm text-muted-foreground">{trip.destination}</p></div> : <div className="space-y-2" aria-busy="true" aria-label="Cargando contexto del viaje"><Skeleton className="h-4 w-28" /><Skeleton className="h-6 w-64" /><Skeleton className="h-4 w-80" /></div>}</CardContent></Card>; }

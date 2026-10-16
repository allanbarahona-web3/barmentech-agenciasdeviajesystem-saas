'use client';

import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { PassengerGroupBadge } from '@/components/passenger-group-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getPassengerGroup, type PassengerGroup } from '@/lib/passenger-groups-api';
import { operationsErrorMessage } from '@/lib/operations-api';

export interface PassengerGroupSummary {
  id: string;
  name: string;
  color: string | null;
  serviceCode: string | null;
  serviceName: string | null;
}

const passengerGroupDetailCache = new Map<string, PassengerGroup>();
const passengerGroupDetailLoads = new Map<string, Promise<PassengerGroup>>();

function cacheKey(travelPackageId: string, groupId: string) {
  return `${travelPackageId}:${groupId}`;
}

function loadPassengerGroupDetail(travelPackageId: string, groupId: string) {
  const key = cacheKey(travelPackageId, groupId);
  const cached = passengerGroupDetailCache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = passengerGroupDetailLoads.get(key);
  if (pending) return pending;
  const request = getPassengerGroup(travelPackageId, groupId)
    .then((detail) => {
      passengerGroupDetailCache.set(key, detail);
      return detail;
    })
    .finally(() => passengerGroupDetailLoads.delete(key));
  passengerGroupDetailLoads.set(key, request);
  return request;
}

/** Lazy, ephemeral detail view shared by dashboard and selected-passenger Operations forms. */
export function PassengerGroupContextAction({ travelPackageId, group, className }: { travelPackageId: string; group: PassengerGroupSummary; className?: string }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<PassengerGroup | null>(() => passengerGroupDetailCache.get(cacheKey(travelPackageId, group.id)) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setDetail(await loadPassengerGroupDetail(travelPackageId, group.id));
    } catch (reason) {
      setError(operationsErrorMessage(reason, 'No se pudo cargar la información del grupo.'));
    } finally {
      setLoading(false);
    }
  }

  function openContext() {
    setOpen(true);
    if (!detail) void load();
  }

  return <>
    <Button type="button" variant="ghost" size="icon" className={className} aria-label={`Ver contexto de ${group.name}`} title="Ver contexto del grupo" onClick={openContext}><Info aria-hidden="true" /></Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><PassengerGroupBadge name={group.name} color={group.color} /></DialogTitle><DialogDescription>Contexto operativo del grupo de pasajeros.</DialogDescription></DialogHeader>
        {loading ? <p className="py-4 text-sm text-muted-foreground">Cargando información del grupo...</p> : null}
        {error ? <div className="space-y-2 py-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button type="button" size="sm" variant="outline" onClick={() => void load()}>Reintentar</Button></div> : null}
        {!loading && !error && detail ? <PassengerGroupContextDetail detail={detail} /> : null}
      </DialogContent>
    </Dialog>
  </>;
}

/** The active-filter strip intentionally loads only the one explicitly selected group. */
export function PassengerGroupContextStrip({ travelPackageId, group }: { travelPackageId: string; group: PassengerGroupSummary }) {
  const key = cacheKey(travelPackageId, group.id);
  const [detail, setDetail] = useState<PassengerGroup | null>(() => passengerGroupDetailCache.get(key) ?? null);
  const [loading, setLoading] = useState(!passengerGroupDetailCache.has(key));
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setDetail(await loadPassengerGroupDetail(travelPackageId, group.id));
    } catch (reason) {
      setError(operationsErrorMessage(reason, 'No se pudo cargar la información del grupo.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (!passengerGroupDetailCache.has(key)) void load(); }, [key]);

  return <section className="rounded-lg border border-border bg-muted/30 px-3 py-2" aria-label="Contexto del grupo">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><PassengerGroupBadge name={group.name} color={group.color} /><span className="text-sm text-muted-foreground">{serviceName(detail, group)}</span></div>{detail ? <span className="text-sm text-muted-foreground">{detail.members.length} {detail.members.length === 1 ? 'pasajero' : 'pasajeros'}</span> : null}</div>
    {loading ? <p className="mt-2 text-sm text-muted-foreground">Cargando información del grupo...</p> : null}
    {error ? <div className="mt-2 flex flex-wrap items-center gap-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button type="button" size="sm" variant="outline" onClick={() => void load()}>Reintentar</Button></div> : null}
    {!loading && !error && detail ? <p className="mt-2 text-sm"><span className="text-muted-foreground">Indicación:</span> {detail.notes?.trim() || 'Sin indicaciones adicionales.'}</p> : null}
  </section>;
}

function PassengerGroupContextDetail({ detail }: { detail: PassengerGroup }) {
  return <dl className="space-y-4 text-sm">
    <div><dt className="text-muted-foreground">Servicio</dt><dd className="mt-1 font-medium">{detail.serviceName || 'Servicio no especificado'}</dd></div>
    <div><dt className="text-muted-foreground">Integrantes</dt><dd className="mt-1"><ul className="space-y-1">{detail.members.map((member) => <li key={member.travelPackageParticipantId}>{member.fullName}</li>)}</ul></dd></div>
    <div><dt className="text-muted-foreground">Indicación</dt><dd className="mt-1 whitespace-pre-wrap">{detail.notes?.trim() || 'Sin indicaciones adicionales.'}</dd></div>
  </dl>;
}

function serviceName(detail: PassengerGroup | null, group: PassengerGroupSummary) {
  return detail?.serviceName || group.serviceName || 'Servicio no especificado';
}

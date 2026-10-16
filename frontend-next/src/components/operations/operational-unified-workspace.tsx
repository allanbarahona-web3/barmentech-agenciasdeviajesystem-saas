'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Baby, ChevronDown, ChevronLeft, ChevronRight, Crown, UserRound, X } from 'lucide-react';
import { additionalServicesContractTagKey, buildAdditionalServicesContractTagClasses } from '@/lib/additional-services-contract-tags';
import { getOperationalPassengerDashboard, operationsErrorMessage, type OperationalPassengerDashboardItem, type OperationalPassengerDashboardRequirement, type OperationalPassengerDashboardSource, type OperationalPassengerDashboardStatus } from '@/lib/operations-api';
import { OperationalFulfillmentsWorkspace } from '@/components/operations/operational-fulfillments-workspace';
import { PassengerGroupBadge } from '@/components/passenger-group-badge';
import { PassengerGroupContextAction, PassengerGroupContextStrip, type PassengerGroupSummary } from '@/components/operations/passenger-group-context-action';
import { PassengerDocumentsAction } from '@/components/operations/passenger-operational-context';
import { PassengerOperationalNotesAction } from '@/components/operations/passenger-operational-notes-action';
import { operationalPassengerRoleLabel, operationalServiceLabel, operationalSourceLabel, operationalStatusLabel } from '@/lib/operations-presentation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

type ManagedRequirement = { requirement: OperationalPassengerDashboardRequirement; participantId: string; passengerGroups: PassengerGroupSummary[] };

export function OperationalUnifiedWorkspace({ travelPackageId, onCoverageChanged }: { travelPackageId: string; onCoverageChanged?: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getOperationalPassengerDashboard>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [contractId, setContractId] = useState<string | null>(null);
  const [passengerGroupId, setPassengerGroupId] = useState<string | null>(null);
  const [source, setSource] = useState<OperationalPassengerDashboardSource | undefined>();
  const [status, setStatus] = useState<OperationalPassengerDashboardStatus | undefined>();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [managed, setManaged] = useState<ManagedRequirement | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (!trimmed) { setSearch(''); setPage(1); return; }
    if (trimmed.length < 2) return;
    const timer = window.setTimeout(() => { setSearch(trimmed); setPage(1); }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getOperationalPassengerDashboard(travelPackageId, { page, pageSize: 20, search: search || undefined, contractId: contractId ?? undefined, passengerGroupId: passengerGroupId ?? undefined, source, status });
      if (currentRequest === requestId.current) setData(result);
    } catch (reason) {
      if (currentRequest === requestId.current) setError(operationsErrorMessage(reason, 'No se pudo cargar el tablero de pasajeros.'));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [contractId, page, passengerGroupId, refreshVersion, search, source, status, travelPackageId]);
  useEffect(() => { void load(); }, [load]);

  const contractTagClasses = useMemo(() => buildAdditionalServicesContractTagClasses([{ contractSources: data?.facets.contracts ?? [] }]), [data?.facets.contracts]);
  const activeContract = data?.facets.contracts.find((contract) => contract.contractId === contractId);
  const activeGroup = data?.facets.passengerGroups.find((group) => group.id === passengerGroupId);
  const resetPage = () => setPage(1);
  const toggleExpanded = (participantId: string) => setExpanded((current) => { const next = new Set(current); if (next.has(participantId)) next.delete(participantId); else next.add(participantId); return next; });
  const toggleContract = (nextContractId: string) => { setContractId((current) => current === nextContractId ? null : nextContractId); resetPage(); };
  const selectGroup = (nextGroupId: string) => { setPassengerGroupId((current) => nextGroupId && current !== nextGroupId ? nextGroupId : null); resetPage(); };

  if (managed) return <OperationalFulfillmentsWorkspace travelPackageId={travelPackageId} requirementId={managed.requirement.requirementId} requirementCoverage={{ fulfilledPassengerCount: managed.requirement.confirmationStatus === 'CONFIRMED' ? 1 : 0, totalPassengerCount: managed.requirement.sharedPassengerCount }} participantScope={managed.participantId} participantGroups={managed.passengerGroups} onBack={() => setManaged(null)} onCoverageChanged={() => { setRefreshVersion((version) => version + 1); onCoverageChanged?.(); }} />;

  return <section className="space-y-4" aria-label="Operaciones por pasajero">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">Operaciones</h2><p className="text-sm text-muted-foreground">Gestiona cada requerimiento desde el pasajero al que aplica.</p></div>{data?.summary ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Resumen operativo">{[['Pasajeros', data.summary.passengerCount], ['Requerimientos', data.summary.requirementCount], ['Pendientes', data.summary.pendingCount], ['Confirmados', data.summary.confirmedCount]].map(([label, value]) => <Card key={String(label)} className="min-w-24"><CardContent className="px-3 py-2"><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-semibold">{value}</p></CardContent></Card>)}</div> : null}</div>
    <Card><CardContent className="space-y-3 py-4"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar pasajero o identificación" aria-label="Buscar pasajero" /><Select value={passengerGroupId ?? ''} onChange={(event) => selectGroup(event.target.value)} aria-label="Filtrar por grupo"><option value="">Todos los grupos</option>{data?.facets.passengerGroups.map((group) => <option key={group.id} value={group.id}>{group.name}{group.serviceName ? ` · ${group.serviceName}` : ''}</option>)}</Select><Select value={source ?? ''} onChange={(event) => { setSource((event.target.value || undefined) as OperationalPassengerDashboardSource | undefined); resetPage(); }} aria-label="Filtrar por origen"><option value="">Todos los orígenes</option>{data?.facets.sources.map((facet) => <option key={facet.value} value={facet.value}>{operationalSourceLabel(facet.value)}</option>)}</Select><Select value={status ?? ''} onChange={(event) => { setStatus((event.target.value || undefined) as OperationalPassengerDashboardStatus | undefined); resetPage(); }} aria-label="Filtrar por estado"><option value="">Todos los estados</option>{data?.facets.statuses.map((facet) => <option key={facet} value={facet}>{operationalStatusLabel(facet)}</option>)}</Select><Button type="button" variant="outline" onClick={() => { setSearchInput(''); setSearch(''); setContractId(null); setPassengerGroupId(null); setSource(undefined); setStatus(undefined); resetPage(); }}>Limpiar filtros</Button></div>
      {(activeContract || activeGroup) ? <div className="flex flex-wrap gap-2" aria-label="Filtros activos">{activeContract ? <ActiveFilter label={`Contrato: ${activeContract.contractNumber}`} onClear={() => { setContractId(null); resetPage(); }} /> : null}{activeGroup ? <ActiveFilter label={`Grupo: ${activeGroup.name}`} onClear={() => { setPassengerGroupId(null); resetPage(); }} /> : null}</div> : null}
      {activeGroup ? <PassengerGroupContextStrip key={activeGroup.id} travelPackageId={travelPackageId} group={activeGroup} /> : null}
    </CardContent></Card>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {loading && !data ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Cargando pasajeros...</CardContent></Card> : null}
    {!loading && data && !data.items.length ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No se encontraron pasajeros con estos filtros.</CardContent></Card> : null}
    {data?.items.map((item) => <PassengerAccordion key={item.participant.travelPackageParticipantId} travelPackageId={travelPackageId} item={item} open={expanded.has(item.participant.travelPackageParticipantId)} contractTagClasses={contractTagClasses} onToggle={() => toggleExpanded(item.participant.travelPackageParticipantId)} onContract={toggleContract} onGroup={selectGroup} onManage={(requirement) => setManaged({ requirement, participantId: item.participant.travelPackageParticipantId, passengerGroups: item.passengerGroups })} />)}
    {data && data.pagination.total > 0 ? <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-muted-foreground">{(data.pagination.page - 1) * data.pagination.pageSize + 1}–{Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)} de {data.pagination.total} pasajeros</p>{data.pagination.totalPages > 1 ? <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft aria-hidden="true" />Anterior</Button><Button type="button" size="sm" variant="outline" disabled={page >= data.pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Siguiente<ChevronRight aria-hidden="true" /></Button></div> : null}</div> : null}
  </section>;
}

function PassengerAccordion({ travelPackageId, item, open, contractTagClasses, onToggle, onContract, onGroup, onManage }: { travelPackageId: string; item: OperationalPassengerDashboardItem; open: boolean; contractTagClasses: ReadonlyMap<string, string>; onToggle: () => void; onContract: (contractId: string) => void; onGroup: (groupId: string) => void; onManage: (requirement: OperationalPassengerDashboardRequirement) => void }) {
  const participant = item.participant;
  const documentRequirement = item.requirements[0];
  return <Card><CardContent className="p-0"><div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center"><button type="button" className="flex min-w-0 flex-1 items-start gap-3 text-left" aria-expanded={open} onClick={onToggle}><RoleIcon role={participant.role} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-semibold">{participant.fullName}{participant.ageAtTrip !== null ? ` · ${participant.ageAtTrip} años` : ''}</span><span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium">{operationalPassengerRoleLabel(participant.role)}</span></span><span className="mt-1 block text-sm text-muted-foreground">{participant.identification ? `ID ${participant.identification}` : 'Sin identificación registrada'}</span><span className="mt-1 block text-sm text-muted-foreground">{item.summary.requirementCount} requerimientos · {item.summary.pendingCount} pendientes · {item.summary.confirmedCount} confirmados</span></span><ChevronDown aria-hidden="true" className={`mt-1 size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} /></button><div className="flex flex-wrap items-center gap-1">{item.contractSources.map((contract) => <button key={contract.contractId} type="button" onClick={() => onContract(contract.contractId)} className={`rounded-md border bg-background px-2 py-1 text-xs font-medium hover:bg-muted ${contractTagClasses.get(additionalServicesContractTagKey(contract)) ?? ''}`}>{contract.contractNumber}</button>)}{item.passengerGroups.map((group) => <span key={group.id} className="inline-flex items-center gap-0.5"><button type="button" onClick={() => onGroup(group.id)} className="rounded-full transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><PassengerGroupBadge name={group.name} color={group.color} /></button><PassengerGroupContextAction travelPackageId={travelPackageId} group={group} className="size-7" /></span>)}</div><div className="flex flex-wrap gap-2">{documentRequirement ? <PassengerDocumentsAction requirementId={documentRequirement.requirementId} participantContextKey={`passenger:${participant.travelPackageParticipantId}`} passengerName={participant.fullName} label="Ver documentos" className="shrink-0" /> : <Button type="button" size="sm" variant="outline" disabled>Ver documentos</Button>}<PassengerOperationalNotesAction travelPackageId={travelPackageId} participantId={participant.travelPackageParticipantId} passengerName={participant.fullName} operationalNoteCount={item.operationalNoteCount} /></div></div>
    {open ? <div className="border-t border-border px-4 py-4">{item.requirements.length ? <div className="space-y-2">{item.requirements.map((requirement) => <RequirementRow key={requirement.requirementId} requirement={requirement} onManage={onManage} />)}</div> : <p className="py-4 text-center text-sm text-muted-foreground">No hay requerimientos para este pasajero.</p>}</div> : null}
  </CardContent></Card>;
}

function RequirementRow({ requirement, onManage }: { requirement: OperationalPassengerDashboardRequirement; onManage: (requirement: OperationalPassengerDashboardRequirement) => void }) {
  return <article className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{operationalServiceLabel(requirement.serviceName)}</h3><Badge variant="outline" className={operationalSourceLabel(requirement.sourceType) === 'Contrato base' ? 'border-primary/60 text-primary' : 'border-success/70 text-success'}>{operationalSourceLabel(requirement.sourceType)}</Badge><Badge variant={requirement.status === 'CONFIRMED' ? 'success' : requirement.status === 'CANCELLED' ? 'destructive' : requirement.status === 'IN_PROGRESS' ? 'info' : 'outline'}>{operationalStatusLabel(requirement.status)}</Badge></div><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>Reserva: {requirement.reservationStatus === 'RESERVED' ? 'Reservada' : 'Pendiente'}</span><span>Compra: {requirement.purchaseStatus === 'PURCHASED' ? 'Registrada' : 'Pendiente'}</span><span>Confirmación: {requirement.confirmationStatus === 'CONFIRMED' ? 'Confirmada' : 'Pendiente'}</span>{requirement.sharedPassengerCount > 1 ? <span>Compartido con {requirement.sharedPassengerCount} pasajeros</span> : null}</div></div><Button type="button" className="shrink-0" onClick={() => onManage(requirement)}>Gestionar</Button></article>;
}

function RoleIcon({ role }: { role: string }) { const [Icon, color] = role === 'HOLDER' ? [Crown, 'text-primary'] : role === 'COMPANION' ? [UserRound, 'text-success'] : [Baby, 'text-warning']; return <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${color}`} />; }
function ActiveFilter({ label, onClear }: { label: string; onClear: () => void }) { return <button type="button" className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs" onClick={onClear}>{label}<X aria-hidden="true" className="size-3" /><span className="sr-only">Quitar filtro</span></button>; }

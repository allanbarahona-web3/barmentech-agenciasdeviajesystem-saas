'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers3 } from 'lucide-react';
import { getHomeRouteForRole, getStoredSession } from '@/lib/auth-api';
import { getSelectableAdditionalServices, type SelectableAdditionalService } from '@/lib/additional-services-catalog-api';
import {
  addPassengerGroupMembers,
  archivePassengerGroup,
  createPassengerGroup,
  getTravelPackageParticipants,
  listPassengerGroups,
  removePassengerGroupMembers,
  updatePassengerGroup,
  type PassengerGroup,
  type TravelPackageRosterParticipant,
} from '@/lib/passenger-groups-api';
import { isPassengerGroupableServiceCode, membershipDelta } from '@/lib/passenger-groups';
import {
  ALL_PASSENGER_GROUP_SERVICES,
  buildPassengerGroupsBoard,
  shouldAddPassengerGroupMember,
} from '@/lib/passenger-groups-board';
import { getTravelPackageById, type TravelPackage } from '@/lib/travel-packages-api';
import { PassengerGroupsBoard } from '@/components/passenger-groups/passenger-groups-board';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/patterns/form-field';
import { FormSheet } from '@/components/patterns/form-sheet';
import { PageLoader } from '@/components/loading-spinner';

const GROUP_COLORS = [
  { label: 'Azul', value: '#2563eb' },
  { label: 'Verde', value: '#16a34a' },
  { label: 'Naranja', value: '#ea580c' },
  { label: 'Morado', value: '#9333ea' },
  { label: 'Rosa', value: '#db2777' },
  { label: 'Gris', value: '#64748b' },
];

type GroupForm = {
  additionalServiceCatalogId: string;
  name: string;
  color: string | null;
  notes: string;
};

function errorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('PASSENGER_GROUP_ARCHIVED_IMMUTABLE')) {
    return 'Este grupo está archivado y no puede modificarse.';
  }
  if (message.includes('PASSENGER_GROUP_CATALOG_INACTIVE')) {
    return 'El servicio seleccionado ya no está activo.';
  }
  if (message.includes('PASSENGER_GROUP_CATALOG_CODE_NOT_ALLOWED')) {
    return 'Este servicio no está disponible para grupos de pasajeros.';
  }
  if (message.includes('PASSENGER_GROUP_PARTICIPANT_NOT_FOUND_IN_TRAVEL_PACKAGE')) {
    return 'Uno o más pasajeros ya no pertenecen a este viaje.';
  }
  return message || fallback;
}

function memberNames(group: PassengerGroup): string {
  const visible = group.members.slice(0, 5).map((member) => member.fullName);
  const remaining = group.members.length - visible.length;
  return remaining > 0 ? `${visible.join(', ')} y ${remaining} más` : visible.join(', ');
}

export function PassengerGroupsWorkspace({ travelPackageId }: { travelPackageId: string }) {
  const router = useRouter();
  const [travelPackage, setTravelPackage] = useState<TravelPackage | null>(null);
  const [groups, setGroups] = useState<PassengerGroup[]>([]);
  const [participants, setParticipants] = useState<TravelPackageRosterParticipant[]>([]);
  const [catalog, setCatalog] = useState<SelectableAdditionalService[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState(ALL_PASSENGER_GROUP_SERVICES);
  const [showArchived, setShowArchived] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingGroup, setEditingGroup] = useState<PassengerGroup | null>(null);
  const [form, setForm] = useState<GroupForm>({
    additionalServiceCatalogId: '',
    name: '',
    color: null,
    notes: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);
  const [assigningGroup, setAssigningGroup] = useState<PassengerGroup | null>(null);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<Set<string>>(new Set());
  const [participantSearch, setParticipantSearch] = useState('');
  const [savingMembers, setSavingMembers] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<PassengerGroup | null>(null);
  const [archiving, setArchiving] = useState(false);

  const groupableCatalog = useMemo(
    () => catalog.filter((item) => isPassengerGroupableServiceCode(item.code)),
    [catalog],
  );

  const serviceOptions = useMemo(() => {
    const options = new Map<string, string>();
    groupableCatalog.forEach((item) => options.set(item.code, item.name));
    groups.forEach((group) => options.set(group.serviceCode, group.serviceName));
    return [...options.entries()].sort((left, right) => left[1].localeCompare(right[1], 'es'));
  }, [groupableCatalog, groups]);

  const activeGroups = useMemo(
    () => groups.filter((group) => group.status === 'ACTIVE' && (
      serviceFilter === ALL_PASSENGER_GROUP_SERVICES || group.serviceCode === serviceFilter
    )),
    [groups, serviceFilter],
  );
  const archivedGroups = useMemo(
    () => groups.filter((group) => group.status === 'ARCHIVED' && (
      serviceFilter === ALL_PASSENGER_GROUP_SERVICES || group.serviceCode === serviceFilter
    )),
    [groups, serviceFilter],
  );
  const board = useMemo(
    () => buildPassengerGroupsBoard(groups, participants, serviceFilter),
    [groups, participants, serviceFilter],
  );
  const matchingParticipants = useMemo(() => {
    const needle = participantSearch.trim().toLocaleLowerCase('es');
    return participants.filter((participant) =>
      !needle || participant.client.fullName.toLocaleLowerCase('es').includes(needle),
    );
  }, [participants, participantSearch]);

  async function loadWorkspace() {
    try {
      setLoading(true);
      setPageError(null);
      const packageData = await getTravelPackageById(travelPackageId);
      setTravelPackage(packageData);
      if (!['INTERNATIONAL', 'MIGRATION'].includes(packageData.travelType)) return;

      const [groupData, rosterData, catalogData] = await Promise.all([
        listPassengerGroups(travelPackageId),
        getTravelPackageParticipants(travelPackageId),
        getSelectableAdditionalServices(),
      ]);
      setGroups(groupData);
      setParticipants(rosterData);
      setCatalog(catalogData);
    } catch (error) {
      setPageError(errorMessage(error, 'No se pudieron cargar los grupos de pasajeros.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user?.id) {
      router.replace('/');
      return;
    }
    const role = String(session.user.role || '').toUpperCase();
    if (!['ADMIN', 'AGENT', 'AGENTE', 'OPERACIONES', 'OPERATIONS'].includes(role)) {
      router.replace(getHomeRouteForRole(role));
      return;
    }
    void loadWorkspace();
    // The route parameter is stable for the lifetime of this workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, travelPackageId]);

  function replaceGroup(updatedGroup: PassengerGroup) {
    setGroups((current) => {
      const existingIndex = current.findIndex((group) => group.id === updatedGroup.id);
      if (existingIndex === -1) return [...current, updatedGroup];
      return current.map((group) => group.id === updatedGroup.id ? updatedGroup : group);
    });
  }

  function closeForm() {
    if (savingGroup) return;
    setFormMode(null);
    setEditingGroup(null);
    setFormError(null);
  }

  function openCreateForm() {
    setEditingGroup(null);
    setForm({
      additionalServiceCatalogId: groupableCatalog.find((item) => item.code === serviceFilter)?.id ?? groupableCatalog[0]?.id ?? '',
      name: '',
      color: null,
      notes: '',
    });
    setFormError(null);
    setFormMode('create');
  }

  function openEditForm(group: PassengerGroup) {
    setEditingGroup(group);
    setForm({
      additionalServiceCatalogId: group.additionalServiceCatalogId,
      name: group.name,
      color: group.color,
      notes: group.notes ?? '',
    });
    setFormError(null);
    setFormMode('edit');
  }

  async function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();
    if (!form.additionalServiceCatalogId || !name) {
      setFormError('Seleccione un servicio e indique el nombre del grupo.');
      return;
    }

    try {
      setSavingGroup(true);
      setFormError(null);
      const input = {
        additionalServiceCatalogId: form.additionalServiceCatalogId,
        name,
        color: form.color,
        notes: form.notes.trim() || null,
      };
      if (formMode === 'edit' && editingGroup) {
        replaceGroup(await updatePassengerGroup(travelPackageId, editingGroup.id, input));
      } else {
        replaceGroup(await createPassengerGroup(travelPackageId, input));
      }
      closeForm();
    } catch (error) {
      setFormError(errorMessage(error, 'No se pudo guardar el grupo.'));
    } finally {
      setSavingGroup(false);
    }
  }

  function openAssignment(group: PassengerGroup) {
    setAssigningGroup(group);
    setSelectedParticipantIds(new Set(group.members.map((member) => member.travelPackageParticipantId)));
    setParticipantSearch('');
  }

  function toggleParticipant(participantId: string) {
    setSelectedParticipantIds((current) => {
      const next = new Set(current);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  }

  async function saveAssignment() {
    if (!assigningGroup) return;
    const { toAdd, toRemove } = membershipDelta(
      assigningGroup.members.map((member) => member.travelPackageParticipantId),
      selectedParticipantIds,
    );
    if (toAdd.length === 0 && toRemove.length === 0) {
      setAssigningGroup(null);
      return;
    }

    try {
      setSavingMembers(true);
      if (toAdd.length > 0) {
        replaceGroup(await addPassengerGroupMembers(travelPackageId, assigningGroup.id, toAdd));
      }
      if (toRemove.length > 0) {
        replaceGroup(await removePassengerGroupMembers(travelPackageId, assigningGroup.id, toRemove));
      }
      setAssigningGroup(null);
    } catch (error) {
      setPageError(errorMessage(error, 'No se pudieron actualizar los pasajeros del grupo.'));
    } finally {
      setSavingMembers(false);
    }
  }

  async function archiveGroup() {
    if (!archiveTarget) return;
    try {
      setArchiving(true);
      replaceGroup(await archivePassengerGroup(travelPackageId, archiveTarget.id));
      setArchiveTarget(null);
    } catch (error) {
      setPageError(errorMessage(error, 'No se pudo archivar el grupo.'));
    } finally {
      setArchiving(false);
    }
  }

  async function addParticipantToGroup(group: PassengerGroup, participantId: string) {
    const currentGroup = groups.find((candidate) => candidate.id === group.id) ?? group;
    const currentMemberIds = new Set(currentGroup.members.map((member) => member.travelPackageParticipantId));
    if (!shouldAddPassengerGroupMember(currentMemberIds, participantId)) return;

    try {
      setSavingMembers(true);
      replaceGroup(await addPassengerGroupMembers(travelPackageId, group.id, [participantId]));
    } catch (error) {
      setPageError(errorMessage(error, 'No se pudo agregar el pasajero al grupo.'));
    } finally {
      setSavingMembers(false);
    }
  }

  async function removeParticipantFromGroup(group: PassengerGroup, participantId: string) {
    try {
      setSavingMembers(true);
      replaceGroup(await removePassengerGroupMembers(travelPackageId, group.id, [participantId]));
    } catch (error) {
      setPageError(errorMessage(error, 'No se pudo quitar el pasajero del grupo.'));
    } finally {
      setSavingMembers(false);
    }
  }

  if (loading) return <PageLoader message="Cargando grupos de pasajeros..." />;

  if (!travelPackage) {
    return <WorkspaceError message={pageError ?? 'No se encontró el viaje solicitado.'} onBack={() => router.push('/groups')} />;
  }

  if (!['INTERNATIONAL', 'MIGRATION'].includes(travelPackage.travelType)) {
    return <WorkspaceError message="Los grupos de pasajeros están disponibles únicamente para viajes internacionales o de migración." onBack={() => router.push('/groups')} />;
  }

  const groupingListPath = travelPackage.travelType === 'MIGRATION'
    ? '/groups/migration'
    : '/groups/international';
  const groupingCategory = travelPackage.travelType === 'MIGRATION'
    ? 'Migraciones'
    : 'Internacionales';

  const editableCatalog = editingGroup && !groupableCatalog.some((item) => item.id === editingGroup.additionalServiceCatalogId)
    ? [{ id: editingGroup.additionalServiceCatalogId, code: editingGroup.serviceCode, name: `${editingGroup.serviceName} (inactivo)` }, ...groupableCatalog]
    : groupableCatalog;

  return (
    <main className="app-shell p-5">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Button type="button" variant="link" className="mb-2 px-0" onClick={() => router.push(groupingListPath)}>
              Agrupaciones / {groupingCategory}
            </Button>
            <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Layers3 aria-hidden="true" size={19} /></span><h1 className="text-2xl font-semibold tracking-tight">Grupos de pasajeros</h1></div>
            <p className="mt-1 text-sm text-muted-foreground">
              {travelPackage.name} · {travelPackage.packageCode}
              {travelPackage.destination ? ` · ${travelPackage.destination}` : ''}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {participants.length} {participants.length === 1 ? 'pasajero disponible' : 'pasajeros disponibles'}
            </p>
          </div>
          <Button type="button" onClick={openCreateForm} disabled={groupableCatalog.length === 0}>
            Crear grupo
          </Button>
        </div>

        {pageError ? (
          <Alert variant="destructive">
            <AlertTitle>No se pudieron completar algunos cambios</AlertTitle>
            <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        ) : null}

        {groupableCatalog.length === 0 ? (
          <Alert variant="warning">
            <AlertTitle>No hay servicios disponibles</AlertTitle>
            <AlertDescription>No hay categorías activas disponibles para crear grupos de pasajeros.</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center">
            <label htmlFor="passenger-groups-service-filter" className="text-sm font-medium">Tipo de servicio</label>
            <Select
              id="passenger-groups-service-filter"
              className="sm:max-w-xs"
              value={serviceFilter}
              onChange={(event) => setServiceFilter(event.target.value)}
            >
              <option value={ALL_PASSENGER_GROUP_SERVICES}>Todos los servicios</option>
              {serviceOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </Select>
            <span className="text-sm text-muted-foreground">
              {serviceFilter === ALL_PASSENGER_GROUP_SERVICES
                ? 'Arrastre desde el roster del viaje hacia cualquier grupo.'
                : 'Organice y asigne pasajeros para este servicio.'}
            </span>
          </CardContent>
        </Card>

        {participants.length === 0 ? (
          <Alert variant="info"><AlertDescription>Este viaje todavía no tiene pasajeros disponibles.</AlertDescription></Alert>
        ) : null}

        <section aria-label="Grupos activos" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Tablero de grupos activos</h2>
              <p className="mt-1 text-sm text-muted-foreground">Arrastrar agrega al grupo de destino; quitar es siempre una acción explícita.</p>
            </div>
            <span className="text-sm text-muted-foreground">{activeGroups.length} {activeGroups.length === 1 ? 'grupo' : 'grupos'}</span>
          </div>
          {activeGroups.length === 0 ? <EmptyGroups serviceName={serviceFilter === ALL_PASSENGER_GROUP_SERVICES ? null : serviceOptions.find(([code]) => code === serviceFilter)?.[1] ?? null} onCreate={openCreateForm} /> : null}
          <PassengerGroupsBoard
            serviceName={serviceOptions.find(([code]) => code === serviceFilter)?.[1] ?? 'Todos los servicios'}
            groups={board.groups}
            sourceParticipants={board.sourceParticipants}
            isAllServices={board.isAllServices}
            memberIdsByGroupId={board.memberIdsByGroupId}
            disabled={savingMembers}
            onAddParticipant={(group, participantId) => void addParticipantToGroup(group, participantId)}
            onRemoveParticipant={(group, participantId) => void removeParticipantFromGroup(group, participantId)}
            onEdit={openEditForm}
            onAssign={openAssignment}
            onArchive={setArchiveTarget}
          />
        </section>

        {archivedGroups.length > 0 ? (
          <section className="space-y-3 border-t border-border pt-6" aria-label="Grupos archivados">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Grupos archivados ({archivedGroups.length})</h2>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowArchived((current) => !current)}>
                {showArchived ? 'Ocultar archivados' : 'Ver archivados'}
              </Button>
            </div>
            {showArchived ? (
              <div className="grid gap-4 md:grid-cols-2">
                {archivedGroups.map((group) => <GroupCard key={group.id} group={group} archived />)}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      {formMode ? (
        <FormSheet
          open
          onOpenChange={(open) => { if (!open) closeForm(); }}
          title={formMode === 'edit' ? 'Editar grupo' : 'Crear grupo'}
          description="Organice pasajeros que deben manejarse juntos. Los detalles de reservas se registran después en Operaciones."
          contentClassName="space-y-5"
          actions={
            <>
              <Button type="button" variant="outline" onClick={closeForm} disabled={savingGroup}>Cancelar</Button>
              <Button type="submit" form="passenger-group-form" disabled={savingGroup || editableCatalog.length === 0}>
                {savingGroup ? 'Guardando...' : formMode === 'edit' ? 'Guardar cambios' : 'Crear grupo'}
              </Button>
            </>
          }
        >
          <form id="passenger-group-form" className="grid gap-5" onSubmit={submitGroup}>
            {formError ? <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert> : null}
            <FormField htmlFor="passenger-group-service" label="Tipo de servicio" required>
              <Select
                id="passenger-group-service"
                value={form.additionalServiceCatalogId}
                onChange={(event) => setForm((current) => ({ ...current, additionalServiceCatalogId: event.target.value }))}
                disabled={savingGroup || editableCatalog.length === 0}
                required
              >
                <option value="" disabled>Seleccione un servicio</option>
                {editableCatalog.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </FormField>
            <FormField htmlFor="passenger-group-name" label="Nombre del grupo" required>
              <Input
                id="passenger-group-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                maxLength={160}
                placeholder="Habitación 1"
                disabled={savingGroup}
                required
              />
            </FormField>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Color <span className="font-normal text-muted-foreground">(opcional)</span></legend>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant={form.color === null ? 'secondary' : 'outline'} size="sm" onClick={() => setForm((current) => ({ ...current, color: null }))} disabled={savingGroup}>Sin color</Button>
                {GROUP_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    aria-label={`Color ${color.label}`}
                    aria-pressed={form.color === color.value}
                    disabled={savingGroup}
                    className={`size-8 rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${form.color === color.value ? 'scale-110 border-foreground' : 'border-transparent'}`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setForm((current) => ({ ...current, color: color.value }))}
                  />
                ))}
              </div>
            </fieldset>
            <FormField htmlFor="passenger-group-notes" label="Notas" description="Contexto breve para la agencia; no corresponde a una reserva o compra.">
              <Textarea
                id="passenger-group-notes"
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                maxLength={2000}
                placeholder="Matrimonial para 3, considerar cama extra"
                disabled={savingGroup}
              />
            </FormField>
          </form>
        </FormSheet>
      ) : null}

      <Dialog open={assigningGroup !== null} onOpenChange={(open) => { if (!open && !savingMembers) setAssigningGroup(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Asignar pasajeros{assigningGroup ? ` a “${assigningGroup.name}”` : ''}</DialogTitle>
            <DialogDescription>Un pasajero puede pertenecer a otros grupos. Seleccione quienes deben estar en este grupo.</DialogDescription>
          </DialogHeader>
          <Input
            value={participantSearch}
            onChange={(event) => setParticipantSearch(event.target.value)}
            placeholder="Buscar pasajero"
            aria-label="Buscar pasajero"
            disabled={savingMembers}
          />
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
            {matchingParticipants.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No hay pasajeros que coincidan con la búsqueda.</p>
            ) : matchingParticipants.map((participant) => (
              <label key={participant.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-accent/50">
                <input
                  type="checkbox"
                  checked={selectedParticipantIds.has(participant.id)}
                  onChange={() => toggleParticipant(participant.id)}
                  disabled={savingMembers}
                />
                <span className="text-sm font-medium">{participant.client.fullName}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssigningGroup(null)} disabled={savingMembers}>Cancelar</Button>
            <Button type="button" onClick={() => void saveAssignment()} disabled={savingMembers}>
              {savingMembers ? 'Guardando...' : 'Guardar pasajeros'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => { if (!open && !archiving) setArchiveTarget(null); }}
        title="¿Archivar grupo?"
        description="El grupo dejará de usarse activamente. Los pasajeros y el historial actual se conservarán."
        confirmLabel="Archivar grupo"
        pendingLabel="Archivando..."
        variant="destructive"
        isPending={archiving}
        onConfirm={() => void archiveGroup()}
      />
    </main>
  );
}

function GroupCard({ group, archived = false, onEdit, onAssign, onArchive }: {
  group: PassengerGroup;
  archived?: boolean;
  onEdit?: (group: PassengerGroup) => void;
  onAssign?: (group: PassengerGroup) => void;
  onArchive?: (group: PassengerGroup) => void;
}) {
  return (
    <Card className={archived ? 'opacity-75' : undefined}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            {group.color ? <span aria-label="Color del grupo" className="size-3 shrink-0 rounded-full" style={{ backgroundColor: group.color }} /> : null}
            <span className="truncate">{group.name}</span>
          </CardTitle>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="info">{group.serviceName}</Badge>
            {archived ? <Badge variant="outline">Archivado</Badge> : null}
          </div>
        </div>
        <span className="shrink-0 text-sm text-muted-foreground">{group.members.length} {group.members.length === 1 ? 'pasajero' : 'pasajeros'}</span>
      </CardHeader>
      <CardContent className="space-y-3">
        {group.members.length > 0 ? <p className="text-sm text-muted-foreground">{memberNames(group)}</p> : <p className="text-sm text-muted-foreground">Aún no hay pasajeros asignados.</p>}
        {group.notes ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{group.notes}</p> : null}
      </CardContent>
      {!archived && onEdit && onAssign && onArchive ? (
        <CardFooter className="flex-wrap">
          <Button type="button" size="sm" variant="outline" onClick={() => onEdit(group)}>Editar</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onAssign(group)}>Asignar pasajeros</Button>
          <Button type="button" size="sm" variant="destructive" onClick={() => onArchive(group)}>Archivar</Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

function EmptyGroups({ serviceName, onCreate }: { serviceName: string | null; onCreate: () => void }) {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <p className="font-medium">{serviceName ? `No hay grupos de ${serviceName}.` : 'No hay grupos creados para este viaje.'}</p>
        <Button type="button" className="mt-4" onClick={onCreate}>Crear grupo</Button>
      </CardContent>
    </Card>
  );
}

function WorkspaceError({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <main className="app-shell p-5">
      <div className="mx-auto max-w-2xl"><Alert variant="destructive"><AlertTitle>No se puede abrir Grupos</AlertTitle><AlertDescription>{message}</AlertDescription></Alert><Button type="button" className="mt-4" variant="outline" onClick={onBack}>Volver a viajes</Button></div>
    </main>
  );
}

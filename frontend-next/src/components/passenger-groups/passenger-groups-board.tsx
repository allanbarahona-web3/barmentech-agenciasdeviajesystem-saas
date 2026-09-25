'use client';

import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { GripVertical, UserMinus, Users } from 'lucide-react';
import type { PassengerGroup, TravelPackageRosterParticipant } from '@/lib/passenger-groups-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

type PassengerGroupsBoardProps = {
  serviceName: string;
  groups: PassengerGroup[];
  sourceParticipants: TravelPackageRosterParticipant[];
  isAllServices: boolean;
  memberIdsByGroupId: Map<string, Set<string>>;
  disabled?: boolean;
  onAddParticipant: (group: PassengerGroup, participantId: string) => void;
  onRemoveParticipant: (group: PassengerGroup, participantId: string) => void;
  onEdit: (group: PassengerGroup) => void;
  onAssign: (group: PassengerGroup) => void;
  onArchive: (group: PassengerGroup) => void;
};

type PassengerCard = {
  participantId: string;
  fullName: string;
};

export function PassengerGroupsBoard({
  serviceName,
  groups,
  sourceParticipants,
  isAllServices,
  memberIdsByGroupId,
  disabled = false,
  onAddParticipant,
  onRemoveParticipant,
  onEdit,
  onAssign,
  onArchive,
}: PassengerGroupsBoardProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const participantId = event.active.data.current?.participantId as string | undefined;
    const groupId = event.over?.data.current?.groupId as string | undefined;
    if (!participantId || !groupId || disabled) return;

    const destination = groups.find((group) => group.id === groupId);
    if (!destination || memberIdsByGroupId.get(destination.id)?.has(participantId)) return;

    // This is deliberately additive: a drag into another group never removes
    // the source membership, including when both groups use the same service.
    onAddParticipant(destination, participantId);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-3" aria-label={`Tablero de agrupación de ${serviceName}`}>
        <UnassignedColumn
          serviceName={serviceName}
          participants={sourceParticipants}
          isAllServices={isAllServices}
          disabled={disabled}
        />
        {groups.map((group) => (
          <GroupColumn
            key={group.id}
            group={group}
            disabled={disabled}
            onRemoveParticipant={onRemoveParticipant}
            onEdit={onEdit}
            onAssign={onAssign}
            onArchive={onArchive}
          />
        ))}
      </div>
    </DndContext>
  );
}

function UnassignedColumn({
  serviceName,
  participants,
  isAllServices,
  disabled,
}: {
  serviceName: string;
  participants: TravelPackageRosterParticipant[];
  isAllServices: boolean;
  disabled: boolean;
}) {
  const title = isAllServices ? 'Pasajeros del viaje' : 'Sin asignar';
  const description = isAllServices ? 'Roster completo' : `para ${serviceName}`;
  const emptyMessage = isAllServices
    ? 'Este viaje todavía no tiene pasajeros disponibles.'
    : 'Todos los pasajeros están asignados para este servicio.';

  return (
    <Card className="w-[18rem] shrink-0 border-dashed bg-muted/20">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><Users aria-hidden="true" size={17} />{title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <span className="text-sm text-muted-foreground">{participants.length}</span>
      </CardHeader>
      <CardContent className="max-h-[32rem] space-y-2 overflow-y-auto pt-3">
        {participants.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : participants.map((participant) => (
          <PassengerChip
            key={`unassigned-${participant.id}`}
            passenger={{ participantId: participant.id, fullName: participant.client.fullName }}
            disabled={disabled}
            source={isAllServices ? 'el viaje' : 'sin asignar'}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function GroupColumn({
  group,
  disabled,
  onRemoveParticipant,
  onEdit,
  onAssign,
  onArchive,
}: {
  group: PassengerGroup;
  disabled: boolean;
  onRemoveParticipant: (group: PassengerGroup, participantId: string) => void;
  onEdit: (group: PassengerGroup) => void;
  onAssign: (group: PassengerGroup) => void;
  onArchive: (group: PassengerGroup) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `passenger-group-drop-${group.id}`,
    data: { groupId: group.id },
    disabled,
  });

  return (
    <Card className={`w-[18rem] shrink-0 transition-colors ${isOver ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : ''}`}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            {group.color ? <span aria-label="Color del grupo" className="size-3 shrink-0 rounded-full" style={{ backgroundColor: group.color }} /> : null}
            <span className="truncate">{group.name}</span>
          </CardTitle>
          <Badge className="mt-2" variant="info">{group.serviceName}</Badge>
        </div>
        <span className="shrink-0 text-sm text-muted-foreground">{group.members.length}</span>
      </CardHeader>
      {group.notes ? <p className="mx-5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{group.notes}</p> : null}
      <CardContent ref={setNodeRef} className="mt-3 min-h-28 max-h-[32rem] space-y-2 overflow-y-auto pt-0" aria-label={`Pasajeros de ${group.name}`}>
        {group.members.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">Arrastre pasajeros aquí para agregarlos.</p>
        ) : group.members.map((member) => (
          <PassengerChip
            key={`${group.id}-${member.travelPackageParticipantId}`}
            passenger={{ participantId: member.travelPackageParticipantId, fullName: member.fullName }}
            groupId={group.id}
            disabled={disabled}
            source={group.name}
            onRemove={() => onRemoveParticipant(group, member.travelPackageParticipantId)}
          />
        ))}
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onEdit(group)} disabled={disabled}>Editar</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onAssign(group)} disabled={disabled}>Asignar pasajeros</Button>
        <Button type="button" size="sm" variant="destructive" onClick={() => onArchive(group)} disabled={disabled}>Archivar</Button>
      </CardFooter>
    </Card>
  );
}

function PassengerChip({
  passenger,
  groupId,
  disabled,
  source,
  onRemove,
}: {
  passenger: PassengerCard;
  groupId?: string;
  disabled: boolean;
  source: string;
  onRemove?: () => void;
}) {
  const draggableId = `passenger-${passenger.participantId}-${groupId ?? 'unassigned'}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId,
    data: { participantId: passenger.participantId, sourceGroupId: groupId ?? null },
    disabled,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex min-h-10 items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm shadow-ui-xs ${isDragging ? 'opacity-40' : ''}`}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed"
        aria-label={`Arrastrar a ${passenger.fullName} desde ${source}. Agrega al grupo de destino sin quitarlo del actual.`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" size={16} />
      </button>
      <span className="min-w-0 flex-1 truncate font-medium">{passenger.fullName}</span>
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-destructive"
          aria-label={`Quitar a ${passenger.fullName} de ${source}`}
          disabled={disabled}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onRemove}
        >
          <UserMinus aria-hidden="true" size={15} />
        </Button>
      ) : null}
    </div>
  );
}

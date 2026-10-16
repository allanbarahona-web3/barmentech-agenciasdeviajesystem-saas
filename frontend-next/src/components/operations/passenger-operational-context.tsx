'use client';

import { useState } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import AttachmentViewer, { type Attachment } from '@/components/attachment-viewer';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PassengerOperationalNotesAction } from '@/components/operations/passenger-operational-notes-action';
import { PassengerGroupContextAction, type PassengerGroupSummary } from '@/components/operations/passenger-group-context-action';
import { PassengerGroupBadge } from '@/components/passenger-group-badge';
import { operationalPassengerRoleLabel } from '@/lib/operations-presentation';
import {
  getOperationalPassengerDocumentAccess,
  listOperationalPassengerDocuments,
  operationsErrorMessage,
  type OperationalPassengerDocument,
  type OperationalPassengerDocumentGroup,
  type PassengerOperationalContext as PassengerOperationalContextValue,
} from '@/lib/operations-api';

interface PassengerOperationalContextProps {
  requirementId: string;
  passengerContexts: PassengerOperationalContextValue[] | null | undefined;
  travelPackageId?: string | null;
  participantIds?: readonly string[];
  passengerGroups?: PassengerGroupSummary[];
}

const ageLabels = {
  SERVICE_DATE: 'Edad al servicio',
  TRIP_DEPARTURE: 'Edad al inicio del viaje',
  CURRENT_DATE: 'Edad actual',
} as const;

const documentLabels = {
  ID_FRONT: 'Cédula — frente',
  ID_BACK: 'Cédula — reverso',
  PASSPORT: 'Pasaporte',
} as const;

const documentPriority = { PASSPORT: 0, ID_FRONT: 1, ID_BACK: 2 } as const;

export function PassengerOperationalContext({ requirementId, passengerContexts, travelPackageId, participantIds, passengerGroups }: PassengerOperationalContextProps) {
  const contexts = passengerContexts ?? [];
  const contextParticipantIds = participantIds?.length === contexts.length ? participantIds : [];
  if (!contexts.length) return null;

  return <section className="rounded-lg border bg-muted/30 p-3" aria-label="Contexto de pasajeros">
    <div className="space-y-3">
      {contexts.map((context, index) => <div key={`${context.displayName}-${index}`} className={index ? 'border-t pt-3' : undefined}>
        <p className="font-medium">{context.displayName}</p>
        {context.role ? <p className="text-sm text-muted-foreground">{operationalPassengerRoleLabel(context.role)}</p> : null}
        {context.dateOfBirth ? <p className="mt-1 text-sm"><span className="text-muted-foreground">Nacimiento:</span> {formatDateOnly(context.dateOfBirth)}</p> : null}
        {context.age !== null ? <p className="text-sm"><span className="text-muted-foreground">{ageLabels[context.ageReferenceType]}{context.ageReferenceDate ? ` (${formatDateOnly(context.ageReferenceDate)})` : ''}:</span> {context.age} {context.age === 1 ? 'año' : 'años'}</p> : null}
        {travelPackageId && contextParticipantIds.length === 1 && index === 0 && passengerGroups?.length ? <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Grupos de pasajeros">{passengerGroups.map((group) => <span key={group.id} className="inline-flex items-center gap-0.5"><PassengerGroupBadge name={group.name} color={group.color} /><PassengerGroupContextAction travelPackageId={travelPackageId} group={group} className="size-7" /></span>)}</div> : null}
        {contextParticipantIds[index] ? <div className="mt-2 flex flex-wrap gap-2"><PassengerDocumentsAction requirementId={requirementId} participantContextKey={`passenger:${contextParticipantIds[index]}`} passengerName={context.displayName} label="Ver documentos" className="" />{travelPackageId ? <PassengerOperationalNotesAction travelPackageId={travelPackageId} participantId={contextParticipantIds[index]} passengerName={context.displayName} className="" /> : null}</div> : null}
      </div>)}
    </div>
    {!travelPackageId ? <PassengerDocumentsAction requirementId={requirementId} /> : null}
  </section>;
}

interface PassengerDocumentsActionProps {
  requirementId: string;
  participantContextKey?: string;
  passengerName?: string;
  label?: string;
  className?: string;
}

/** Documents stay lazy; a dashboard row supplies its participant context key to show only that passenger. */
export function PassengerDocumentsAction({ requirementId, participantContextKey, passengerName, label = 'Ver identificación / pasaporte', className = 'mt-3' }: PassengerDocumentsActionProps) {
  const [documentGroups, setDocumentGroups] = useState<OperationalPassengerDocumentGroup[] | null>(null);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [viewerAttachment, setViewerAttachment] = useState<Attachment | null>(null);

  async function openDocuments() {
    setDocumentsOpen(true);
    setDocumentsError(null);
    if (documentGroups) return;
    setDocumentsLoading(true);
    try {
      const result = await listOperationalPassengerDocuments(requirementId);
      setDocumentGroups(result.passengers);
    } catch (reason) {
      setDocumentsError(operationsErrorMessage(reason, 'No se pudieron cargar los documentos.'));
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function resolveDocumentUrl(attachment: Attachment, _signal: AbortSignal) {
    try {
      return (await getOperationalPassengerDocumentAccess(requirementId, attachment.id)).url;
    } catch (reason) {
      throw new Error(operationsErrorMessage(reason, 'No se pudo abrir el documento. Inténtelo de nuevo.'));
    }
  }

  const visibleGroups = participantContextKey && documentGroups ? documentGroups.filter((group) => group.contextKey === participantContextKey) : documentGroups;
  return <>
    <Button type="button" variant="outline" size="sm" className={className} onClick={() => void openDocuments()}>
      {label}
    </Button>
    <Dialog open={documentsOpen} onOpenChange={setDocumentsOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Documentos de {passengerName ?? 'pasajero'}</DialogTitle><DialogDescription>Selecciona el documento que necesitas consultar.</DialogDescription></DialogHeader>{documentsLoading ? <p className="py-4 text-sm text-muted-foreground">Cargando documentos...</p> : null}{documentsError ? <div className="space-y-2 py-2"><p role="alert" className="text-sm text-destructive">{documentsError}</p><Button type="button" size="sm" variant="outline" onClick={() => void openDocuments()}>Reintentar</Button></div> : null}{!documentsLoading && !documentsError && visibleGroups ? <DocumentGroups groups={visibleGroups} onSelect={(document) => setViewerAttachment({ id: document.id, originalFileName: document.originalFilename, mimeType: document.mimeType })} /> : null}</DialogContent></Dialog>
    {viewerAttachment ? <AttachmentViewer attachments={[viewerAttachment]} resolveAttachmentUrl={resolveDocumentUrl} onClose={() => setViewerAttachment(null)} /> : null}
  </>;
}

function DocumentGroups({ groups, onSelect }: { groups: OperationalPassengerDocumentGroup[]; onSelect: (document: OperationalPassengerDocument) => void }) {
  const availableGroups = groups.filter((group) => group.documents.length);
  if (!availableGroups.length) return <p className="text-sm text-muted-foreground">No hay identificación o pasaporte disponible para este pasajero.</p>;
  return <div className="space-y-3">{availableGroups.map((group) => <div key={group.contextKey} className="space-y-1">{availableGroups.length > 1 ? <p className="text-sm font-medium">{group.displayName}</p> : null}<div className="space-y-1">{[...group.documents].sort((left, right) => documentPriority[left.category] - documentPriority[right.category]).map((document) => <button key={document.id} type="button" className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onSelect(document)}><FileText aria-hidden="true" className="size-4 text-muted-foreground" /><span className="flex-1 font-medium">{documentLabels[document.category]}</span><ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" /></button>)}</div></div>)}</div>;
}

function formatDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

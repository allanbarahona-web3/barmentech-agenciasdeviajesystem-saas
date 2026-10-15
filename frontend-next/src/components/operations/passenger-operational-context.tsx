'use client';

import { useState } from 'react';
import AttachmentViewer, { type Attachment } from '@/components/attachment-viewer';
import { Button } from '@/components/ui/button';
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
}

const ageLabels = {
  SERVICE_DATE: 'Edad al servicio',
  TRIP_DEPARTURE: 'Edad al inicio del viaje',
  CURRENT_DATE: 'Edad actual',
} as const;

const documentLabels = {
  ID_FRONT: 'Identificación — frente',
  ID_BACK: 'Identificación — reverso',
  PASSPORT: 'Pasaporte',
} as const;

const roleLabels: Record<string, string> = {
  HOLDER: 'Titular',
  COMPANION: 'Acompañante',
  MINOR: 'Menor',
  TRAVELER: 'Pasajero',
};

export function PassengerOperationalContext({ requirementId, passengerContexts }: PassengerOperationalContextProps) {
  const [documentGroups, setDocumentGroups] = useState<OperationalPassengerDocumentGroup[] | null>(null);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [viewerAttachment, setViewerAttachment] = useState<Attachment | null>(null);

  const contexts = passengerContexts ?? [];
  if (!contexts.length) return null;

  async function openDocuments() {
    setDocumentsOpen(true);
    setDocumentsError(null);
    if (documentGroups) return;
    setDocumentsLoading(true);
    try {
      const result = await listOperationalPassengerDocuments(requirementId);
      setDocumentGroups(result.passengers);
    } catch (reason) {
      setDocumentsError(operationsErrorMessage(reason, 'No se pudo cargar la identificación o el pasaporte. Inténtelo de nuevo.'));
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

  return <section className="rounded-lg border bg-muted/30 p-3" aria-label="Contexto de pasajeros">
    <div className="space-y-3">
      {contexts.map((context, index) => <div key={`${context.displayName}-${index}`} className={index ? 'border-t pt-3' : undefined}>
        <p className="font-medium">{context.displayName}</p>
        {context.role ? <p className="text-sm text-muted-foreground">{roleLabels[context.role] ?? context.role}</p> : null}
        {context.dateOfBirth ? <p className="mt-1 text-sm"><span className="text-muted-foreground">Nacimiento:</span> {formatDateOnly(context.dateOfBirth)}</p> : null}
        {context.age !== null ? <p className="text-sm"><span className="text-muted-foreground">{ageLabels[context.ageReferenceType]}{context.ageReferenceDate ? ` (${formatDateOnly(context.ageReferenceDate)})` : ''}:</span> {context.age} {context.age === 1 ? 'año' : 'años'}</p> : null}
      </div>)}
    </div>
    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void openDocuments()} disabled={documentsLoading}>
      {documentsLoading ? 'Cargando documentos...' : 'Ver identificación / pasaporte'}
    </Button>
    {documentsOpen ? <div className="mt-3 rounded-md border bg-background p-3" role="region" aria-label="Identificación y pasaporte">
      <div className="mb-3 flex items-center justify-between gap-3"><p className="font-medium">Identificación y pasaporte</p><Button type="button" variant="ghost" size="sm" onClick={() => setDocumentsOpen(false)}>Cerrar</Button></div>
      {documentsLoading ? <p className="text-sm text-muted-foreground">Cargando documentos...</p> : null}
      {documentsError ? <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{documentsError}</p><Button type="button" size="sm" variant="outline" onClick={() => void openDocuments()}>Reintentar</Button></div> : null}
      {!documentsLoading && !documentsError && documentGroups ? <DocumentGroups groups={documentGroups} onSelect={(document) => setViewerAttachment({ id: document.id, originalFileName: document.originalFilename, mimeType: document.mimeType })} /> : null}
    </div> : null}
    {viewerAttachment ? <AttachmentViewer attachments={[viewerAttachment]} resolveAttachmentUrl={resolveDocumentUrl} onClose={() => setViewerAttachment(null)} /> : null}
  </section>;
}

function DocumentGroups({ groups, onSelect }: { groups: OperationalPassengerDocumentGroup[]; onSelect: (document: OperationalPassengerDocument) => void }) {
  const availableGroups = groups.filter((group) => group.documents.length);
  if (!availableGroups.length) return <p className="text-sm text-muted-foreground">No hay identificación o pasaporte disponible para este pasajero.</p>;
  return <div className="space-y-3">{groups.map((group) => <div key={group.contextKey} className="space-y-1"><p className="text-sm font-medium">{group.displayName}</p>{group.documents.length ? <div className="flex flex-wrap gap-2">{group.documents.map((document) => <Button key={document.id} type="button" size="sm" variant="outline" onClick={() => onSelect(document)}>{documentLabels[document.category]}{document.originalFilename ? ` · ${document.originalFilename}` : ''}</Button>)}</div> : <p className="text-sm text-muted-foreground">No hay identificación o pasaporte disponible para este pasajero.</p>}</div>)}</div>;
}

function formatDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

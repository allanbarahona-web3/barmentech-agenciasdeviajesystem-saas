'use client';

import { useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getOperationalPassengerNotes, operationsErrorMessage, type OperationalPassengerNote } from '@/lib/operations-api';
import { useTenantDateTimeFormatter } from '@/shared/regional/tenant-regional-provider';

const operationalNotesCache = new Map<string, OperationalPassengerNote[]>();
const operationalNotesLoads = new Map<string, Promise<OperationalPassengerNote[]>>();

interface PassengerOperationalNotesActionProps {
  travelPackageId: string;
  participantId: string;
  passengerName: string;
  operationalNoteCount?: number;
  className?: string;
}

/** One lazy, ephemeral Operations note view shared by dashboard, reservation, and purchase contexts. */
export function PassengerOperationalNotesAction({ travelPackageId, participantId, passengerName, operationalNoteCount, className }: PassengerOperationalNotesActionProps) {
  const formatDateTime = useTenantDateTimeFormatter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<OperationalPassengerNote[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheKey = `${travelPackageId}:${participantId}`;
  const label = operationalNoteCount && operationalNoteCount > 0 ? `Notas operativas (${operationalNoteCount})` : 'Notas operativas';

  async function loadNotes() {
    const cached = operationalNotesCache.get(cacheKey);
    if (cached) {
      setNotes(cached);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await loadOperationalPassengerNotes(cacheKey, travelPackageId, participantId);
      setNotes(result);
    } catch (reason) {
      setError(operationsErrorMessage(reason, 'No se pudieron cargar las notas operativas.'));
    } finally {
      setLoading(false);
    }
  }

  function openNotes() {
    setOpen(true);
    if (!notes) void loadNotes();
  }

  return <>
    <Button type="button" variant="outline" size="sm" className={className} onClick={openNotes}><MessageSquareText aria-hidden="true" />{label}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Notas operativas — {passengerName}</DialogTitle><DialogDescription>Contexto operativo asociado a este pasajero.</DialogDescription></DialogHeader>
        {loading ? <p className="py-4 text-sm text-muted-foreground">Cargando notas operativas...</p> : null}
        {error ? <div className="space-y-2 py-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button type="button" size="sm" variant="outline" onClick={() => void loadNotes()}>Reintentar</Button></div> : null}
        {!loading && !error && notes ? <NotesList notes={notes} formatDateTime={formatDateTime} /> : null}
      </DialogContent>
    </Dialog>
  </>;
}

function NotesList({ notes, formatDateTime }: { notes: OperationalPassengerNote[]; formatDateTime: (value: string) => string }) {
  if (!notes.length) return <p className="py-4 text-sm text-muted-foreground">No hay notas operativas para este pasajero.</p>;
  return <div className="space-y-3">{notes.map((note) => <article key={note.id} className="rounded-lg border border-border bg-muted/30 p-3"><p><span className="inline-flex rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium">Contrato {note.contract.contractNumber}</span></p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{note.note}</p><p className="mt-3 text-xs text-muted-foreground">{note.author.displayName ?? 'Autor no disponible'} · {formatDateTime(note.createdAt)}</p></article>)}</div>;
}

function loadOperationalPassengerNotes(cacheKey: string, travelPackageId: string, participantId: string) {
  const pending = operationalNotesLoads.get(cacheKey);
  if (pending) return pending;
  const request = getOperationalPassengerNotes(travelPackageId, participantId)
    .then((notes) => {
      operationalNotesCache.set(cacheKey, notes);
      return notes;
    })
    .finally(() => operationalNotesLoads.delete(cacheKey));
  operationalNotesLoads.set(cacheKey, request);
  return request;
}

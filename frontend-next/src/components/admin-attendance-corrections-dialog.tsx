'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { History } from 'lucide-react';
import { getEntryCorrections } from '@/lib/attendance-api';
import { formatBusinessDateTime } from '@/shared/regional';

interface Correction {
  id: string;
  reason: string;
  beforeType: string;
  beforeClockIn: string;
  beforeClockOut: string | null;
  beforeDuration: number | null;
  afterType: string;
  afterClockIn: string;
  afterClockOut: string | null;
  afterDuration: number | null;
  User: {
    fullName: string;
    email: string;
  };
  createdAt: string;
}

interface AdminAttendanceCorrectionsDialogProps {
  entryId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const ATTENDANCE_STATE_LABELS: Record<string, string> = {
  WORKING: 'Trabajando',
  MEETING: 'Reunión',
  BREAK1: 'Descanso 1',
  LUNCH: 'Almuerzo',
  BREAK2: 'Descanso 2',
  BREAK3: 'Descanso 3',
  OT: 'Horas extra',
  OFF: 'Fuera',
};

const formatDuration = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined) return '-';
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  return hours > 0 ? `${hours}h ${minutes}m ${secs}s` : `${minutes}m ${secs}s`;
};

const formatState = (state: string): string => ATTENDANCE_STATE_LABELS[state] || state;

function ChangeValue({ before, after }: { before: string; after: string }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
      <span className="rounded-md bg-destructive/5 px-2 py-1 text-destructive line-through">{before}</span>
      <span className="text-muted-foreground">→</span>
      <span className="rounded-md bg-success/10 px-2 py-1 font-medium text-success">{after}</span>
    </div>
  );
}

function AdminAttendanceCorrectionsDialog({ entryId, isOpen, onClose }: AdminAttendanceCorrectionsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [corrections, setCorrections] = useState<Correction[]>([]);

  useEffect(() => {
    if (!isOpen || !entryId) return;

    const loadCorrections = async () => {
      setLoading(true);
      try {
        const data = await getEntryCorrections(entryId);
        setCorrections(data);
      } catch (error) {
        console.error('Error loading corrections:', error);
        setCorrections([]);
      } finally {
        setLoading(false);
      }
    };

    void loadCorrections();
  }, [isOpen, entryId]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History aria-hidden="true" className="size-5" />Historial de correcciones</DialogTitle>
          <DialogDescription>Consulta los cambios aplicados a este marcaje.</DialogDescription>
        </DialogHeader>

        <div className="mt-5 grid gap-4">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando historial...</p>
          ) : corrections.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No hay correcciones para este marcaje.</p>
          ) : corrections.map((correction) => (
            <Card key={correction.id} className="shadow-none">
              <CardHeader>
                <div>
                  <CardTitle className="text-sm">Corregido por {correction.User.fullName}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">Fecha de corrección: {formatBusinessDateTime(correction.createdAt)}</p>
                </div>
                <Badge variant="outline">Historial</Badge>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Alert variant="info">
                  <AlertTitle>Razón</AlertTitle>
                  <AlertDescription>{correction.reason}</AlertDescription>
                </Alert>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div><p className="text-xs font-medium text-muted-foreground">Estado</p><ChangeValue before={formatState(correction.beforeType)} after={formatState(correction.afterType)} /></div>
                  <div><p className="text-xs font-medium text-muted-foreground">Duración</p><ChangeValue before={formatDuration(correction.beforeDuration)} after={formatDuration(correction.afterDuration)} /></div>
                  <div className="sm:col-span-2"><p className="text-xs font-medium text-muted-foreground">Inicio</p><ChangeValue before={formatBusinessDateTime(correction.beforeClockIn)} after={formatBusinessDateTime(correction.afterClockIn)} /></div>
                  <div className="sm:col-span-2"><p className="text-xs font-medium text-muted-foreground">Fin</p><ChangeValue before={correction.beforeClockOut ? formatBusinessDateTime(correction.beforeClockOut) : '-'} after={correction.afterClockOut ? formatBusinessDateTime(correction.afterClockOut) : '-'} /></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { AdminAttendanceCorrectionsDialog };

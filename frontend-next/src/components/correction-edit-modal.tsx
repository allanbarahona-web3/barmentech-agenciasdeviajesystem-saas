'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/patterns/form-field';
import { correctAttendanceEntry, type AttendanceEntry } from '@/lib/attendance-api';
import { LoadingModal } from './loading-modal';

const ATTENDANCE_STATES = ['WORKING', 'MEETING', 'BREAK1', 'LUNCH', 'BREAK2', 'BREAK3', 'OT', 'OFF'];

interface CorrectionEditModalProps {
  entryId: string | null;
  entry: AttendanceEntry | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const toDateTimeLocal = (dateString: string) => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
};

const getCorrectionErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';

  if (/reason must be longer than or equal to 10 characters/i.test(message)) {
    return 'La razón de la corrección debe tener al menos 10 caracteres.';
  }

  return message || 'Error al corregir marcaje';
};

export function CorrectionEditModal({ entryId, entry, isOpen, onClose, onSuccess }: CorrectionEditModalProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    type: '',
    clockIn: '',
    clockOut: '',
    reason: '',
  });
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackState, setFeedbackState] = useState<'loading' | 'success' | 'error'>('loading');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen || !entryId || !entry) return;

    setFormData({
      type: entry.type,
      clockIn: entry.clockIn ? toDateTimeLocal(entry.clockIn) : '',
      clockOut: entry.clockOut ? toDateTimeLocal(entry.clockOut) : '',
      reason: '',
    });
    setFormError('');
  }, [isOpen, entryId, entry]);

  const handleSave = async () => {
    if (!entryId || !formData.reason.trim()) {
      setFormError('Debes proporcionar una razón para la corrección.');
      return;
    }

    setFormError('');
    setSaving(true);
    setFeedbackOpen(true);
    setFeedbackState('loading');
    setFeedbackMessage('Guardando corrección...');

    try {
      const payload = {
        type: formData.type !== entry?.type ? formData.type : undefined,
        clockIn: formData.clockIn ? new Date(formData.clockIn).toISOString() : undefined,
        clockOut: formData.clockOut ? new Date(formData.clockOut).toISOString() : undefined,
        reason: formData.reason,
      };

      await correctAttendanceEntry(entryId, payload);
      setFeedbackState('success');
      setFeedbackMessage('Marcaje corregido exitosamente');
      setTimeout(() => {
        onSuccess();
        onClose();
        setFeedbackOpen(false);
      }, 1500);
    } catch (error) {
      setFeedbackOpen(false);
      setFormError(getCorrectionErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) onClose();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corregir marcaje</DialogTitle>
            <DialogDescription>Actualiza la información del marcaje y registra el motivo de la corrección.</DialogDescription>
          </DialogHeader>

          {entry ? (
            <div className="mt-5 grid gap-4">
              <Alert variant="info">
                <AlertDescription>
                  Empleado: {entry.User?.fullName || entry.User?.id || '-'} · Fecha: {new Date(entry.clockIn).toLocaleDateString()}
                </AlertDescription>
              </Alert>

              {formError && (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <FormField htmlFor="attendance-correction-state" label="Estado">
                <Select id="attendance-correction-state" value={formData.type} onChange={(event) => setFormData({ ...formData, type: event.target.value })}>
                  {ATTENDANCE_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                </Select>
              </FormField>

              <FormField htmlFor="attendance-correction-start" label="Inicio">
                <Input id="attendance-correction-start" type="datetime-local" step="1" value={formData.clockIn} onChange={(event) => setFormData({ ...formData, clockIn: event.target.value })} />
              </FormField>

              <FormField htmlFor="attendance-correction-end" label="Fin">
                <Input id="attendance-correction-end" type="datetime-local" step="1" value={formData.clockOut} onChange={(event) => setFormData({ ...formData, clockOut: event.target.value })} />
              </FormField>

              <FormField htmlFor="attendance-correction-reason" label="Razón de la corrección" required>
                <Textarea id="attendance-correction-reason" rows={3} value={formData.reason} placeholder="Explica por qué se necesita esta corrección" onChange={(event) => setFormData({ ...formData, reason: event.target.value })} />
              </FormField>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
                <Button type="button" onClick={() => void handleSave()} disabled={saving || !formData.reason.trim()}>Guardar corrección</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="mt-5 text-center text-sm text-muted-foreground">No se pudo cargar el marcaje.</div>
          )}
        </DialogContent>
      </Dialog>

      <LoadingModal
        isOpen={feedbackOpen}
        state={feedbackState}
        loadingMessage={feedbackMessage}
        successMessage={feedbackMessage}
        errorMessage={feedbackMessage}
        onClose={() => setFeedbackOpen(false)}
        autoCloseDelay={feedbackState === 'success' ? 1500 : 0}
      />
    </>
  );
}

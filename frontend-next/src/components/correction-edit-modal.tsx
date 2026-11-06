'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/patterns/form-field';
import { correctAttendanceEntry, type AttendanceAdminListItem } from '@/lib/attendance-api';
import { formatBusinessDateTime, formatTenantDateTimeInput, tenantDateTimeInputToUtc } from '@/shared/regional';
import { useTenantRegional } from '@/shared/regional/tenant-regional-provider';
import { LoadingModal } from './loading-modal';

const ATTENDANCE_STATES = ['WORKING', 'MEETING', 'BREAK1', 'LUNCH', 'BREAK2', 'BREAK3', 'OT', 'OFF'];

interface CorrectionEditModalProps {
  entryId: string | null;
  entry: AttendanceAdminListItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const getCorrectionErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';

  if (/reason must be longer than or equal to 10 characters/i.test(message)) {
    return 'La razón de la corrección debe tener al menos 10 caracteres.';
  }

  return message || 'Error al corregir marcaje';
};

export function CorrectionEditModal({ entryId, entry, isOpen, onClose, onSuccess }: CorrectionEditModalProps) {
  const { timeZone, isConfigured } = useTenantRegional();
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
  const [formTimeZone, setFormTimeZone] = useState<string | null>(null);
  const initialClockValues = useRef({ clockIn: '', clockOut: '', originalClockIn: '', originalClockOut: '' });
  const initializedEntryKey = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      initializedEntryKey.current = null;
      return;
    }
    if (!isConfigured || !entryId || !entry || initializedEntryKey.current === entryId) return;

    const clockIn = entry.clockIn ? formatTenantDateTimeInput(entry.clockIn, timeZone) : '';
    const clockOut = entry.clockOut ? formatTenantDateTimeInput(entry.clockOut, timeZone) : '';

    setFormData({
      type: entry.type,
      clockIn,
      clockOut,
      reason: '',
    });
    initialClockValues.current = {
      clockIn,
      clockOut,
      originalClockIn: entry.clockIn || '',
      originalClockOut: entry.clockOut || '',
    };
    setFormTimeZone(timeZone);
    initializedEntryKey.current = entryId;
    setFormError('');
  }, [entry, entryId, isConfigured, isOpen, timeZone]);

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
      const inputTimeZone = formTimeZone ?? timeZone;
      const clockInChanged = formData.clockIn !== initialClockValues.current.clockIn;
      const clockOutChanged = formData.clockOut !== initialClockValues.current.clockOut;
      const clockIn = clockInChanged && formData.clockIn
        ? tenantDateTimeInputToUtc(formData.clockIn, inputTimeZone)
        : initialClockValues.current.originalClockIn || undefined;
      const clockOut = clockOutChanged && formData.clockOut
        ? tenantDateTimeInputToUtc(formData.clockOut, inputTimeZone)
        : initialClockValues.current.originalClockOut || undefined;

      if ((clockInChanged && formData.clockIn && !clockIn) || (clockOutChanged && formData.clockOut && !clockOut)) {
        setFeedbackOpen(false);
        setFormError('Ingresa una fecha y hora válidas.');
        return;
      }

      const payload = {
        type: formData.type !== entry?.type ? formData.type : undefined,
        clockIn: clockIn ?? undefined,
        clockOut: clockOut ?? undefined,
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

          {entry && isConfigured ? (
            <div className="mt-5 grid gap-4">
              <Alert variant="info">
                <AlertDescription>
                  Empleado: {entry.user.fullName || entry.user.id || '-'} · Fecha: {formatBusinessDateTime(entry.clockIn, formTimeZone ?? timeZone)}
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
                <Input id="attendance-correction-start" type="datetime-local" step="60" value={formData.clockIn} onChange={(event) => setFormData({ ...formData, clockIn: event.target.value })} />
              </FormField>

              <FormField htmlFor="attendance-correction-end" label="Fin">
                <Input id="attendance-correction-end" type="datetime-local" step="60" value={formData.clockOut} onChange={(event) => setFormData({ ...formData, clockOut: event.target.value })} />
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
            <div className="mt-5 text-center text-sm text-muted-foreground">{entry ? 'Cargando configuración regional...' : 'No se pudo cargar el marcaje.'}</div>
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

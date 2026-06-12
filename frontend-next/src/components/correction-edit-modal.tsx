'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!isOpen || !entryId || !entry) return;

    
    setFormData({
      type: entry.type,
      clockIn: entry.clockIn ? toDateTimeLocal(entry.clockIn) : '',
      clockOut: entry.clockOut ? toDateTimeLocal(entry.clockOut) : '',
      reason: '',
    });
  }, [isOpen, entryId, entry]);

  const handleSave = async () => {
    if (!entryId || !formData.reason.trim()) {
      setFeedbackState('error');
      setFeedbackMessage('Debes proporcionar una razón para la corrección');
      setFeedbackOpen(true);
      return;
    }

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
      setFeedbackState('error');
      setFeedbackMessage(error instanceof Error ? error.message : 'Error al corregir marcaje');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose}></div>
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Corregir Marcaje</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              ✕
            </button>
          </div>

          {entry ? (
            <div className="p-6 space-y-4">
              {/* Display current values */}
              <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                <div>Empleado: {entry.User?.fullName || entry.User?.id || '-'}</div>
                <div>Fecha: {new Date(entry.clockIn).toLocaleDateString()}</div>
              </div>

              {/* Type */}
              <label className="block">
                <span className="text-sm font-medium text-gray-700 mb-1 block">Estado</span>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  {ATTENDANCE_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </label>

              {/* Clock In */}
              <label className="block">
                <span className="text-sm font-medium text-gray-700 mb-1 block">Inicio</span>
                <input
                  type="datetime-local"
                  step="1"
                  value={formData.clockIn}
                  onChange={(e) => setFormData({ ...formData, clockIn: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </label>

              {/* Clock Out */}
              <label className="block">
                <span className="text-sm font-medium text-gray-700 mb-1 block">Fin</span>
                <input
                  type="datetime-local"
                  step="1"
                  value={formData.clockOut}
                  onChange={(e) => setFormData({ ...formData, clockOut: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </label>

              {/* Reason */}
              <label className="block">
                <span className="text-sm font-medium text-gray-700 mb-1 block">Razón de la corrección *</span>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Explica por qué se necesita esta corrección"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  rows={3}
                />
              </label>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={onClose}
                  disabled={saving}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void handleSave()}
                  disabled={saving || !formData.reason.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  Guardar Corrección
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-gray-600">No se pudo cargar el marcaje</div>
          )}
        </div>
      </div>

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

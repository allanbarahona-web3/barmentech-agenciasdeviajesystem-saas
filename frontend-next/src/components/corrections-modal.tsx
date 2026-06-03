'use client';

import { useState, useEffect } from 'react';
import { getEntryCorrections } from '@/lib/attendance-api';

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
  correctedBy: {
    fullName: string;
    email: string;
  };
  createdAt: string;
}

interface CorrectionsModalProps {
  entryId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const formatDuration = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined) return '-';
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  return `${minutes}m ${secs}s`;
};

const formatDateTime = (dateString: string): string => {
  return new Date(dateString).toLocaleString();
};

export function CorrectionsModal({ entryId, isOpen, onClose }: CorrectionsModalProps) {
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

    loadCorrections();
  }, [isOpen, entryId]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose}></div>
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Historial de Correcciones</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              ✕
            </button>
          </div>

          {loading ? (
            <div className="p-6 text-center text-gray-600">Cargando historial...</div>
          ) : corrections.length === 0 ? (
            <div className="p-6 text-center text-gray-600">No hay correcciones para este marcaje</div>
          ) : (
            <div className="p-6 space-y-6">
              {corrections.map((correction) => (
                <div key={correction.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
                  {/* Header */}
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Corregido por {correction.correctedBy.fullName}</p>
                      <p className="text-xs text-gray-500">{formatDateTime(correction.createdAt)}</p>
                    </div>
                  </div>

                  {/* Reason */}
                  <div className="bg-blue-50 border border-blue-200 rounded p-3">
                    <p className="text-xs font-semibold text-blue-900 mb-1">Razón:</p>
                    <p className="text-sm text-blue-800">{correction.reason}</p>
                  </div>

                  {/* Changes grid */}
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    {/* Type change */}
                    <div>
                      <p className="text-gray-500 mb-1">Estado</p>
                      <p className="text-gray-800">
                        <span className="line-through text-red-600">{correction.beforeType}</span>
                        {' → '}
                        <span className="text-green-600 font-semibold">{correction.afterType}</span>
                      </p>
                    </div>

                    {/* Duration change */}
                    <div>
                      <p className="text-gray-500 mb-1">Duración</p>
                      <p className="text-gray-800">
                        <span className="line-through text-red-600">{formatDuration(correction.beforeDuration)}</span>
                        {' → '}
                        <span className="text-green-600 font-semibold">{formatDuration(correction.afterDuration)}</span>
                      </p>
                    </div>

                    {/* Clock In change */}
                    <div className="col-span-2">
                      <p className="text-gray-500 mb-1">Inicio</p>
                      <p className="text-gray-800 text-xs">
                        <span className="line-through text-red-600">{formatDateTime(correction.beforeClockIn)}</span>
                        {' → '}
                        <span className="text-green-600 font-semibold">{formatDateTime(correction.afterClockIn)}</span>
                      </p>
                    </div>

                    {/* Clock Out change */}
                    <div className="col-span-2">
                      <p className="text-gray-500 mb-1">Fin</p>
                      <p className="text-gray-800 text-xs">
                        {correction.beforeClockOut ? (
                          <>
                            <span className="line-through text-red-600">{formatDateTime(correction.beforeClockOut)}</span>
                            {' → '}
                          </>
                        ) : (
                          ''
                        )}
                        <span className="text-green-600 font-semibold">
                          {correction.afterClockOut ? formatDateTime(correction.afterClockOut) : '-'}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

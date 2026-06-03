"use client";

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/auth-api';
import { getAttendanceMySummary, getAttendanceToday } from '@/lib/attendance-api';
import { LoadingModal } from '@/components/loading-modal';
import { CorrectionsModal } from '@/components/corrections-modal';

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

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

export default function MyTimesheetPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadingModalOpen, setLoadingModalOpen] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<"loading" | "success" | "error">("loading");
  const [loadingModalMessage, setLoadingModalMessage] = useState('');
  const [startDate, setStartDate] = useState(() => isoDate(new Date(new Date().setDate(new Date().getDate() - 7))));
  const [endDate, setEndDate] = useState(() => isoDate(new Date()));
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getAttendanceMySummary>> | null>(null);
  const [today, setToday] = useState<Awaited<ReturnType<typeof getAttendanceToday>> | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [isCorrectionsModalOpen, setIsCorrectionsModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, todayData] = await Promise.all([
        getAttendanceMySummary(startDate, endDate),
        getAttendanceToday(),
      ]);
      setSummary(summaryData);
      setToday(todayData);
    } catch (err) {
      setLoadingModalOpen(true);
      setLoadingModalState("error");
      setLoadingModalMessage(err instanceof Error ? err.message : 'No se pudo cargar el timesheet.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user?.id) {
      router.replace('/');
      return;
    }

    const role = String(session.user.role || '').toUpperCase();
    if (!['AGENT', 'OPERACIONES', 'VENTAS'].includes(role)) {
      router.replace('/contracts');
      return;
    }

    void load();
  }, [router, load]);

  const efficiency = useMemo(() => summary?.avgEfficiency ?? 0, [summary]);

  return (
    <main className="app-shell space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Mi Timesheet</h1>
        <p className="text-sm text-gray-600 mt-1">Consulta tus acumulados por periodo y tus marcajes de hoy.</p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Inicio</label>
            <input type="date" className="border rounded-md px-3 py-2" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Fin</label>
            <input type="date" className="border rounded-md px-3 py-2" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <button type="button" onClick={() => void load()} className="rounded-md bg-gray-900 text-white px-4 py-2 text-sm font-medium">Actualizar</button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
        <div className="rounded-lg bg-gray-50 p-3"><div className="text-gray-500">Horas pagadas</div><div className="font-semibold text-gray-900">{summary?.totalPaidHours ?? 0}</div></div>
        <div className="rounded-lg bg-gray-50 p-3"><div className="text-gray-500">Horas efectivas</div><div className="font-semibold text-gray-900">{summary?.totalEffectiveHours ?? 0}</div></div>
        <div className="rounded-lg bg-gray-50 p-3"><div className="text-gray-500">Horas OT</div><div className="font-semibold text-gray-900">{summary?.totalOtHours ?? 0}</div></div>
        <div className="rounded-lg bg-gray-50 p-3"><div className="text-gray-500">Eficiencia</div><div className="font-semibold text-gray-900">{efficiency}%</div></div>
        <div className="rounded-lg bg-gray-50 p-3"><div className="text-gray-500">Dias trabajados</div><div className="font-semibold text-gray-900">{summary?.workingDays ?? 0}</div></div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 overflow-x-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Marcajes de hoy</h2>
        {loading ? <p className="text-sm text-gray-600">Cargando...</p> : null}
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-600">
              <th className="py-2 pr-3">Estado</th>
              <th className="py-2 pr-3">Inicio</th>
              <th className="py-2 pr-3">Fin</th>
              <th className="py-2 pr-3">Duración</th>
              <th className="py-2 pr-3">Correcciones</th>
            </tr>
          </thead>
          <tbody>
            {(today?.entries || []).map((entry) => (
              <tr key={entry.id} className="border-b border-gray-100 text-gray-800">
                <td className="py-2 pr-3 font-medium">{entry.type}</td>
                <td className="py-2 pr-3">{new Date(entry.clockIn).toLocaleTimeString()}</td>
                <td className="py-2 pr-3">{entry.clockOut ? new Date(entry.clockOut).toLocaleTimeString() : '-'}</td>
                <td className="py-2 pr-3">{entry.type === 'OFF' ? '-' : formatDuration(entry.duration)}</td>
                <td className="py-2 pr-3">
                  {(entry.correctionCount || 0) > 0 ? (
                    <button
                      onClick={() => {
                        setSelectedEntryId(entry.id);
                        setIsCorrectionsModalOpen(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                    >
                      📝 Corregido ({entry.correctionCount})
                    </button>
                  ) : (
                    <span className="text-gray-400 text-xs">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <LoadingModal
        isOpen={loadingModalOpen}
        state={loadingModalState}
        loadingMessage={loadingModalMessage}
        successMessage={loadingModalMessage}
        errorMessage={loadingModalMessage}
        onClose={() => setLoadingModalOpen(false)}
        autoCloseDelay={2000}
      />

      <CorrectionsModal
        entryId={selectedEntryId}
        isOpen={isCorrectionsModalOpen}
        onClose={() => {
          setIsCorrectionsModalOpen(false);
          setSelectedEntryId(null);
        }}
      />
    </main>
  );
}

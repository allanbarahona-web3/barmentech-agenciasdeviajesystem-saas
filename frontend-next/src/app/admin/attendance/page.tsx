"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/auth-api';
import {
  getAttendanceAdminConfig,
  getAttendanceAdminEntries,
  getAttendanceAdminSummaries,
  updateAttendanceAdminConfig,
  AttendanceConfig,
} from '@/lib/attendance-api';
import { getEmployees, type Employee } from '@/lib/employees-api';
import { LoadingModal } from '@/components/loading-modal';
import { CorrectionEditModal } from '@/components/correction-edit-modal';

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

export default function AdminAttendancePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingModalOpen, setLoadingModalOpen] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<"loading" | "success" | "error">("loading");
  const [loadingModalMessage, setLoadingModalMessage] = useState('');
  const [config, setConfig] = useState<AttendanceConfig | null>(null);
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof getAttendanceAdminEntries>>>([]);
  const [startDate, setStartDate] = useState(() => isoDate(new Date(new Date().setDate(new Date().getDate() - 7))));
  const [endDate, setEndDate] = useState(() => isoDate(new Date()));
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<Awaited<ReturnType<typeof getAttendanceAdminEntries>>[number] | null>(null);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  
  // Filter states
  const [filterEmployeeId, setFilterEmployeeId] = useState('');
  const [filterOffset, setFilterOffset] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const [configData, employeesData] = await Promise.all([
        getAttendanceAdminConfig(),
        getEmployees(),
      ]);
      setConfig(configData);
      setEmployees(employeesData);
      setFilterOffset(0);
      void loadEntries(0);
    } catch (err) {
      setLoadingModalOpen(true);
      setLoadingModalState("error");
      setLoadingModalMessage(err instanceof Error ? err.message : 'No se pudo cargar attendance admin.');
    } finally {
      setLoading(false);
    }
  };

  const loadEntries = async (offset: number = 0) => {
    try {
      const params: Record<string, string> = {
        limit: '50',
        offset: String(offset),
      };

      // Reuse the global date range from the summaries section.
      if (startDate) {
        params.startDate = startDate;
      }
      if (endDate) {
        params.endDate = endDate;
      }
      if (filterEmployeeId) {
        params.userId = filterEmployeeId;
      }

      const entriesData = await getAttendanceAdminEntries(params);

      setEntries(entriesData);
      setFilterOffset(offset);
    } catch (err) {
      setLoadingModalOpen(true);
      setLoadingModalState("error");
      setLoadingModalMessage(err instanceof Error ? err.message : 'No se pudieron cargar los marcajes.');
    }
  };

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user?.id) {
      router.replace('/');
      return;
    }

    const role = String(session.user.role || '').toUpperCase();
    if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      router.replace('/contracts');
      return;
    }

    void load();
  }, [router]);

  const saveConfig = async () => {
    if (!config) {
      return;
    }
    setSaving(true);
    setLoadingModalOpen(true);
    setLoadingModalState("loading");
    setLoadingModalMessage("Guardando configuración...");
    
    try {
      const updated = await updateAttendanceAdminConfig({
        break1Duration: config.break1Duration,
        lunchDuration: config.lunchDuration,
        break2Duration: config.break2Duration,
        break3Duration: config.break3Duration,
        regularHours: config.regularHours,
        maxOtHours: config.maxOtHours,
        otEnabled: config.otEnabled,
      });
      setConfig(updated);
      setLoadingModalState("success");
      setLoadingModalMessage("Configuración actualizada exitosamente.");
    } catch (err) {
      setLoadingModalState("error");
      setLoadingModalMessage(err instanceof Error ? err.message : 'No se pudo guardar configuración.');
    } finally {
      setSaving(false);
    }
  };

  const loadSummaries = async () => {
    setLoadingModalOpen(true);
    setLoadingModalState("loading");
    setLoadingModalMessage("Cargando resúmenes...");
    
    try {
      const summaries = await getAttendanceAdminSummaries(startDate, endDate);
      if (summaries.length === 0) {
        setLoadingModalMessage("No hay resúmenes para ese rango.");
      } else {
        setLoadingModalMessage(`Resúmenes cargados: ${summaries.length}`);
      }
      await loadEntries(0);
      setLoadingModalState("success");
    } catch (err) {
      setLoadingModalState("error");
      setLoadingModalMessage(err instanceof Error ? err.message : 'No se pudieron cargar resúmenes.');
    }
  };

  return (
    <main className="app-shell space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Admin Attendance</h1>
        <p className="text-sm text-gray-600 mt-1">Configuración del módulo y tabla de marcajes (Fase 1).</p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Configuración</h2>
        {loading ? <p className="text-sm text-gray-600">Cargando configuración...</p> : null}
        {config ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="text-sm">Break1 (min)
              <input type="number" className="w-full mt-1 border rounded-md px-2 py-1" value={config.break1Duration} onChange={(e) => setConfig({ ...config, break1Duration: Number(e.target.value) || 0 })} />
            </label>
            <label className="text-sm">Lunch (min)
              <input type="number" className="w-full mt-1 border rounded-md px-2 py-1" value={config.lunchDuration} onChange={(e) => setConfig({ ...config, lunchDuration: Number(e.target.value) || 0 })} />
            </label>
            <label className="text-sm">Break2 (min)
              <input type="number" className="w-full mt-1 border rounded-md px-2 py-1" value={config.break2Duration} onChange={(e) => setConfig({ ...config, break2Duration: Number(e.target.value) || 0 })} />
            </label>
            <label className="text-sm">Break3 (min)
              <input type="number" className="w-full mt-1 border rounded-md px-2 py-1" value={config.break3Duration} onChange={(e) => setConfig({ ...config, break3Duration: Number(e.target.value) || 0 })} />
            </label>
            <label className="text-sm">Horas regulares
              <input type="number" className="w-full mt-1 border rounded-md px-2 py-1" value={config.regularHours} onChange={(e) => setConfig({ ...config, regularHours: Number(e.target.value) || 0 })} />
            </label>
            <label className="text-sm">Max OT
              <input type="number" className="w-full mt-1 border rounded-md px-2 py-1" value={config.maxOtHours} onChange={(e) => setConfig({ ...config, maxOtHours: Number(e.target.value) || 0 })} />
            </label>
          </div>
        ) : null}
        <div className="mt-4 flex gap-3">
          <button type="button" disabled={saving || loading} onClick={() => void saveConfig()} className="rounded-md bg-gray-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">Guardar configuración</button>
          <button type="button" onClick={() => void load()} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium">Recargar</button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Resúmenes por rango</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Inicio</label>
            <input type="date" className="border rounded-md px-3 py-2" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Fin</label>
            <input type="date" className="border rounded-md px-3 py-2" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <button type="button" onClick={() => void loadSummaries()} className="rounded-md bg-gray-900 text-white px-4 py-2 text-sm font-medium">Consultar resúmenes</button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Filtros de Marcajes</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Empleado</label>
            <select
              className="border rounded-md px-3 py-2 text-sm"
              value={filterEmployeeId}
              onChange={(e) => setFilterEmployeeId(e.target.value)}
            >
              <option value="">Todos</option>
              {employees
                .filter((employee) => Boolean(employee.userId))
                .map((employee) => (
                  <option key={employee.userId || employee.id} value={employee.userId || ''}>
                    {employee.fullName}
                  </option>
                ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void loadEntries(0)}
            className="rounded-md bg-gray-900 text-white px-4 py-2 text-sm font-medium"
          >
            Aplicar Filtros
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterEmployeeId('');
              setFilterOffset(0);
              void loadEntries(0);
            }}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium"
          >
            Limpiar
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 overflow-x-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Últimos marcajes</h2>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-600">
              <th className="py-2 pr-3">Usuario</th>
              <th className="py-2 pr-3">Estado</th>
              <th className="py-2 pr-3">Inicio</th>
              <th className="py-2 pr-3">Fin</th>
              <th className="py-2 pr-3">Duración</th>
              <th className="py-2 pr-3">OT</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-gray-100 text-gray-800 hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedEntryId(entry.id); setSelectedEntry(entry); setIsCorrectionModalOpen(true); }}>
                <td className="py-2 pr-3">{(entry as any).user?.fullName || entry.userId}</td>
                <td className="py-2 pr-3 font-medium">{entry.type}</td>
                <td className="py-2 pr-3">{new Date(entry.clockIn).toLocaleString()}</td>
                <td className="py-2 pr-3">{entry.clockOut ? new Date(entry.clockOut).toLocaleString() : '-'}</td>
                <td className="py-2 pr-3">{formatDuration(entry.duration)}</td>
                <td className="py-2 pr-3">{entry.isOT ? 'Sí' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex justify-center gap-2">
          {filterOffset > 0 && (
            <button
              type="button"
              onClick={() => void loadEntries(Math.max(0, filterOffset - 50))}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium"
            >
              Anterior
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadEntries(filterOffset + 50)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium"
          >
            Siguiente
          </button>
        </div>
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

      <CorrectionEditModal
        entryId={selectedEntryId}
        entry={selectedEntry}
        isOpen={isCorrectionModalOpen}
        onClose={() => {
          setIsCorrectionModalOpen(false);
          setSelectedEntryId(null);
          setSelectedEntry(null);
        }}
        onSuccess={() => void load()}
      />
    </main>
  );
}

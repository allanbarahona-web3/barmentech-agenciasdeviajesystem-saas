"use client";

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/auth-api';
import { formatBusinessDateTime } from '@/shared/regional';
import {
  getAttendanceAdminConfig,
  getAttendanceAdminEntriesPaginated,
  getAttendanceEmployeeOptions,
  updateAttendanceAdminConfig,
  type AttendanceAdminListItem,
  type AttendanceConfig,
  type AttendanceEmployeeOption,
  type AttendanceState,
} from '@/lib/attendance-api';
import { AdminAttendanceCorrectionsDialog } from '@/components/admin-attendance-corrections-dialog';
import { CorrectionEditModal } from '@/components/correction-edit-modal';
import { LoadingModal } from '@/components/loading-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/icon-badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataTableShell } from '@/components/patterns/data-table-shell';
import { FormField } from '@/components/patterns/form-field';
import { FormSheet } from '@/components/patterns/form-sheet';
import { PageHeader } from '@/components/patterns/page-header';
import { SectionCard } from '@/components/patterns/section-card';
import { Clock3, History, RotateCcw, Search, Settings2 } from 'lucide-react';

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const getDefaultStartDate = () => isoDate(new Date(new Date().setDate(new Date().getDate() - 7)));
const getDefaultEndDate = () => isoDate(new Date());
const ATTENDANCE_PAGE_SIZE = 50;

type AttendanceFilters = {
  startDate: string;
  endDate: string;
  userId: string;
};

const ATTENDANCE_STATE_PRESENTATION: Record<AttendanceState, { label: string; variant: 'success' | 'warning' | 'info' | 'secondary' }> = {
  WORKING: { label: 'Trabajando', variant: 'success' },
  MEETING: { label: 'En reunión', variant: 'info' },
  BREAK1: { label: 'Descanso 1', variant: 'warning' },
  LUNCH: { label: 'Almuerzo', variant: 'warning' },
  BREAK2: { label: 'Descanso 2', variant: 'warning' },
  BREAK3: { label: 'Descanso 3', variant: 'warning' },
  OT: { label: 'Horas extra', variant: 'info' },
  OFF: { label: 'Fuera', variant: 'secondary' },
};

const formatDuration = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined) return '-';
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  return hours > 0 ? `${hours}h ${minutes}m ${secs}s` : `${minutes}m ${secs}s`;
};

function AttendanceStateBadge({ state }: { state: AttendanceState }) {
  const presentation = ATTENDANCE_STATE_PRESENTATION[state] || { label: state, variant: 'secondary' as const };
  return <Badge variant={presentation.variant}>{presentation.label}</Badge>;
}

export default function AdminAttendancePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingModalOpen, setLoadingModalOpen] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<'loading' | 'success' | 'error'>('loading');
  const [loadingModalMessage, setLoadingModalMessage] = useState('');
  const [config, setConfig] = useState<AttendanceConfig | null>(null);
  const [entries, setEntries] = useState<AttendanceAdminListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [startDate, setStartDate] = useState(() => getDefaultStartDate());
  const [endDate, setEndDate] = useState(() => getDefaultEndDate());
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<AttendanceAdminListItem | null>(null);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [historyEntryId, setHistoryEntryId] = useState<string | null>(null);
  const [isCorrectionsModalOpen, setIsCorrectionsModalOpen] = useState(false);
  const [employeeOptions, setEmployeeOptions] = useState<AttendanceEmployeeOption[]>([]);
  const [filterEmployeeId, setFilterEmployeeId] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<AttendanceFilters>(() => ({
    startDate: getDefaultStartDate(),
    endDate: getDefaultEndDate(),
    userId: '',
  }));
  const [isConfigSheetOpen, setIsConfigSheetOpen] = useState(false);
  const entriesRequestControllerRef = useRef<AbortController | null>(null);
  const entriesRequestGenerationRef = useRef(0);
  const initialAppliedFiltersRef = useRef(appliedFilters);

  const loadEntries = useCallback(async (requestedPage: number, filters: AttendanceFilters) => {
    entriesRequestControllerRef.current?.abort();
    const controller = new AbortController();
    const requestGeneration = entriesRequestGenerationRef.current + 1;
    entriesRequestControllerRef.current = controller;
    entriesRequestGenerationRef.current = requestGeneration;

    try {
      let pageToLoad = requestedPage;

      while (true) {
        const entriesData = await getAttendanceAdminEntriesPaginated({
          page: pageToLoad,
          pageSize: ATTENDANCE_PAGE_SIZE,
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
          userId: filters.userId || undefined,
        }, { signal: controller.signal });

        if (requestGeneration !== entriesRequestGenerationRef.current) {
          return;
        }

        const validTotalPages = Math.max(entriesData.totalPages, 1);
        if (entriesData.total > 0 && pageToLoad > validTotalPages) {
          pageToLoad = validTotalPages;
          continue;
        }

        setEntries(entriesData.items);
        setTotal(entriesData.total);
        setTotalPages(validTotalPages);
        setPage(entriesData.total === 0 ? 1 : pageToLoad);
        return;
      }
    } catch (err) {
      if (!controller.signal.aborted && requestGeneration === entriesRequestGenerationRef.current) {
        setLoadingModalOpen(true);
        setLoadingModalState('error');
        setLoadingModalMessage(err instanceof Error ? err.message : 'No se pudieron cargar los marcajes.');
      }
    }
  }, []);

  const load = useCallback(async (filters: AttendanceFilters) => {
    setLoading(true);
    setLoadingModalOpen(true);
    setLoadingModalState('loading');
    setLoadingModalMessage('Recargando asistencia...');
    try {
      const [configData, optionsData] = await Promise.all([
        getAttendanceAdminConfig(),
        getAttendanceEmployeeOptions(),
      ]);
      setConfig(configData);
      setEmployeeOptions(optionsData);
      setPage(1);
      await loadEntries(1, filters);
      setLoadingModalState('success');
      setLoadingModalMessage('Asistencia actualizada.');
    } catch (err) {
      setLoadingModalState('error');
      setLoadingModalMessage(err instanceof Error ? err.message : 'No se pudo cargar la administración de asistencia.');
    } finally {
      setLoading(false);
    }
  }, [loadEntries]);

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

    void load(initialAppliedFiltersRef.current);
  }, [load, router]);

  useEffect(() => {
    return () => entriesRequestControllerRef.current?.abort();
  }, []);

  const saveConfig = async () => {
    if (!config) return;

    setSaving(true);
    setLoadingModalOpen(true);
    setLoadingModalState('loading');
    setLoadingModalMessage('Guardando configuración...');

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
      setLoadingModalState('success');
      setLoadingModalMessage('Configuración actualizada exitosamente.');
    } catch (err) {
      setLoadingModalState('error');
      setLoadingModalMessage(err instanceof Error ? err.message : 'No se pudo guardar configuración.');
    } finally {
      setSaving(false);
    }
  };

  const openCorrection = (entry: AttendanceAdminListItem) => {
    setSelectedEntryId(entry.id);
    setSelectedEntry(entry);
    setIsCorrectionModalOpen(true);
  };

  const searchEntries = async () => {
    setLoadingModalOpen(true);
    setLoadingModalState('loading');
    setLoadingModalMessage('Buscando marcajes...');
    try {
      const nextFilters = {
        startDate,
        endDate,
        userId: filterEmployeeId,
      };
      setAppliedFilters(nextFilters);
      setPage(1);
      await loadEntries(1, nextFilters);
      setLoadingModalState('success');
      setLoadingModalMessage('Marcajes cargados correctamente.');
    } catch {
      // Error already handled in loadEntries.
    }
  };

  const clearFilters = async () => {
    const defaultStartDate = getDefaultStartDate();
    const defaultEndDate = getDefaultEndDate();

    setLoadingModalOpen(true);
    setLoadingModalState('loading');
    setLoadingModalMessage('Restableciendo filtros...');

    setFilterEmployeeId('');
    setStartDate(defaultStartDate);
    setEndDate(defaultEndDate);
    setPage(1);

    try {
      const nextFilters = {
        startDate: defaultStartDate,
        endDate: defaultEndDate,
        userId: '',
      };
      setAppliedFilters(nextFilters);
      await loadEntries(1, nextFilters);
      setLoadingModalState('success');
      setLoadingModalMessage('Filtros restablecidos.');
    } catch {
      // Error already handled in loadEntries.
    }
  };

  return (
    <main className="app-shell space-y-6">
      <PageHeader
        title={<span className="flex items-center gap-3"><IconBadge tone="primary"><Clock3 aria-hidden="true" /></IconBadge>Control de asistencia</span>}
        description="Consulta marcajes, corrige registros y administra la configuración de asistencia."
        actions={<Button type="button" onClick={() => setIsConfigSheetOpen(true)}><Settings2 aria-hidden="true" />Configuración</Button>}
      />

      <SectionCard
        title={<span className="flex items-center gap-2"><IconBadge tone="info" size="sm"><Search aria-hidden="true" /></IconBadge>Filtros</span>}
        contentClassName="pt-4"
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-12">
          <FormField className="xl:col-span-3" htmlFor="attendance-filter-employee" label="Empleado">
            <Select id="attendance-filter-employee" value={filterEmployeeId} onChange={(event) => setFilterEmployeeId(event.target.value)}>
              <option value="">Todos</option>
              {employeeOptions.map((employee) => (
                <option key={employee.userId} value={employee.userId}>{employee.fullName}</option>
              ))}
            </Select>
          </FormField>
          <FormField className="xl:col-span-2" htmlFor="attendance-filter-start" label="Fecha de inicio">
            <Input id="attendance-filter-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </FormField>
          <FormField className="xl:col-span-2" htmlFor="attendance-filter-end" label="Fecha de fin">
            <Input id="attendance-filter-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </FormField>
          <div className="flex items-end gap-2 xl:col-span-5">
            <Button type="button" onClick={() => void searchEntries()}><Search aria-hidden="true" />Buscar</Button>
            <Button type="button" variant="outline" onClick={() => void clearFilters()}><RotateCcw aria-hidden="true" />Limpiar</Button>
          </div>
        </div>
      </SectionCard>

      <DataTableShell
        toolbar={<div><h2 className="text-base font-semibold">Marcajes recientes</h2><p className="mt-1 text-sm text-muted-foreground">Selecciona un registro para corregirlo o consultar su historial.</p></div>}
        state={loading ? <p>Cargando marcajes...</p> : entries.length === 0 ? <p>No hay marcajes para los filtros seleccionados.</p> : null}
        footer={(
          <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>Mostrando {total === 0 ? 0 : ((page - 1) * ATTENDANCE_PAGE_SIZE) + 1}–{Math.min(page * ATTENDANCE_PAGE_SIZE, total)} de {total} registros</span>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap">Página {page} de {totalPages}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadEntries(page - 1, appliedFilters)} disabled={page <= 1}>Anterior</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadEntries(page + 1, appliedFilters)} disabled={page >= totalPages || total === 0}>Siguiente</Button>
            </div>
          </div>
        )}
      >
        <Table className="min-w-[1040px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[22%]">Empleado</TableHead>
              <TableHead className="w-[13%] whitespace-nowrap">Estado</TableHead>
              <TableHead className="w-[17%] whitespace-nowrap">Inicio</TableHead>
              <TableHead className="w-[17%] whitespace-nowrap">Fin</TableHead>
              <TableHead className="w-[11%] whitespace-nowrap">Duración</TableHead>
              <TableHead className="w-[9%] whitespace-nowrap">Horas extra</TableHead>
              <TableHead className="w-[11%] whitespace-nowrap text-right">Correcciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id} className="cursor-pointer" onClick={() => openCorrection(entry)}>
                <TableCell className="truncate">
                  <Button type="button" variant="ghost" className="h-auto max-w-full justify-start p-0 text-left font-medium text-foreground hover:bg-transparent hover:text-primary" title={entry.user.fullName || '-'} onClick={(event) => {
                    event.stopPropagation();
                    openCorrection(entry);
                  }}>
                    <span className="truncate">{entry.user.fullName || '-'}</span>
                  </Button>
                </TableCell>
                <TableCell className="whitespace-nowrap"><AttendanceStateBadge state={entry.type} /></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatBusinessDateTime(entry.clockIn)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{entry.clockOut ? formatBusinessDateTime(entry.clockOut) : '-'}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDuration(entry.duration)}</TableCell>
                <TableCell className="whitespace-nowrap"><Badge variant={entry.isOT ? 'warning' : 'secondary'}>{entry.isOT ? 'Sí' : 'No'}</Badge></TableCell>
                <TableCell className="text-right">
                  {(entry.correctionCount || 0) > 0 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={(event) => {
                      event.stopPropagation();
                      setHistoryEntryId(entry.id);
                      setIsCorrectionsModalOpen(true);
                    }}>
                      <History aria-hidden="true" />Corregido ({entry.correctionCount})
                    </Button>
                  ) : <span className="text-sm text-muted-foreground">-</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableShell>

      <FormSheet
        open={isConfigSheetOpen}
        onOpenChange={setIsConfigSheetOpen}
        title="Configuración de asistencia"
        description="Ajusta los tiempos utilizados por las reglas de asistencia."
        actions={(
          <>
            <Button type="button" variant="outline" disabled={loading} onClick={() => void load(appliedFilters)}><RotateCcw aria-hidden="true" />Recargar</Button>
            <Button type="button" disabled={saving || loading || !config} onClick={() => void saveConfig()}><Settings2 aria-hidden="true" />Guardar configuración</Button>
          </>
        )}
      >
        {loading ? <p className="text-sm text-muted-foreground">Cargando configuración...</p> : config ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField htmlFor="attendance-config-break1" label="Descanso 1 (min)"><Input id="attendance-config-break1" type="number" value={config.break1Duration} onChange={(event) => setConfig({ ...config, break1Duration: Number(event.target.value) || 0 })} /></FormField>
            <FormField htmlFor="attendance-config-lunch" label="Almuerzo (min)"><Input id="attendance-config-lunch" type="number" value={config.lunchDuration} onChange={(event) => setConfig({ ...config, lunchDuration: Number(event.target.value) || 0 })} /></FormField>
            <FormField htmlFor="attendance-config-break2" label="Descanso 2 (min)"><Input id="attendance-config-break2" type="number" value={config.break2Duration} onChange={(event) => setConfig({ ...config, break2Duration: Number(event.target.value) || 0 })} /></FormField>
            <FormField htmlFor="attendance-config-break3" label="Descanso 3 (min)"><Input id="attendance-config-break3" type="number" value={config.break3Duration} onChange={(event) => setConfig({ ...config, break3Duration: Number(event.target.value) || 0 })} /></FormField>
            <FormField htmlFor="attendance-config-regular-hours" label="Horas regulares"><Input id="attendance-config-regular-hours" type="number" value={config.regularHours} onChange={(event) => setConfig({ ...config, regularHours: Number(event.target.value) || 0 })} /></FormField>
            <FormField htmlFor="attendance-config-max-ot-hours" label="Máximo de horas extra"><Input id="attendance-config-max-ot-hours" type="number" value={config.maxOtHours} onChange={(event) => setConfig({ ...config, maxOtHours: Number(event.target.value) || 0 })} /></FormField>
          </div>
        ) : null}
      </FormSheet>

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
        onSuccess={() => void loadEntries(page, appliedFilters)}
      />

      <AdminAttendanceCorrectionsDialog
        entryId={historyEntryId}
        isOpen={isCorrectionsModalOpen}
        onClose={() => {
          setIsCorrectionsModalOpen(false);
          setHistoryEntryId(null);
        }}
      />
    </main>
  );
}

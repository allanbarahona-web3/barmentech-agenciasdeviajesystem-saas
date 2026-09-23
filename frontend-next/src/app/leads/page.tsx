'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search, UserPlus, Users } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/icon-badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataTableShell } from '@/components/patterns/data-table-shell';
import { PageHeader } from '@/components/patterns/page-header';
import { LeadQuickCreateModal } from '@/features/leads/components/LeadQuickCreateModal';
import { canAccessLeadWorkspace, leadStatusLabel } from '@/features/leads/lead-workspace';
import { getHomeRouteForRole, getStoredSession } from '@/lib/auth-api';
import {
  getLeads,
  LEAD_LIST_DEFAULT_PAGE_SIZE,
  type LeadListResponse,
  type LeadStatus,
} from '@/lib/leads-api';
import { useTenantDateTimeFormatter } from '@/shared/regional/tenant-regional-provider';

type StatusFilter = 'ALL' | LeadStatus;

export default function LeadsPage() {
  const router = useRouter();
  const formatTenantDateTime = useTenantDateTimeFormatter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<LeadListResponse | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    const session = getStoredSession();
    const role = String(session?.user?.role ?? '').toUpperCase();
    if (!session?.user?.id) {
      router.replace('/');
      return;
    }
    if (!canAccessLeadWorkspace(role)) {
      router.replace(getHomeRouteForRole(role));
      return;
    }
    setAuthorized(true);
  }, [router]);

  const loadLeads = useCallback(async (overrides?: { page?: number; search?: string; status?: StatusFilter }) => {
    const requestedPage = overrides?.page ?? page;
    const requestedSearch = overrides?.search ?? search;
    const requestedStatus = overrides?.status ?? status;

    try {
      setLoading(true);
      setLoadError(null);
      const response = await getLeads({
        page: requestedPage,
        pageSize: LEAD_LIST_DEFAULT_PAGE_SIZE,
        search: requestedSearch || undefined,
        status: requestedStatus === 'ALL' ? undefined : requestedStatus,
      });
      setLeads(response);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar los prospectos.');
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    if (authorized) {
      void loadLeads();
    }
  }, [authorized, loadLeads]);

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateStatus(value: StatusFilter) {
    setStatus(value);
    setPage(1);
  }

  function handleLeadCreated() {
    setShowCreateModal(false);
    setSearch('');
    setStatus('ALL');
    setPage(1);
    void loadLeads({ page: 1, search: '', status: 'ALL' });
  }

  if (!authorized) {
    return null;
  }

  const tableState = loading ? (
    <div className="mx-auto grid max-w-sm gap-3" aria-label="Cargando prospectos">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  ) : loadError ? (
    <Alert variant="destructive" className="mx-auto max-w-lg text-left">
      <AlertTitle>No se pudieron cargar los prospectos</AlertTitle>
      <AlertDescription>{loadError}</AlertDescription>
    </Alert>
  ) : leads?.items.length === 0 ? (
    <div className="mx-auto max-w-sm">
      <IconBadge tone="info" className="mx-auto mb-3"><Users aria-hidden="true" /></IconBadge>
      <p className="font-medium text-foreground">No se encontraron prospectos</p>
      <p className="mt-1 text-muted-foreground">{search || status !== 'ALL' ? 'Intenta con otros filtros.' : 'Los prospectos registrados aparecerán aquí.'}</p>
    </div>
  ) : null;

  return (
    <main className="app-shell">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title={<span className="flex items-center gap-3"><IconBadge tone="primary"><Users aria-hidden="true" /></IconBadge>Prospectos</span>}
          description="Gestiona los contactos comerciales antes de que se conviertan en clientes."
          meta={leads ? <Badge variant="info"><Users aria-hidden="true" /> {leads.total} prospectos</Badge> : undefined}
          actions={<Button type="button" onClick={() => setShowCreateModal(true)}><UserPlus aria-hidden="true" />Crear prospecto</Button>}
        />

        <DataTableShell
          toolbar={
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Lista de prospectos</h2>
                <p className="mt-1 text-sm text-muted-foreground">Busca por nombre, correo, teléfono o empresa.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:max-w-xl sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground" aria-hidden="true" />
                  <label className="sr-only" htmlFor="lead-search">Buscar prospecto</label>
                  <Input id="lead-search" type="search" placeholder="Buscar prospecto" value={search} onChange={(event) => updateSearch(event.target.value)} className="pl-9" />
                </div>
                <label className="sr-only" htmlFor="lead-status">Filtrar por estado</label>
                <Select id="lead-status" value={status} onChange={(event) => updateStatus(event.target.value as StatusFilter)} className="sm:w-40">
                  <option value="ALL">Todos los estados</option>
                  <option value="OPEN">Abierto</option>
                  <option value="CONVERTED">Convertido</option>
                </Select>
              </div>
            </div>
          }
          footer={
            leads && leads.totalPages > 1 ? (
              <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground">Página {leads.page} de {leads.totalPages} · {leads.total} prospectos en total</p>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}><ChevronLeft aria-hidden="true" />Anterior</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => Math.min(leads.totalPages, current + 1))} disabled={page === leads.totalPages}>Siguiente<ChevronRight aria-hidden="true" /></Button>
                </div>
              </div>
            ) : null
          }
          state={tableState}
        >
          {leads ? (
            <Table className="min-w-[900px]">
              <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Correo</TableHead><TableHead>Teléfono</TableHead><TableHead>Empresa</TableHead><TableHead>Estado</TableHead><TableHead>Fecha de creación</TableHead></TableRow></TableHeader>
              <TableBody>
                {leads.items.map((lead) => (
                  <TableRow key={lead.id} role="link" tabIndex={0} aria-label={`Ver prospecto ${lead.fullName}`} className="cursor-pointer focus-visible:bg-accent focus-visible:outline-none" onClick={() => router.push(`/leads/${lead.id}`)} onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      router.push(`/leads/${lead.id}`);
                    }
                  }}>
                    <TableCell className="font-medium text-foreground">{lead.fullName}</TableCell>
                    <TableCell className="text-muted-foreground">{lead.email}</TableCell>
                    <TableCell className="text-muted-foreground">{lead.phone || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{lead.companyName || '—'}</TableCell>
                    <TableCell><Badge variant={lead.status === 'OPEN' ? 'info' : 'secondary'}>{leadStatusLabel(lead.status)}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatTenantDateTime(lead.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </DataTableShell>
      </div>

      <LeadQuickCreateModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onLeadCreated={handleLeadCreated} />
    </main>
  );
}

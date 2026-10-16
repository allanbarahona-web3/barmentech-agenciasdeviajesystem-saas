'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, FileText, Plus, Search } from 'lucide-react';

import AttachmentViewer, { type Attachment } from '@/components/attachment-viewer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/icon-badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTableShell } from '@/components/patterns/data-table-shell';
import { PageHeader } from '@/components/patterns/page-header';
import { CustomerProfileLink, LeadDetailLink } from '@/components/profile-detail-link';
import { CustomQuotationEditorDialog } from '@/features/custom-quotations/components/CustomQuotationEditorDialog';
import { quotationStatusLabel } from '@/features/custom-quotations/custom-quotation-presentation';
import {
  createCustomQuotation,
  CUSTOM_QUOTATION_PAGE_SIZE,
  getCustomQuotationProposal,
  listCustomQuotations,
  type CustomQuotationInput,
  type CustomQuotationRecipientGroup,
  type CustomQuotationRecipientGroupList,
  type CustomQuotationStatus,
} from '@/lib/custom-quotations-api';
import { useTenantDateTimeFormatter } from '@/shared/regional/tenant-regional-provider';

const statusOrder: CustomQuotationStatus[] = ['ACCEPTED', 'ISSUED', 'DRAFT', 'REJECTED', 'EXPIRED', 'CANCELLED'];

export default function CustomQuotationsPage() {
  const router = useRouter();
  const formatTenantDateTime = useTenantDateTimeFormatter();
  const [data, setData] = useState<CustomQuotationRecipientGroupList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | CustomQuotationStatus>('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [proposalViewer, setProposalViewer] = useState<{ quotationId: string; versionId: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await listCustomQuotations({ page, pageSize: CUSTOM_QUOTATION_PAGE_SIZE, search: search || undefined, status: status || undefined }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar las cotizaciones.');
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { void load(); }, [load]);

  function toggleGroup(key: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const resolveProposalUrl = useCallback(async () => {
    if (!proposalViewer) throw new Error('No se pudo cargar la propuesta.');
    try {
      const proposal = await getCustomQuotationProposal(proposalViewer.quotationId, proposalViewer.versionId);
      if (!proposal) throw new Error('CUSTOM_QUOTATION_PROPOSAL_NOT_FOUND');
      return proposal.url;
    } catch {
      throw new Error('No se pudo cargar la propuesta.');
    }
  }, [proposalViewer]);

  const state = loading ? <div className="grid gap-3"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-full" /></div>
    : error ? <Alert variant="destructive"><AlertTitle>No se pudieron cargar las cotizaciones</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
      : data?.recipientGroups.length === 0 ? <div><IconBadge tone="info" className="mx-auto"><FileText aria-hidden="true" /></IconBadge><p className="mt-3 font-medium">No hay cotizaciones</p><p className="mt-1">Cree un borrador para comenzar.</p></div>
        : null;

  return <main className="app-shell"><div className="mx-auto max-w-7xl space-y-6">
    <PageHeader title={<span className="flex items-center gap-3"><IconBadge tone="primary"><FileText aria-hidden="true" /></IconBadge>Cotizaciones personalizadas</span>} description="Gestione borradores comerciales para prospectos y clientes." actions={<Button type="button" onClick={() => setCreateOpen(true)}><Plus aria-hidden="true" />Nueva cotización</Button>} />
    <DataTableShell
      toolbar={<div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden="true" /><label className="sr-only" htmlFor="quotation-search">Buscar cotización</label><Input id="quotation-search" className="pl-9" placeholder="Buscar por destinatario, número o asunto" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div><Select value={status} onChange={(event) => { setStatus(event.target.value as '' | CustomQuotationStatus); setPage(1); }} className="sm:w-44"><option value="">Todos los estados</option><option value="DRAFT">Borrador</option><option value="ISSUED">Emitida</option><option value="ACCEPTED">Aceptada</option><option value="REJECTED">Rechazada</option><option value="EXPIRED">Vencida</option><option value="CANCELLED">Cancelada</option></Select></div>}
      state={state}
      footer={data && data.totalPages > 1 ? <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Página {data.page} de {data.totalPages}</span><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft aria-hidden="true" />Anterior</Button><Button type="button" size="sm" variant="outline" disabled={page === data.totalPages} onClick={() => setPage((value) => value + 1)}>Siguiente<ChevronRight aria-hidden="true" /></Button></div></div> : null}
    >
      {data ? <div className="space-y-3">{data.recipientGroups.map((group) => <RecipientGroupAccordion key={group.key} group={group} expanded={expandedGroups.has(group.key)} onToggle={() => toggleGroup(group.key)} onOpenQuotation={(quotationId) => router.push(`/custom-quotations/${quotationId}`)} onViewProposal={(quotationId, versionId) => setProposalViewer({ quotationId, versionId })} formatTenantDateTime={formatTenantDateTime} />)}</div> : null}
    </DataTableShell>
  </div><CustomQuotationEditorDialog isOpen={createOpen} onClose={() => setCreateOpen(false)} onSubmit={async (input: CustomQuotationInput) => { const created = await createCustomQuotation(input); router.push(`/custom-quotations/${created.id}`); }} />{proposalViewer ? <AttachmentViewer attachments={[proposalAttachment(proposalViewer)]} resolveAttachmentUrl={resolveProposalUrl} onClose={() => setProposalViewer(null)} /> : null}</main>;
}

function RecipientGroupAccordion({ group, expanded, onToggle, onOpenQuotation, onViewProposal, formatTenantDateTime }: {
  group: CustomQuotationRecipientGroup;
  expanded: boolean;
  onToggle: () => void;
  onOpenQuotation: (quotationId: string) => void;
  onViewProposal: (quotationId: string, versionId: string) => void;
  formatTenantDateTime: (value: string) => string;
}) {
  const typeLabel = group.recipient.type === 'CUSTOMER' ? 'Cliente' : 'Prospecto';
  return <section className="rounded-xl border border-border bg-card p-2 sm:p-3"><div className="flex items-center gap-2"><button type="button" className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-lg bg-muted/50 px-3 py-3.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4" aria-expanded={expanded} onClick={onToggle}><div className="min-w-0"><p className="truncate text-base font-semibold text-foreground">{group.recipient.displayName}</p><div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"><Badge variant="outline">{typeLabel}</Badge><span>{group.quotationCount} {group.quotationCount === 1 ? 'cotización' : 'cotizaciones'}</span><span aria-hidden="true">·</span><span>{statusSummaryText(group)}</span></div></div><ChevronDown aria-hidden="true" className={`size-5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>{group.recipient.type === 'CUSTOMER' ? <CustomerProfileLink customerId={group.recipient.id} /> : <LeadDetailLink leadId={group.recipient.id} />}</div>
    {expanded ? <div className="mt-3 ml-4 space-y-2 border-l-2 border-border pl-3 sm:ml-6 sm:pl-4">{group.quotations.map((quotation) => <div key={quotation.id} className="flex flex-col gap-2 rounded-lg border border-border/80 bg-background px-3 py-2.5 sm:flex-row sm:items-center"><button type="button" className="grid min-w-0 flex-1 gap-2 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4" onClick={() => onOpenQuotation(quotation.id)}><div className="min-w-0"><p className="font-semibold text-foreground">{quotation.quotationNumber}</p><p className="mt-0.5 truncate text-sm text-muted-foreground">{quotation.title}</p></div><div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground sm:justify-end"><Badge variant={quotationStatusVariant(quotation.status)}>{quotationStatusLabel(quotation.status)}</Badge><span>{quotation.currency}</span><span>Vigencia: {formatDateOnly(quotation.quotationValidUntil)}</span><span>Creada: {formatTenantDateTime(quotation.createdAt)}</span></div></button>{quotation.hasProposalPdf && quotation.proposalVersionId ? <Button type="button" size="sm" className="shrink-0" onClick={(event) => { event.stopPropagation(); onViewProposal(quotation.id, quotation.proposalVersionId!); }}><FileText aria-hidden="true" />Ver propuesta</Button> : null}</div>)}</div> : null}
  </section>;
}

function proposalAttachment(viewer: { quotationId: string; versionId: string }): Attachment {
  return { id: `${viewer.quotationId}:${viewer.versionId}`, originalFileName: 'propuesta-comercial.pdf', mimeType: 'application/pdf' };
}

function statusSummaryText(group: CustomQuotationRecipientGroup) {
  return statusOrder.filter((status) => group.statusSummary[status] > 0).map((status) => `${group.statusSummary[status]} ${quotationStatusLabel(status).toLowerCase()}`).join(' · ');
}

function quotationStatusVariant(status: CustomQuotationStatus) {
  if (status === 'ACCEPTED') return 'success';
  if (status === 'REJECTED') return 'destructive';
  if (status === 'EXPIRED' || status === 'CANCELLED') return 'warning';
  return status === 'DRAFT' || status === 'ISSUED' ? 'info' : 'secondary';
}

function formatDateOnly(value: string | null) {
  return value ? value.slice(0, 10).split('-').reverse().join('/') : '—';
}

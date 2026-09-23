'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, FileText, UserRound } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/icon-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/patterns/page-header';
import { SectionCard } from '@/components/patterns/section-card';
import { leadCommercialActivity } from '@/features/leads/lead-quotation-activity';
import { canAccessLeadWorkspace, leadStatusLabel } from '@/features/leads/lead-workspace';
import { getHomeRouteForRole, getStoredSession } from '@/lib/auth-api';
import { formatFinanceMoneyDisplay } from '@/lib/finance-money-display';
import { quotationStatusLabel } from '@/features/custom-quotations/custom-quotation-presentation';
import { getLeadCustomQuotationSummaries, type LeadCustomQuotationSummaryList } from '@/lib/custom-quotations-api';
import { getLead, type Lead } from '@/lib/leads-api';
import { useTenantDateTimeFormatter } from '@/shared/regional/tenant-regional-provider';

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const formatTenantDateTime = useTenantDateTimeFormatter();
  const leadId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lead, setLead] = useState<Lead | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'QUOTATIONS' | 'ACTIVITY'>('SUMMARY');
  const [quotations, setQuotations] = useState<LeadCustomQuotationSummaryList | null>(null);
  const [quotationsLoading, setQuotationsLoading] = useState(false);
  const [quotationsError, setQuotationsError] = useState<string | null>(null);

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

  const loadLead = useCallback(async () => {
    if (!leadId) return;
    try {
      setLoading(true);
      setLoadError(null);
      setLead(await getLead(leadId));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'No se pudo cargar el prospecto.');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  const loadQuotations = useCallback(async (page = 1) => {
    if (!leadId) return;
    try {
      setQuotationsLoading(true);
      setQuotationsError(null);
      setQuotations(await getLeadCustomQuotationSummaries(leadId, { page }));
    } catch {
      setQuotationsError('No se pudieron cargar las cotizaciones del prospecto.');
    } finally {
      setQuotationsLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (authorized && leadId) {
      void loadLead();
    }
  }, [authorized, leadId, loadLead]);

  useEffect(() => {
    if (authorized && leadId && activeTab !== 'SUMMARY' && !quotations && !quotationsLoading) {
      void loadQuotations();
    }
  }, [activeTab, authorized, leadId, loadQuotations, quotations, quotationsLoading]);

  if (!authorized) return null;

  if (loading) {
    return <main className="app-shell"><div className="mx-auto grid max-w-7xl gap-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div></main>;
  }

  if (loadError || !lead) {
    return <main className="app-shell"><div className="mx-auto max-w-7xl"><Alert variant="destructive"><AlertTitle>No se pudo cargar el prospecto</AlertTitle><AlertDescription>{loadError || 'El prospecto no está disponible.'}</AlertDescription></Alert><Button type="button" variant="outline" className="mt-4" onClick={() => void loadLead()}>Intentar nuevamente</Button></div></main>;
  }

  return (
    <main className="app-shell">
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          eyebrow={<Button type="button" variant="ghost" size="sm" onClick={() => router.push('/leads')}><ArrowLeft aria-hidden="true" />Volver a prospectos</Button>}
          title={<span className="flex items-center gap-3"><IconBadge tone="primary"><UserRound aria-hidden="true" /></IconBadge>{lead.fullName}</span>}
          description={lead.email}
          meta={<Badge variant={lead.status === 'OPEN' ? 'info' : 'secondary'}>{leadStatusLabel(lead.status)}</Badge>}
        />

        <nav className="flex flex-wrap gap-2" aria-label="Secciones del prospecto">
          <Button type="button" size="sm" variant={activeTab === 'SUMMARY' ? 'default' : 'outline'} aria-current={activeTab === 'SUMMARY' ? 'page' : undefined} onClick={() => setActiveTab('SUMMARY')}>Resumen</Button>
          <Button type="button" size="sm" variant={activeTab === 'QUOTATIONS' ? 'default' : 'outline'} aria-current={activeTab === 'QUOTATIONS' ? 'page' : undefined} onClick={() => setActiveTab('QUOTATIONS')}>Cotizaciones</Button>
          <Button type="button" size="sm" variant={activeTab === 'ACTIVITY' ? 'default' : 'outline'} aria-current={activeTab === 'ACTIVITY' ? 'page' : undefined} onClick={() => setActiveTab('ACTIVITY')}>Actividad</Button>
        </nav>

        {lead.status === 'CONVERTED' ? (
          <Alert>
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>Prospecto convertido</AlertTitle>
            <AlertDescription>Este prospecto ya fue convertido a cliente. Su información comercial se muestra solo como referencia.</AlertDescription>
          </Alert>
        ) : null}

        {activeTab === 'SUMMARY' ? <SectionCard title="Resumen" description="Información comercial del prospecto.">
          <dl className="grid gap-5 sm:grid-cols-2">
            <DetailField label="Nombre completo" value={lead.fullName} />
            <DetailField label="Correo electrónico" value={lead.email} />
            <DetailField label="Teléfono" value={lead.phone || '—'} />
            <DetailField label="Empresa" value={lead.companyName || '—'} />
            <DetailField label="Creado" value={formatTenantDateTime(lead.createdAt)} />
            <DetailField label="Actualizado" value={formatTenantDateTime(lead.updatedAt)} />
          </dl>
        </SectionCard> : null}

        {activeTab === 'QUOTATIONS' ? <LeadQuotationsTab quotations={quotations} loading={quotationsLoading} error={quotationsError} formatTenantDateTime={formatTenantDateTime} onRetry={() => void loadQuotations()} onPageChange={(page) => void loadQuotations(page)} onOpenQuotation={(quotationId) => router.push(`/custom-quotations/${encodeURIComponent(quotationId)}`)} onCreateQuotation={() => router.push('/custom-quotations')} /> : null}

        {activeTab === 'ACTIVITY' ? <LeadActivityTab lead={lead} quotations={quotations} loading={quotationsLoading} error={quotationsError} formatTenantDateTime={formatTenantDateTime} onRetry={() => void loadQuotations()} onPageChange={(page) => void loadQuotations(page)} /> : null}
      </div>
    </main>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 text-sm text-foreground">{value}</dd></div>;
}

type DateTimeFormatter = (value: string) => string;

function LeadQuotationsTab({ quotations, loading, error, formatTenantDateTime, onRetry, onPageChange, onOpenQuotation, onCreateQuotation }: {
  quotations: LeadCustomQuotationSummaryList | null;
  loading: boolean;
  error: string | null;
  formatTenantDateTime: DateTimeFormatter;
  onRetry: () => void;
  onPageChange: (page: number) => void;
  onOpenQuotation: (quotationId: string) => void;
  onCreateQuotation: () => void;
}) {
  if (loading && !quotations) return <SectionCard title="Cotizaciones"><Skeleton className="h-48 w-full" /></SectionCard>;
  if (error) return <SectionCard title="Cotizaciones"><Alert variant="destructive"><AlertTitle>No se pudieron cargar las cotizaciones</AlertTitle><AlertDescription>{error}</AlertDescription></Alert><Button className="mt-4" type="button" variant="outline" onClick={onRetry}>Intentar nuevamente</Button></SectionCard>;
  if (!quotations || quotations.items.length === 0) return <SectionCard title="Cotizaciones"><div className="space-y-4"><p className="text-sm text-muted-foreground">Este prospecto todavía no tiene cotizaciones.</p><Button type="button" onClick={onCreateQuotation}><FileText aria-hidden="true" />Crear cotización</Button></div></SectionCard>;

  return <SectionCard title="Cotizaciones" description="Historial comercial del prospecto.">
    <div className="grid gap-3">{quotations.items.map((quotation) => <article key={quotation.id} className="rounded-lg border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{quotation.quotationNumber}</p><p className="mt-1 text-sm text-muted-foreground">{quotation.title}</p></div><Badge variant="secondary">{quotationStatusLabel(quotation.status)}</Badge></div><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><DetailField label="Precio" value={quotation.latestVersion ? formatFinanceMoneyDisplay(quotation.latestVersion.finalSellingPrice, quotation.currency) : 'Pendiente'} /><DetailField label="Moneda" value={quotation.currency} /><DetailField label="Creada" value={formatTenantDateTime(quotation.createdAt)} /><DetailField label="Vigencia" value={formatDateOnly(quotation.quotationValidUntil)} />{quotation.latestVersion?.salesOrder ? <DetailField label="Orden de venta" value={quotation.latestVersion.salesOrder.orderNumber || 'Orden de venta creada'} /> : null}</dl><Button className="mt-4" type="button" size="sm" variant="outline" onClick={() => onOpenQuotation(quotation.id)}>Ver</Button></article>)}</div>
    <QuotationPagination quotations={quotations} loading={loading} onPageChange={onPageChange} />
  </SectionCard>;
}

function LeadActivityTab({ lead, quotations, loading, error, formatTenantDateTime, onRetry, onPageChange }: {
  lead: Lead;
  quotations: LeadCustomQuotationSummaryList | null;
  loading: boolean;
  error: string | null;
  formatTenantDateTime: DateTimeFormatter;
  onRetry: () => void;
  onPageChange: (page: number) => void;
}) {
  if (loading && !quotations) return <SectionCard title="Actividad"><Skeleton className="h-48 w-full" /></SectionCard>;
  if (error) return <SectionCard title="Actividad"><Alert variant="destructive"><AlertTitle>No se pudo cargar la actividad</AlertTitle><AlertDescription>{error}</AlertDescription></Alert><Button className="mt-4" type="button" variant="outline" onClick={onRetry}>Intentar nuevamente</Button></SectionCard>;
  const activities = leadCommercialActivity(lead, quotations?.items ?? []);
  return <SectionCard title="Actividad" description="Hitos comerciales registrados."><ol className="space-y-3">{activities.map((activity) => <li key={activity.id} className="border-l-2 border-border pl-4"><p className="text-sm font-medium">{activity.label}</p><p className="mt-1 text-xs text-muted-foreground">{formatTenantDateTime(activity.timestamp)}</p></li>)}</ol>{quotations ? <QuotationPagination quotations={quotations} loading={loading} onPageChange={onPageChange} /> : null}</SectionCard>;
}

function QuotationPagination({ quotations, loading, onPageChange }: { quotations: LeadCustomQuotationSummaryList; loading: boolean; onPageChange: (page: number) => void }) {
  if (quotations.totalPages <= 1) return null;
  return <div className="mt-5 flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Página {quotations.page} de {quotations.totalPages}</p><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={loading || quotations.page <= 1} onClick={() => onPageChange(quotations.page - 1)}>Anterior</Button><Button type="button" size="sm" variant="outline" disabled={loading || quotations.page >= quotations.totalPages} onClick={() => onPageChange(quotations.page + 1)}>Siguiente</Button></div></div>;
}

function formatDateOnly(value: string | null) { return value ? value.slice(0, 10).split('-').reverse().join('/') : '—'; }

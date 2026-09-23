'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, UserRound } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/icon-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/patterns/page-header';
import { SectionCard } from '@/components/patterns/section-card';
import { canAccessLeadWorkspace, leadStatusLabel } from '@/features/leads/lead-workspace';
import { getHomeRouteForRole, getStoredSession } from '@/lib/auth-api';
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

  useEffect(() => {
    if (authorized && leadId) {
      void loadLead();
    }
  }, [authorized, leadId, loadLead]);

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
          <Button type="button" size="sm" aria-current="page">Resumen</Button>
          <Button type="button" size="sm" variant="outline" disabled>Cotizaciones · Próximamente</Button>
          <Button type="button" size="sm" variant="outline" disabled>Actividad · Próximamente</Button>
        </nav>

        {lead.status === 'CONVERTED' ? (
          <Alert>
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>Prospecto convertido</AlertTitle>
            <AlertDescription>Este prospecto ya fue convertido a cliente. Su información comercial se muestra solo como referencia.</AlertDescription>
          </Alert>
        ) : null}

        <SectionCard title="Resumen" description="Información comercial del prospecto.">
          <dl className="grid gap-5 sm:grid-cols-2">
            <DetailField label="Nombre completo" value={lead.fullName} />
            <DetailField label="Correo electrónico" value={lead.email} />
            <DetailField label="Teléfono" value={lead.phone || '—'} />
            <DetailField label="Empresa" value={lead.companyName || '—'} />
            <DetailField label="Creado" value={formatTenantDateTime(lead.createdAt)} />
            <DetailField label="Actualizado" value={formatTenantDateTime(lead.updatedAt)} />
          </dl>
        </SectionCard>
      </div>
    </main>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 text-sm text-foreground">{value}</dd></div>;
}

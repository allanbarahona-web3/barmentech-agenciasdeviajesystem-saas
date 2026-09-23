'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns/page-header';
import { SectionCard } from '@/components/patterns/section-card';
import { Skeleton } from '@/components/ui/skeleton';
import { GenericCostComposition } from '@/features/cost-engine/generic-cost-composition';
import { CustomQuotationEditorDialog } from '@/features/custom-quotations/components/CustomQuotationEditorDialog';
import { CustomQuotationProposalTab } from '@/features/custom-quotations/components/CustomQuotationProposalTab';
import { paymentConditionLabel, quotationStatusLabel, quotationTargetLabel } from '@/features/custom-quotations/custom-quotation-presentation';
import {
  createCustomQuotationCostEngineApi,
  getCustomQuotation,
  getCustomQuotationCommercialLines,
  resolveCustomQuotationCostingProject,
  updateCustomQuotation,
  type CustomQuotationCommercialLine,
  type CustomQuotationCostingProject,
  type CustomQuotationDetail,
} from '@/lib/custom-quotations-api';

type WorkspaceTab = 'DETAIL' | 'COSTS' | 'QUOTE';

export default function CustomQuotationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [quotation, setQuotation] = useState<CustomQuotationDetail | null>(null);
  const [commercialLines, setCommercialLines] = useState<CustomQuotationCommercialLine[]>([]);
  const [commercialLinesLoading, setCommercialLinesLoading] = useState(true);
  const [commercialLinesError, setCommercialLinesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('DETAIL');
  const [costingProject, setCostingProject] = useState<CustomQuotationCostingProject | null>(null);
  const [costingLoading, setCostingLoading] = useState(false);
  const [costingError, setCostingError] = useState<string | null>(null);
  const scopedCostApi = useMemo(() => id ? createCustomQuotationCostEngineApi(id) : null, [id]);

  const loadCommercialLines = useCallback(async () => {
    if (!id) return;
    setCommercialLinesLoading(true);
    setCommercialLinesError(null);
    try {
      const response = await getCustomQuotationCommercialLines(id);
      setCommercialLines(response.lines);
    } catch {
      setCommercialLinesError('No se pudieron cargar los servicios de la cotización.');
    } finally {
      setCommercialLinesLoading(false);
    }
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const nextQuotation = await getCustomQuotation(id);
      setQuotation(nextQuotation);
      await loadCommercialLines();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cargar la cotización.');
    } finally {
      setLoading(false);
    }
  }, [id, loadCommercialLines]);

  const handleCompositionChanged = useCallback(() => { void loadCommercialLines(); }, [loadCommercialLines]);

  useEffect(() => { void load(); }, [load]);

  async function openCosts() {
    if (!id) return;
    setActiveTab('COSTS');
    if (costingProject || costingLoading) return;
    setCostingLoading(true);
    setCostingError(null);
    try {
      setCostingProject(await resolveCustomQuotationCostingProject(id));
    } catch (caught) {
      setCostingError(caught instanceof Error ? caught.message : 'No se pudo abrir los costos de la cotización.');
    } finally {
      setCostingLoading(false);
    }
  }

  if (loading) {
    return <main className="app-shell"><div className="mx-auto grid max-w-5xl gap-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-72 w-full" /></div></main>;
  }
  if (error || !quotation) {
    return <main className="app-shell"><Alert variant="destructive"><AlertTitle>No se pudo cargar la cotización</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></main>;
  }

  const draft = quotation.status === 'DRAFT';
  const noCommercialLines = !commercialLinesLoading && commercialLines.length === 0;

  return <main className="app-shell"><div className="mx-auto max-w-5xl space-y-6">
    <PageHeader
      eyebrow={<Button type="button" variant="ghost" size="sm" onClick={() => router.push('/custom-quotations')}><ArrowLeft aria-hidden="true" />Volver a cotizaciones</Button>}
      title={quotation.quotationNumber}
      description={quotation.title}
      meta={<Badge variant={draft ? 'info' : 'secondary'}>{quotationStatusLabel(quotation.status)}</Badge>}
      actions={draft ? <Button type="button" onClick={() => setEditorOpen(true)}><Pencil aria-hidden="true" />Editar detalle</Button> : undefined}
    />

    <nav className="flex flex-wrap gap-2" aria-label="Secciones de cotización">
      <Button type="button" size="sm" variant={activeTab === 'DETAIL' ? 'default' : 'outline'} aria-current={activeTab === 'DETAIL' ? 'page' : undefined} onClick={() => setActiveTab('DETAIL')}>Detalle</Button>
      <Button type="button" size="sm" variant={activeTab === 'COSTS' ? 'default' : 'outline'} aria-current={activeTab === 'COSTS' ? 'page' : undefined} onClick={() => void openCosts()}>Costos</Button>
      <Button type="button" size="sm" variant={activeTab === 'QUOTE' ? 'default' : 'outline'} aria-current={activeTab === 'QUOTE' ? 'page' : undefined} onClick={() => setActiveTab('QUOTE')}>Cotización</Button>
    </nav>

    <div hidden={activeTab !== 'DETAIL'} className="space-y-6">
      <SectionCard title="Información comercial"><dl className="grid gap-4 sm:grid-cols-2">
        <Field label="Destinatario" value={quotation.target?.displayName ?? '—'} />
        <Field label="Tipo de destinatario" value={quotationTargetLabel(quotation.target)} />
        <Field label="Correo" value={quotation.target?.email ?? '—'} />
        <Field label="Teléfono" value={quotation.target?.phone ?? '—'} />
        <Field label="Moneda" value={quotation.currency} />
        <Field label="Vigencia" value={formatDateOnly(quotation.quotationValidUntil)} />
        <Field label="Condición de pago" value={paymentConditionLabel(quotation.paymentConditionType, quotation.paymentTermValue, quotation.paymentTermUnit)} />
        <Field label="Observaciones" value={quotation.commercialObservations || '—'} />
      </dl></SectionCard>

      <SectionCard title="Servicios cotizados" description="Representación comercial generada desde los componentes estructurados de costos.">
        {commercialLinesError ? <Alert variant="destructive"><AlertTitle>No se pudieron cargar los servicios</AlertTitle><AlertDescription>{commercialLinesError}</AlertDescription></Alert> : null}
        {commercialLinesLoading ? <Skeleton className="h-24 w-full" /> : null}
        {noCommercialLines ? <div className="space-y-3"><p className="text-sm text-muted-foreground">No hay servicios agregados a esta cotización.</p><p className="text-sm text-muted-foreground">Agrega los servicios desde la sección de Costos.</p>{draft ? <Button type="button" onClick={() => void openCosts()}>Ir a Costos</Button> : null}</div> : null}
        {!commercialLinesLoading && commercialLines.length > 0 ? <ol className="grid gap-3">{commercialLines.map((line) => <li key={`${line.displayOrder}-${line.description}`} className="rounded-lg border border-border p-4"><p className="font-medium">{line.description}</p><dl className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Cantidad" value={line.quantity} />{line.commercialNote ? <Field label="Detalle" value={line.commercialNote} /> : null}</dl></li>)}</ol> : null}
      </SectionCard>
      {draft && noCommercialLines ? <Alert variant="warning"><AlertDescription>Agrega al menos un servicio antes de emitir la cotización.</AlertDescription></Alert> : null}

      <CustomQuotationEditorDialog isOpen={editorOpen} onClose={() => setEditorOpen(false)} quotation={quotation} onSubmit={async (input) => { await updateCustomQuotation(quotation.id, input); await load(); }} />
    </div>

    {activeTab === 'COSTS' ? <section aria-label="Costos de cotización">
      {costingLoading ? <Skeleton className="h-96 w-full" /> : null}
      {costingError ? <Alert variant="destructive"><AlertTitle>No se pudieron abrir los costos</AlertTitle><AlertDescription>{costingError}</AlertDescription></Alert> : null}
      {costingProject && scopedCostApi ? <GenericCostComposition costingProjectId={costingProject.costingProjectId} baseCurrency={costingProject.baseCurrency} canEdit={quotation.status === 'DRAFT'} contextLabel={`Costos de la cotización ${quotation.quotationNumber}`} api={scopedCostApi} onCompositionChanged={handleCompositionChanged} /> : null}
    </section> : null}

    {activeTab === 'QUOTE' ? <CustomQuotationProposalTab quotation={quotation} commercialLines={commercialLines} onIssued={load} onQuotationRefreshed={load} /> : null}
  </div></main>;
}

function formatDateOnly(value: string | null) { return value ? value.slice(0, 10).split('-').reverse().join('/') : '—'; }
function Field({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>; }

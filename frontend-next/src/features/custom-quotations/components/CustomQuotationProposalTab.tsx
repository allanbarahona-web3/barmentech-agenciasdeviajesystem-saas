'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, FileText, LoaderCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SectionCard } from '@/components/patterns/section-card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatFinanceMoneyDisplay } from '@/lib/finance-money-display';
import {
  acceptCustomQuotationVersion,
  calculateCustomQuotationPricing,
  generateCustomQuotationProposal,
  getCustomQuotationPricing,
  getCustomQuotationProposal,
  getLatestCustomQuotationVersion,
  issueCustomQuotation,
  rejectCustomQuotationVersion,
  sendCustomQuotationProposal,
  type CustomQuotationDetail,
  type CustomQuotationCommercialLine,
  type CustomQuotationPricing,
  type CustomQuotationProposalDocument,
  type CustomQuotationVersion,
} from '@/lib/custom-quotations-api';
import { paymentConditionLabel, quotationStatusLabel } from '@/features/custom-quotations/custom-quotation-presentation';
import { CustomQuotationSalesOrderCompletion } from '@/features/custom-quotations/components/CustomQuotationSalesOrderCompletion';
import { useTenantDateTimeFormatter } from '@/shared/regional/tenant-regional-provider';

type CustomQuotationProposalTabProps = {
  quotation: CustomQuotationDetail;
  commercialLines: CustomQuotationCommercialLine[];
  stateRevision: number;
  onIssued: () => Promise<void>;
  onQuotationRefreshed: () => Promise<void>;
};

export function CustomQuotationProposalTab({ quotation, commercialLines, stateRevision, onIssued, onQuotationRefreshed }: CustomQuotationProposalTabProps) {
  const formatTenantDateTime = useTenantDateTimeFormatter();
  const draft = quotation.status === 'DRAFT';
  const [pricing, setPricing] = useState<CustomQuotationPricing | null>(null);
  const [pricingLoading, setPricingLoading] = useState(draft);
  const [pricingCalculating, setPricingCalculating] = useState(false);
  const [version, setVersion] = useState<CustomQuotationVersion | null>(null);
  const [versionLoading, setVersionLoading] = useState(!draft);
  const [proposal, setProposal] = useState<CustomQuotationProposalDocument | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [issueMessage, setIssueMessage] = useState<string | null>(null);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [deliveryRefreshError, setDeliveryRefreshError] = useState<string | null>(null);
  const [manualDecision, setManualDecision] = useState<'ACCEPT' | 'REJECT' | null>(null);
  const [manualTransitionPending, setManualTransitionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestLifecycleKeyRef = useRef<string | null>(null);
  const latestRequestRef = useRef<Promise<CustomQuotationVersion> | null>(null);
  const proposalCacheRef = useRef(new Map<string, CustomQuotationProposalDocument | null>());
  const proposalRequestRef = useRef(new Map<string, Promise<CustomQuotationProposalDocument | null>>());

  const lifecycleKey = (quotationId: string, status: string) => `${quotationId}:${status}`;

  const loadProposal = useCallback(async (versionId: string, force = false) => {
    if (force) proposalCacheRef.current.delete(versionId);
    if (!force && proposalCacheRef.current.has(versionId)) {
      const cached = proposalCacheRef.current.get(versionId) ?? null;
      setProposal(cached);
      return cached;
    }

    setProposalLoading(true);
    setProposalError(null);
    try {
      let request = proposalRequestRef.current.get(versionId);
      if (!request) {
        request = getCustomQuotationProposal(quotation.id, versionId);
        proposalRequestRef.current.set(versionId, request);
      }
      const document = await request;
      proposalCacheRef.current.set(versionId, document);
      setProposal(document);
      return document;
    } catch {
      setProposalError('No se pudo cargar el documento de la propuesta.');
      return null;
    } finally {
      proposalRequestRef.current.delete(versionId);
      setProposalLoading(false);
    }
  }, [quotation.id]);

  const refreshVersion = useCallback(async ({ loadDocument = false }: { loadDocument?: boolean } = {}) => {
    setVersionLoading(true);
    setError(null);
    try {
      let request = latestRequestRef.current;
      if (!request) {
        request = getLatestCustomQuotationVersion(quotation.id);
        latestRequestRef.current = request;
      }
      const value = await request;
      setVersion(value);
      latestLifecycleKeyRef.current = lifecycleKey(value.quotationId, value.status);
      setVersionLoading(false);
      if (value.status === 'ISSUED' && loadDocument) await loadProposal(value.versionId);
      if (value.status !== 'ISSUED') setProposal(null);
      return value;
    } catch {
      setError('No se pudo cargar la versión emitida de la cotización.');
      return null;
    } finally {
      latestRequestRef.current = null;
      setVersionLoading(false);
    }
  }, [loadProposal, quotation.id]);

  useEffect(() => {
    setError(null);
    if (quotation.status !== 'ISSUED') setIssueMessage(null);
    if (draft) {
      latestLifecycleKeyRef.current = null;
      setVersion(null);
      setProposal(null);
      setProposalError(null);
      setPricingLoading(true);
      void getCustomQuotationPricing(quotation.id)
        .then(setPricing)
        .catch(() => setError('No se pudo cargar el precio.'))
        .finally(() => setPricingLoading(false));
      return;
    }

    setPricing(null);
    if (latestLifecycleKeyRef.current === lifecycleKey(quotation.id, quotation.status)) return;
    void refreshVersion({ loadDocument: true });
  }, [draft, quotation.id, quotation.status, refreshVersion, stateRevision]);

  const missingPricing = !pricingLoading && (!pricing || !pricing.hasCalculation);
  const stalePricing = Boolean(pricing?.hasCalculation && pricing.stale);
  const noLines = commercialLines.length === 0;
  const issueBlocked = missingPricing || stalePricing || noLines;

  async function calculatePrice() {
    if (!draft || pricingCalculating) return;
    setPricingCalculating(true);
    setError(null);
    try {
      const result = await calculateCustomQuotationPricing(quotation.id);
      setPricing({ ...result, hasCalculation: true });
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : '';
      setError(code.includes('DEFAULT_PRICING_POLICY')
        ? 'No hay una política de precios configurada para cotizaciones personalizadas.'
        : 'No se puede calcular el precio todavía. Revisa Costos e inténtalo nuevamente.');
    } finally {
      setPricingCalculating(false);
    }
  }

  async function issue() {
    if (issuing || issueBlocked) return;
    setIssuing(true);
    setError(null);
    setIssueMessage(null);
    try {
      await issueCustomQuotation(quotation.id);
      const issued = await refreshVersion({ loadDocument: true });
      await onIssued();
      if (!issued) throw new Error('CUSTOM_QUOTATION_VERSION_REQUEST_FAILED');
      setIssueMessage('La cotización fue emitida correctamente y quedó registrada como una versión inmutable.');
    } catch (requestError) {
      setError(issueErrorMessage(requestError));
    } finally {
      setIssuing(false);
    }
  }

  async function generateProposal() {
    if (!version || generating) return;
    setGenerating(true);
    setError(null);
    try {
      await generateCustomQuotationProposal(quotation.id, version.versionId);
      await loadProposal(version.versionId, true);
    } catch {
      setError('No se pudo generar el PDF de la propuesta. Intente nuevamente.');
    } finally {
      setGenerating(false);
    }
  }

  async function sendProposal() {
    if (!version || !proposal || version.status !== 'ISSUED' || sending) return;
    setSending(true);
    setError(null);
    setDeliveryMessage(null);
    setDeliveryRefreshError(null);
    try {
      await sendCustomQuotationProposal(quotation.id, version.versionId);
      setDeliveryMessage('Cotización enviada correctamente.');
      const refreshed = await refreshVersion();
      if (!refreshed) {
        setError(null);
        setDeliveryRefreshError('El correo se envió, pero no se pudo actualizar su estado. Actualiza la cotización para confirmarlo.');
      }
    } catch (requestError) {
      setError(deliveryErrorMessage(requestError));
    } finally {
      setSending(false);
    }
  }

  async function submitManualDecision() {
    if (!version || !manualDecision || manualTransitionPending) return;
    setManualTransitionPending(true);
    setError(null);
    try {
      if (manualDecision === 'ACCEPT') {
        await acceptCustomQuotationVersion(quotation.id, version.versionId);
      } else {
        await rejectCustomQuotationVersion(quotation.id, version.versionId);
      }
      await refreshVersion();
      await onQuotationRefreshed();
      setManualDecision(null);
    } catch (requestError) {
      if (approvalStateChanged(requestError)) {
        await refreshVersion();
        await onQuotationRefreshed();
        setManualDecision(null);
        return;
      }
      setError(manualApprovalErrorMessage(requestError, manualDecision));
    } finally {
      setManualTransitionPending(false);
    }
  }

  if (draft) {
    return <section aria-label="Cotización" className="space-y-4">
      {error ? <ProposalError message={error} /> : null}
      <SectionCard title="Información de la cotización" description="Revise la información antes de emitir la cotización.">
        <dl className="grid gap-4 sm:grid-cols-2">
          <ProposalField label="Número de cotización" value={quotation.quotationNumber} />
          <ProposalField label="Destinatario" value={quotation.target?.displayName ?? '—'} />
          <ProposalField label="Correo" value={quotation.target?.email ?? '—'} />
          <ProposalField label="Moneda" value={quotation.currency} />
          <ProposalField label="Vigencia" value={formatDateOnly(quotation.quotationValidUntil)} />
          <ProposalField label="Condición de pago" value={paymentConditionLabel(quotation.paymentConditionType, quotation.paymentTermValue, quotation.paymentTermUnit)} />
          <ProposalField label="Observaciones" value={quotation.commercialObservations || '—'} />
        </dl>
      </SectionCard>
      <SectionCard title="Servicios cotizados">{commercialLines.length ? <ol className="grid gap-3">{commercialLines.map((line) => <li key={`${line.displayOrder}-${line.description}`} className="rounded-lg border border-border p-4"><p className="font-medium">{line.description}</p><dl className="mt-3 grid gap-3 sm:grid-cols-2"><ProposalField label="Cantidad" value={line.quantity} />{line.commercialNote ? <ProposalField label="Detalle" value={line.commercialNote} /> : null}</dl></li>)}</ol> : <p className="text-sm text-muted-foreground">No hay servicios agregados.</p>}</SectionCard>
      <SectionCard title="Precio">
        {pricingLoading ? <Skeleton className="h-10 w-48" /> : null}
        {!pricingLoading && !pricing?.hasCalculation ? <div className="space-y-4"><p className="text-sm text-muted-foreground">No hay un precio calculado todavía.</p><Button type="button" onClick={() => void calculatePrice()} disabled={pricingCalculating}>{pricingCalculating ? 'Calculando…' : 'Calcular precio'}</Button></div> : null}
        {!pricingLoading && pricing?.hasCalculation ? <div className="space-y-4"><dl className="grid gap-4 sm:grid-cols-2"><ProposalField label="Precio" value={pricing.finalSellingPrice ? formatFinanceMoneyDisplay(pricing.finalSellingPrice, pricing.currency) : '—'} /><ProposalField label="Estado del precio" value={pricingStatusLabel(pricing.status)} /></dl>{stalePricing ? <Alert variant="warning"><AlertDescription>Los costos cambiaron. Recalcula el precio antes de emitir.</AlertDescription></Alert> : null}<Button type="button" onClick={() => void calculatePrice()} disabled={pricingCalculating}>{pricingCalculating ? 'Calculando…' : 'Recalcular precio'}</Button></div> : null}
      </SectionCard>
      <SectionCard title="Emisión">{missingPricing ? <Alert variant="warning"><AlertDescription>Calcula el precio antes de emitir la cotización.</AlertDescription></Alert> : null}{stalePricing ? <Alert className="mt-3" variant="warning"><AlertDescription>Los costos cambiaron. Recalcula el precio antes de emitir.</AlertDescription></Alert> : null}{noLines ? <Alert className="mt-3" variant="warning"><AlertDescription>Agrega al menos un servicio antes de emitir la cotización.</AlertDescription></Alert> : null}<Button className="mt-4" type="button" onClick={() => void issue()} disabled={issuing || issueBlocked}>{issuing ? 'Emitiendo…' : 'Emitir cotización'}</Button></SectionCard>
    </section>;
  }

  if (versionLoading) return <section aria-label="Cotización"><Skeleton className="h-96 w-full" /></section>;
  if (!version) return <section aria-label="Cotización">{error ? <ProposalError message={error} /> : null}</section>;

  const manualApprovalAvailable = quotation.status === 'ISSUED' && version.status === 'ISSUED';
  const hasConfirmedDelivery = Boolean(version.delivery) && !deliveryRefreshError;

  return <section aria-label="Cotización" className="space-y-4">
    {error ? <ProposalError message={error} /> : null}
    {issueMessage && quotation.status === 'ISSUED' ? <Alert variant="success" role="status"><CheckCircle2 aria-hidden="true" className="size-4" /><AlertTitle>Cotización emitida</AlertTitle><AlertDescription>{issueMessage}</AlertDescription></Alert> : null}
    {quotation.status === 'ACCEPTED' ? <Alert variant="success" role="status"><CheckCircle2 aria-hidden="true" className="size-4" /><AlertTitle>Cotización aceptada</AlertTitle><AlertDescription>Esta cotización fue aceptada y está lista para continuar con el proceso comercial.{version.acceptedAt ? ` Aceptada el ${formatTenantDateTime(version.acceptedAt)}.` : ''}</AlertDescription></Alert> : null}
    {quotation.status === 'REJECTED' ? <Alert variant="destructive" role="status"><AlertTitle>Cotización rechazada</AlertTitle><AlertDescription>Esta cotización fue registrada como rechazada.</AlertDescription></Alert> : null}
    <SectionCard title="Cotización emitida" description="Esta versión es inmutable y refleja la cotización emitida.">
      <div className="mb-5 flex flex-wrap items-center gap-3"><span className="text-lg font-semibold">{version.quotationNumber}</span><Badge variant="secondary">Versión {version.versionNumber}</Badge><Badge variant="secondary">{quotationStatusLabel(version.status)}</Badge></div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <ProposalField label="Destinatario" value={version.recipientFullName ?? '—'} />
        <ProposalField label="Correo" value={version.recipientEmail ?? '—'} />
        {version.recipientPhone ? <ProposalField label="Teléfono" value={version.recipientPhone} /> : null}
        {version.recipientCompanyName ? <ProposalField label="Empresa" value={version.recipientCompanyName} /> : null}
        <ProposalField label="Precio" value={formatFinanceMoneyDisplay(version.finalSellingPrice, version.currency)} />
        <ProposalField label="Moneda" value={version.currency} />
        <ProposalField label="Vigencia" value={formatDateOnly(version.quotationValidUntil)} />
        <ProposalField label="Condición de pago" value={paymentConditionLabel(version.paymentConditionType, version.paymentTermValue, version.paymentTermUnit)} />
        <ProposalField label="Emitida el" value={formatTenantDateTime(version.createdAt)} />
        <ProposalField label="Observaciones" value={version.commercialObservations || '—'} />
      </dl>
      {hasConfirmedDelivery && version.delivery ? <Alert className="mt-5" variant="success" role="status"><CheckCircle2 aria-hidden="true" className="size-4" /><AlertTitle>Enviada por correo</AlertTitle><AlertDescription><span className="block">{version.delivery.recipientEmail}</span><span className="block">{formatTenantDateTime(version.delivery.sentAt)}</span></AlertDescription></Alert> : null}
      <div className="mt-5 border-t border-border pt-4"><p className="text-sm font-medium">Servicios cotizados</p><ol className="mt-3 grid gap-3">{version.lines.map((line) => <li key={line.id} className="rounded-lg border border-border p-4"><p className="font-medium">{line.description}</p><dl className="mt-3 grid gap-3 sm:grid-cols-2"><ProposalField label="Cantidad" value={line.quantity} />{line.commercialNote ? <ProposalField label="Detalle" value={line.commercialNote} /> : null}</dl></li>)}</ol></div>
      {version.status === 'ISSUED' ? <div className="mt-5 space-y-3">{proposalLoading ? <Skeleton className="h-10 w-48" /> : null}{proposalError ? <Alert variant="destructive"><AlertTitle>No se pudo cargar la propuesta</AlertTitle><AlertDescription>{proposalError}</AlertDescription><Button className="mt-3" type="button" variant="outline" onClick={() => void loadProposal(version.versionId, true)}>Reintentar cargar propuesta</Button></Alert> : null}{!proposalLoading && !proposalError && proposal ? <div className="flex flex-wrap gap-2"><Button asChild type="button"><a href={proposal.url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Ver propuesta</a></Button><Button type="button" onClick={() => void sendProposal()} disabled={sending}>{sending ? 'Enviando…' : hasConfirmedDelivery ? 'Reenviar por correo' : 'Enviar por correo'}</Button></div> : null}{!proposalLoading && !proposalError && !proposal ? <><Alert variant="warning"><AlertDescription>Genera la propuesta antes de enviarla.</AlertDescription></Alert><Button type="button" onClick={() => void generateProposal()} disabled={generating}>{generating ? 'Generando…' : <><FileText aria-hidden="true" />Generar PDF</>}</Button></> : null}{deliveryMessage ? <Alert variant="success" role="status"><CheckCircle2 aria-hidden="true" className="size-4" /><AlertTitle>Cotización enviada</AlertTitle><AlertDescription>{deliveryMessage}</AlertDescription></Alert> : null}{deliveryRefreshError ? <Alert variant="warning"><AlertTitle>No se pudo actualizar el estado de envío</AlertTitle><AlertDescription>{deliveryRefreshError}</AlertDescription></Alert> : null}</div> : null}
    </SectionCard>
    {manualApprovalAvailable ? <SectionCard title="Aprobación" description="Registra aquí la decisión del cliente si la confirmación se recibió por otro medio.">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="success" onClick={() => setManualDecision('ACCEPT')} disabled={manualTransitionPending}>{manualTransitionPending && manualDecision === 'ACCEPT' ? <><LoaderCircle aria-hidden="true" className="animate-spin" />Registrando…</> : 'Aceptar manualmente'}</Button>
        <Button type="button" variant="destructive" onClick={() => setManualDecision('REJECT')} disabled={manualTransitionPending}>{manualTransitionPending && manualDecision === 'REJECT' ? <><LoaderCircle aria-hidden="true" className="animate-spin" />Registrando…</> : 'Rechazar manualmente'}</Button>
      </div>
    </SectionCard> : null}
    {quotation.status === 'ACCEPTED' ? <CustomQuotationSalesOrderCompletion quotation={quotation} version={version} onVersionRefreshed={refreshVersion} onQuotationRefreshed={onQuotationRefreshed} /> : null}
    <Dialog open={Boolean(manualDecision)} onOpenChange={(open) => { if (!open && !manualTransitionPending) setManualDecision(null); }}>
      <DialogContent showCloseButton={!manualTransitionPending}>
        <DialogHeader>
          <DialogTitle>{manualDecision === 'ACCEPT' ? 'Confirmar aceptación' : 'Confirmar rechazo'}</DialogTitle>
          <DialogDescription>{manualDecision === 'ACCEPT' ? '¿Deseas registrar esta cotización como aceptada?' : '¿Deseas registrar esta cotización como rechazada?'}</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
          <ProposalField label="Número de cotización" value={version.quotationNumber} />
          <ProposalField label="Destinatario" value={version.recipientFullName ?? '—'} />
          <ProposalField label="Precio" value={formatFinanceMoneyDisplay(version.finalSellingPrice, version.currency)} />
        </dl>
        {manualDecision === 'ACCEPT' ? <p className="text-sm text-muted-foreground">Esta acción registra formalmente la aceptación del cliente.</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setManualDecision(null)} disabled={manualTransitionPending}>Cancelar</Button>
          <Button type="button" variant={manualDecision === 'REJECT' ? 'destructive' : 'success'} onClick={() => void submitManualDecision()} disabled={manualTransitionPending}>{manualTransitionPending ? <><LoaderCircle aria-hidden="true" className="animate-spin" />Registrando…</> : manualDecision === 'ACCEPT' ? 'Aceptar cotización' : 'Rechazar cotización'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}

function ProposalField({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>; }
function ProposalError({ message }: { message: string }) { return <Alert variant="destructive"><AlertTitle>No se pudo procesar la cotización</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>; }
function pricingStatusLabel(status: string | null) { return status === 'DRAFT' ? 'Borrador' : status === 'APPROVED' ? 'Aprobado' : status ?? '—'; }
function formatDateOnly(value: string | null) { return value ? value.slice(0, 10).split('-').reverse().join('/') : '—'; }
function issueErrorMessage(error: unknown) { const code = error instanceof Error ? error.message : ''; if (code.includes('PRICING_CALCULATION_NOT_FOUND')) return 'Calcula el precio antes de emitir la cotización.'; if (code.includes('PRICING_CALCULATION_STALE')) return 'Los costos cambiaron. Recalcula el precio antes de emitir.'; if (code.includes('FISCAL_DEFAULT')) return 'No hay una configuración fiscal predeterminada para emitir la cotización.'; if (code.includes('STRUCTURED_COMPONENTS_REQUIRED') || code.includes('LINES_REQUIRED')) return 'Agrega al menos un servicio desde Costos antes de emitir la cotización.'; if (code.includes('CREDIT_TERM_UNIT')) return 'Para cotizaciones a crédito, el plazo debe definirse en días.'; if (code.includes('PAYMENT_TERMS') || code.includes('VALID_UNTIL')) return 'Revisa la vigencia y las condiciones de pago antes de emitir.'; if (code.includes('RECIPIENT_SNAPSHOT') || code.includes('TARGET_SNAPSHOT')) return 'No se pudo obtener el destinatario de la cotización.'; return 'No se pudo emitir la cotización. Intente nuevamente.'; }
function deliveryErrorMessage(error: unknown) { const code = error instanceof Error ? error.message : ''; if (code.includes('PROPOSAL_NOT_FOUND')) return 'Genera la propuesta antes de enviarla.'; if (code.includes('RECIPIENT_EMAIL') || code.includes('RECIPIENT_SNAPSHOT')) return 'La cotización no tiene un correo de destinatario válido.'; if (code.includes('VERSION_NOT_DELIVERABLE')) return 'La cotización ya no está disponible para envío.'; if (code.includes('EXPIRED')) return 'La cotización venció y no puede enviarse.'; if (code.includes('DELIVERY_FAILED')) return 'No se pudo enviar el correo. Intente nuevamente.'; return 'No se pudo enviar el correo. Intente nuevamente.'; }
function approvalStateChanged(error: unknown) { const code = error instanceof Error ? error.message : ''; return code.includes('INVALID_TRANSITION') || code.includes('TRANSITION_CONFLICT') || code.includes('VERSION_NOT_ISSUED') || code.includes('QUOTATION_NOT_ISSUED'); }
function manualApprovalErrorMessage(error: unknown, decision: 'ACCEPT' | 'REJECT') { const code = error instanceof Error ? error.message : ''; if (code.includes('FORBIDDEN') || code.includes('UNAUTHORIZED')) return 'No tienes permiso para registrar esta decisión.'; if (code.includes('EXPIRED')) return 'La cotización venció y ya no puede actualizarse.'; return decision === 'ACCEPT' ? 'No se pudo registrar la aceptación. Intente nuevamente.' : 'No se pudo registrar el rechazo. Intente nuevamente.'; }

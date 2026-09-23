'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/patterns/section-card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatFinanceMoneyDisplay } from '@/lib/finance-money-display';
import {
  generateCustomQuotationProposal,
  getCustomQuotationPricing,
  getCustomQuotationProposal,
  getLatestCustomQuotationVersion,
  issueCustomQuotation,
  sendCustomQuotationProposal,
  type CustomQuotationDetail,
  type CustomQuotationPricing,
  type CustomQuotationProposalDocument,
  type CustomQuotationVersion,
} from '@/lib/custom-quotations-api';
import { paymentConditionLabel, quotationStatusLabel } from '@/features/custom-quotations/custom-quotation-presentation';
import { useTenantDateTimeFormatter } from '@/shared/regional/tenant-regional-provider';

type CustomQuotationProposalTabProps = {
  quotation: CustomQuotationDetail;
  onIssued: () => Promise<void>;
};

export function CustomQuotationProposalTab({ quotation, onIssued }: CustomQuotationProposalTabProps) {
  const formatTenantDateTime = useTenantDateTimeFormatter();
  const draft = quotation.status === 'DRAFT';
  const [pricing, setPricing] = useState<CustomQuotationPricing | null>(null);
  const [pricingLoading, setPricingLoading] = useState(draft);
  const [version, setVersion] = useState<CustomQuotationVersion | null>(null);
  const [versionLoading, setVersionLoading] = useState(!draft);
  const [proposal, setProposal] = useState<CustomQuotationProposalDocument | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (draft) {
      setVersion(null);
      setProposal(null);
      setPricingLoading(true);
      void getCustomQuotationPricing(quotation.id)
        .then((value) => { if (!cancelled) setPricing(value); })
        .catch(() => { if (!cancelled) setError('No se pudo cargar el precio comercial.'); })
        .finally(() => { if (!cancelled) setPricingLoading(false); });
      return () => { cancelled = true; };
    }

    setPricing(null);
    setVersionLoading(true);
    void getLatestCustomQuotationVersion(quotation.id)
      .then(async (value) => {
        if (cancelled) return;
        setVersion(value);
        const document = await getCustomQuotationProposal(quotation.id, value.versionId);
        if (!cancelled) setProposal(document);
      })
      .catch(() => { if (!cancelled) setError('No se pudo cargar la versión emitida de la cotización.'); })
      .finally(() => { if (!cancelled) setVersionLoading(false); });
    return () => { cancelled = true; };
  }, [draft, quotation.id, quotation.status]);

  const missingPricing = !pricingLoading && (!pricing || !pricing.hasCalculation);
  const stalePricing = Boolean(pricing?.hasCalculation && pricing.stale);
  const noLines = quotation.lines.length === 0;
  const issueBlocked = missingPricing || stalePricing || noLines;

  async function issue() {
    if (issuing || issueBlocked) return;
    setIssuing(true);
    setError(null);
    try {
      await issueCustomQuotation(quotation.id);
      await onIssued();
      const issued = await getLatestCustomQuotationVersion(quotation.id);
      setVersion(issued);
      setProposal(await getCustomQuotationProposal(quotation.id, issued.versionId));
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
      setProposal(await getCustomQuotationProposal(quotation.id, version.versionId));
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
    try {
      await sendCustomQuotationProposal(quotation.id, version.versionId);
      setDeliveryMessage('Cotización enviada correctamente.');
    } catch (requestError) {
      setError(deliveryErrorMessage(requestError));
    } finally {
      setSending(false);
    }
  }

  if (draft) {
    return <section aria-label="Propuesta comercial" className="space-y-4">
      {error ? <ProposalError message={error} /> : null}
      <SectionCard title="Propuesta comercial" description="Revise la información comercial antes de emitir la cotización.">
        <dl className="grid gap-4 sm:grid-cols-2">
          <ProposalField label="Número de cotización" value={quotation.quotationNumber} />
          <ProposalField label="Destinatario" value={quotation.target?.displayName ?? '—'} />
          <ProposalField label="Correo" value={quotation.target?.email ?? '—'} />
          <ProposalField label="Moneda" value={quotation.currency} />
          <ProposalField label="Precio comercial" value={pricing?.hasCalculation && pricing.finalSellingPrice ? formatFinanceMoneyDisplay(pricing.finalSellingPrice, pricing.currency) : 'Pendiente de calcular'} />
          <ProposalField label="Vigencia" value={formatDateOnly(quotation.quotationValidUntil)} />
          <ProposalField label="Condición de pago" value={paymentConditionLabel(quotation.paymentConditionType, quotation.paymentTermValue, quotation.paymentTermUnit)} />
        </dl>
        <div className="mt-5 border-t border-border pt-4"><p className="text-sm font-medium">Líneas descriptivas</p>{quotation.lines.length ? <ol className="mt-2 space-y-2 text-sm">{quotation.lines.map((line) => <li key={line.id}><span className="font-medium">{line.description}</span> · {line.quantity}{line.commercialNote ? ` · ${line.commercialNote}` : ''}</li>)}</ol> : <p className="mt-2 text-sm text-muted-foreground">No hay líneas descriptivas.</p>}</div>
        {pricingLoading ? <Skeleton className="mt-5 h-10 w-48" /> : <div className="mt-5 space-y-3">{missingPricing ? <Alert variant="warning"><AlertDescription>Calcula el precio antes de emitir la cotización.</AlertDescription></Alert> : null}{stalePricing ? <Alert variant="warning"><AlertDescription>Los costos cambiaron. Recalcula el precio antes de emitir.</AlertDescription></Alert> : null}{noLines ? <Alert variant="warning"><AlertDescription>Agrega al menos una línea descriptiva antes de emitir la cotización.</AlertDescription></Alert> : null}<Button type="button" onClick={() => void issue()} disabled={issuing || issueBlocked}>{issuing ? 'Emitiendo…' : 'Emitir cotización'}</Button></div>}
      </SectionCard>
    </section>;
  }

  if (versionLoading) return <section aria-label="Propuesta comercial"><Skeleton className="h-96 w-full" /></section>;
  if (!version) return <section aria-label="Propuesta comercial">{error ? <ProposalError message={error} /> : null}</section>;

  return <section aria-label="Propuesta comercial" className="space-y-4">
    {error ? <ProposalError message={error} /> : null}
    <SectionCard title="Propuesta emitida" description="Esta versión es inmutable y refleja la propuesta comercial emitida.">
      <div className="mb-5 flex flex-wrap items-center gap-3"><span className="text-lg font-semibold">{version.quotationNumber}</span><Badge variant="secondary">Versión {version.versionNumber}</Badge><Badge variant="secondary">{quotationStatusLabel(version.status)}</Badge></div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <ProposalField label="Destinatario" value={version.recipientFullName ?? '—'} />
        <ProposalField label="Correo" value={version.recipientEmail ?? '—'} />
        {version.recipientPhone ? <ProposalField label="Teléfono" value={version.recipientPhone} /> : null}
        {version.recipientCompanyName ? <ProposalField label="Empresa" value={version.recipientCompanyName} /> : null}
        <ProposalField label="Precio comercial" value={formatFinanceMoneyDisplay(version.finalSellingPrice, version.currency)} />
        <ProposalField label="Moneda" value={version.currency} />
        <ProposalField label="Vigencia" value={formatDateOnly(version.quotationValidUntil)} />
        <ProposalField label="Condición de pago" value={paymentConditionLabel(version.paymentConditionType, version.paymentTermValue, version.paymentTermUnit)} />
        <ProposalField label="Emitida el" value={formatTenantDateTime(version.createdAt)} />
        <ProposalField label="Observaciones" value={version.commercialObservations || '—'} />
      </dl>
      <div className="mt-5 border-t border-border pt-4"><p className="text-sm font-medium">Líneas descriptivas</p><ol className="mt-2 space-y-2 text-sm">{version.lines.map((line) => <li key={line.id}><span className="font-medium">{line.description}</span> · {line.quantity}{line.commercialNote ? ` · ${line.commercialNote}` : ''}</li>)}</ol></div>
      <div className="mt-5 space-y-3">{proposal ? <div className="flex flex-wrap gap-2"><Button asChild type="button"><a href={proposal.url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Ver propuesta</a></Button>{version.status === 'ISSUED' ? <Button type="button" onClick={() => void sendProposal()} disabled={sending}>{sending ? 'Enviando…' : 'Enviar por correo'}</Button> : null}</div> : <><Alert variant="warning"><AlertDescription>Genera la propuesta antes de enviarla.</AlertDescription></Alert><Button type="button" onClick={() => void generateProposal()} disabled={generating}>{generating ? 'Generando…' : <><FileText aria-hidden="true" />Generar PDF</>}</Button></>}{deliveryMessage ? <Alert><AlertDescription>{deliveryMessage}</AlertDescription></Alert> : null}</div>
    </SectionCard>
  </section>;
}

function ProposalField({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>; }
function ProposalError({ message }: { message: string }) { return <Alert variant="destructive"><AlertTitle>No se pudo procesar la propuesta</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>; }
function formatDateOnly(value: string | null) { return value ? value.slice(0, 10).split('-').reverse().join('/') : '—'; }
function issueErrorMessage(error: unknown) { const code = error instanceof Error ? error.message : ''; if (code.includes('PRICING_CALCULATION_NOT_FOUND')) return 'Calcula el precio antes de emitir la cotización.'; if (code.includes('PRICING_CALCULATION_STALE')) return 'Los costos cambiaron. Recalcula el precio antes de emitir.'; if (code.includes('FISCAL_DEFAULT')) return 'No hay una configuración fiscal predeterminada para emitir la cotización.'; if (code.includes('LINES_REQUIRED')) return 'Agrega al menos una línea descriptiva antes de emitir la cotización.'; if (code.includes('PAYMENT_TERMS') || code.includes('VALID_UNTIL')) return 'Revisa la vigencia y las condiciones de pago antes de emitir.'; if (code.includes('RECIPIENT_SNAPSHOT') || code.includes('TARGET_SNAPSHOT')) return 'No se pudo obtener el destinatario de la cotización.'; return 'No se pudo emitir la cotización. Intente nuevamente.'; }
function deliveryErrorMessage(error: unknown) { const code = error instanceof Error ? error.message : ''; if (code.includes('PROPOSAL_NOT_FOUND')) return 'Genera la propuesta antes de enviarla.'; if (code.includes('RECIPIENT_EMAIL') || code.includes('RECIPIENT_SNAPSHOT')) return 'La cotización no tiene un correo de destinatario válido.'; if (code.includes('VERSION_NOT_DELIVERABLE')) return 'La cotización ya no está disponible para envío.'; if (code.includes('EXPIRED')) return 'La cotización venció y no puede enviarse.'; if (code.includes('DELIVERY_FAILED')) return 'No se pudo enviar el correo. Intente nuevamente.'; return 'No se pudo enviar el correo. Intente nuevamente.'; }

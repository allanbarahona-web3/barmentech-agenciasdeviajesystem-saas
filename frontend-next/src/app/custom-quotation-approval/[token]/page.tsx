'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FileText, LoaderCircle, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatFinanceMoneyDisplay } from '@/lib/finance-money-display';
import {
  acceptPublicCustomQuotation,
  getPublicCustomQuotationApproval,
  rejectPublicCustomQuotation,
  type PublicCustomQuotationApprovalProposal,
} from '@/lib/custom-quotation-public-approval-api';
import { paymentConditionLabel } from '@/features/custom-quotations/custom-quotation-presentation';

type Decision = 'ACCEPT' | 'REJECT';

export default function CustomQuotationApprovalPage() {
  const { token: rawToken } = useParams<{ token: string }>();
  const token = String(rawToken || '');
  const [proposal, setProposal] = useState<PublicCustomQuotationApprovalProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUnavailable(false);
    void getPublicCustomQuotationApproval(token)
      .then((value) => { if (!cancelled) setProposal(value); })
      .catch(() => { if (!cancelled) setUnavailable(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  async function confirmDecision() {
    if (!proposal || !decision || acting) return;
    setActing(true);
    setMessage(null);
    try {
      const result = decision === 'ACCEPT'
        ? await acceptPublicCustomQuotation(token)
        : await rejectPublicCustomQuotation(token);
      setProposal((current) => current ? { ...current, status: result.status } : current);
      setMessage(result.status === 'ACCEPTED'
        ? 'Tu cotización fue aceptada correctamente.'
        : 'Tu cotización fue rechazada correctamente.');
      setDecision(null);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code.includes('EXPIRED')) {
        setProposal((current) => current ? { ...current, status: 'EXPIRED' } : current);
        setMessage('Esta cotización ha vencido.');
      } else {
        setMessage('Este enlace ha vencido o ya no está disponible.');
      }
      setDecision(null);
    } finally {
      setActing(false);
    }
  }

  if (loading) return <PublicCenterState label="Cargando cotización..." />;
  if (unavailable || !proposal) return <PublicCenterState label="Este enlace ha vencido o ya no está disponible." unavailable />;

  const canRespond = proposal.status === 'ISSUED';
  const terminalMessage = terminalStatusMessage(proposal.status);
  const price = formatFinanceMoneyDisplay(proposal.finalSellingPrice, proposal.currency);

  return <main className="min-h-screen bg-muted/30 px-4 py-6 sm:px-6 sm:py-10">
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-ui-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {proposal.tenant.logoUrl ? <img src={proposal.tenant.logoUrl} alt={proposal.tenant.name} className="size-12 shrink-0 object-contain" /> : <FileText aria-hidden="true" className="size-10 text-primary" />}
          <div className="min-w-0"><p className="truncate text-sm text-muted-foreground">{proposal.tenant.name}</p><h1 className="text-xl font-semibold tracking-tight">Cotización {proposal.quotationNumber}</h1></div>
        </div>
        <Badge variant={statusVariant(proposal.status)}>{statusLabel(proposal.status)}</Badge>
      </header>

      {message ? <Alert variant={proposal.status === 'ACCEPTED' ? 'success' : proposal.status === 'REJECTED' ? 'destructive' : 'warning'} role="status"><AlertTitle>{statusLabel(proposal.status)}</AlertTitle><AlertDescription>{message}</AlertDescription></Alert> : null}
      {terminalMessage && !message ? <Alert variant={proposal.status === 'REJECTED' ? 'destructive' : proposal.status === 'CANCELLED' || proposal.status === 'EXPIRED' ? 'warning' : 'success'} role="status"><AlertDescription>{terminalMessage}</AlertDescription></Alert> : null}

      <Card>
        <CardHeader><CardTitle>{proposal.title || '—'}</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Detail label="Destinatario" value={proposal.recipientFullName} />
            <Detail label="Versión" value={`Versión ${proposal.versionNumber}`} />
            <Detail label="Precio final" value={price} exactValue={proposal.finalSellingPrice} />
            <Detail label="Moneda" value={proposal.currency} />
            <Detail label="Vigencia" value={formatDateOnly(proposal.quotationValidUntil)} />
            <Detail label="Condición de pago" value={paymentConditionLabel(proposal.paymentConditionType, proposal.paymentTermValue, proposal.paymentTermUnit)} />
          </dl>
          <section aria-labelledby="quotation-lines-title"><h2 id="quotation-lines-title" className="text-sm font-medium">Servicios incluidos</h2><ol className="mt-3 space-y-3">{proposal.lines.map((line) => <li key={`${line.displayOrder}-${line.description}`} className="rounded-lg border border-border bg-muted/20 p-3 text-sm"><p className="font-medium">{line.description}</p><p className="mt-1 text-muted-foreground">Cantidad: {line.quantity}{line.commercialNote ? ` · ${line.commercialNote}` : ''}</p></li>)}</ol></section>
          {proposal.commercialObservations ? <section aria-labelledby="quotation-observations-title"><h2 id="quotation-observations-title" className="text-sm font-medium">Observaciones</h2><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{proposal.commercialObservations}</p></section> : null}
        </CardContent>
        <CardFooter className="flex-col items-stretch sm:flex-row sm:justify-between"><Button asChild variant="outline"><a href={proposal.document.url} target="_blank" rel="noreferrer"><FileText aria-hidden="true" />Ver propuesta</a></Button>{canRespond ? <div className="flex flex-col gap-2 sm:flex-row"><Button type="button" onClick={() => setDecision('REJECT')} disabled={acting} variant="destructive">Rechazar cotización</Button><Button type="button" onClick={() => setDecision('ACCEPT')} disabled={acting} variant="success">{acting ? <><LoaderCircle aria-hidden="true" className="animate-spin" />Procesando…</> : 'Aceptar cotización'}</Button></div> : null}</CardFooter>
      </Card>
    </div>

    <Dialog open={Boolean(decision)} onOpenChange={(open) => { if (!open && !acting) setDecision(null); }}>
      <DialogContent showCloseButton={!acting}>
        <DialogHeader><DialogTitle>{decision === 'ACCEPT' ? '¿Deseas aceptar esta cotización?' : '¿Deseas rechazar esta cotización?'}</DialogTitle><DialogDescription>{decision === 'ACCEPT' ? 'Esta decisión confirmará tu aceptación de la propuesta comercial.' : 'Esta decisión marcará la cotización como rechazada.'}</DialogDescription></DialogHeader>
        <dl className="mt-4 grid gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm"><Detail label="Cotización" value={proposal.quotationNumber} /><Detail label="Precio final" value={price} exactValue={proposal.finalSellingPrice} /><Detail label="Moneda" value={proposal.currency} /></dl>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setDecision(null)} disabled={acting}>Cancelar</Button><Button type="button" variant={decision === 'REJECT' ? 'destructive' : 'success'} onClick={() => void confirmDecision()} disabled={acting}>{acting ? <><LoaderCircle aria-hidden="true" className="animate-spin" />Procesando…</> : decision === 'ACCEPT' ? 'Aceptar cotización' : 'Rechazar cotización'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </main>;
}

function Detail({ label, value, exactValue }: { label: string; value: string; exactValue?: string }) {
  return <div><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 font-medium" data-exact-money={exactValue}>{value}</dd></div>;
}

function PublicCenterState({ label, unavailable = false }: { label: string; unavailable?: boolean }) {
  return <main className="grid min-h-screen place-content-center justify-items-center gap-3 bg-muted/30 p-6 text-center"><>{unavailable ? <XCircle aria-hidden="true" className="size-10 text-muted-foreground" /> : <LoaderCircle aria-hidden="true" className="size-10 animate-spin text-primary" />}</><h1 className="text-xl font-semibold">{unavailable ? 'Cotización no disponible' : label}</h1>{unavailable ? <p className="max-w-sm text-sm text-muted-foreground">{label}</p> : null}</main>;
}

function formatDateOnly(value: string | null) { return value ? value.slice(0, 10).split('-').reverse().join('/') : 'No indicada'; }
function statusLabel(status: PublicCustomQuotationApprovalProposal['status']) { return ({ ISSUED: 'Emitida', ACCEPTED: 'Aceptada', REJECTED: 'Rechazada', EXPIRED: 'Vencida', CANCELLED: 'Cancelada' })[status]; }
function statusVariant(status: PublicCustomQuotationApprovalProposal['status']) { return status === 'ACCEPTED' ? 'success' : status === 'REJECTED' || status === 'CANCELLED' ? 'destructive' : status === 'EXPIRED' ? 'warning' : 'info'; }
function terminalStatusMessage(status: PublicCustomQuotationApprovalProposal['status']) { return ({ ISSUED: null, ACCEPTED: 'Tu cotización fue aceptada correctamente.', REJECTED: 'Tu cotización fue rechazada correctamente.', EXPIRED: 'Esta cotización ha vencido.', CANCELLED: 'Esta cotización ya no está disponible.' })[status]; }

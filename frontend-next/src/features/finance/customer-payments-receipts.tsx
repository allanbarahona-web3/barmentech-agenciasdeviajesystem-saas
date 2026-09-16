'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, Paperclip, ReceiptText } from 'lucide-react';
import AttachmentViewer, { type Attachment } from '@/components/attachment-viewer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconBadge } from '@/components/ui/icon-badge';
import { SectionCard } from '@/components/patterns/section-card';
import { formatCustomerPaymentStatus, customerPaymentStatusVariant } from '@/features/finance/customer-payment-status-labels';
import { downloadCustomerPaymentReceipt, FinanceApiError, formatFinanceMoney, getReportedInvoicePaymentEvidence, listCustomerPayments, type CustomerPaymentApplication, type CustomerPaymentListItem, type CustomerPaymentsPage } from '@/lib/finance-api';
import { formatFinancePaymentMethod } from '@/lib/finance-payment-methods';
import { formatBusinessDate } from '@/shared/regional';
import { useTenantDateTimeFormatter } from '@/shared/regional/tenant-regional-provider';

const PAGE_SIZE = 25;

function applicationLabel(application: CustomerPaymentApplication): string {
  return application.type === 'ACCOUNT_RECEIVABLE' ? `Factura ${application.reference}` : `Contrato ${application.reference}`;
}

function applicationSummary(payment: CustomerPaymentListItem): ReactNode {
  if (!payment.applications.length) return <span className="text-sm text-muted-foreground">Sin aplicaciones</span>;
  const preview = payment.applications.slice(0, 2);
  return <div className="space-y-1">
    {preview.map((application) => <p className="text-sm text-foreground" key={`${application.type}-${application.reference}-${application.applicationDate}`}>
      {applicationLabel(application)} <span className="text-muted-foreground">· {formatFinanceMoney(application.amount, application.currencyCode)}</span>
    </p>)}
    {payment.applications.length > preview.length ? <p className="text-xs text-muted-foreground">{payment.applications.length - preview.length} aplicación(es) adicional(es) en el detalle.</p> : null}
  </div>;
}

function paymentAmountSummary(payment: CustomerPaymentListItem): ReactNode {
  const application = payment.applications.length === 1 ? payment.applications[0] : null;
  return <div className="space-y-0.5 whitespace-nowrap text-sm">
    <p className="font-medium text-foreground">Recibido: {formatFinanceMoney(payment.receivedAmount, payment.currencyCode)}</p>
    {payment.settlementCurrencyCode && payment.settlementAmount ? <p className="text-muted-foreground">Equivalente: {formatFinanceMoney(payment.settlementAmount, payment.settlementCurrencyCode)}</p> : null}
    {application ? <p className="text-muted-foreground">Aplicado: {formatFinanceMoney(application.amount, application.currencyCode)}</p> : null}
  </div>;
}

function PaymentDetail({ payment, customerId, onClose, onViewEvidence, evidenceBusy, evidenceError }: { payment: CustomerPaymentListItem; customerId: string; onClose: () => void; onViewEvidence: (payment: CustomerPaymentListItem) => Promise<void>; evidenceBusy: boolean; evidenceError: string | null }) {
  const formatTenantDateTime = useTenantDateTimeFormatter();
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  async function downloadReceipt() {
    setReceiptBusy(true);
    setReceiptError(null);
    try {
      const file = await downloadCustomerPaymentReceipt(customerId, payment.id);
      const url = URL.createObjectURL(file.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : 'No se pudo descargar el recibo.');
    } finally {
      setReceiptBusy(false);
    }
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Detalle del pago</DialogTitle>
        <DialogDescription>Información financiera registrada para este pago.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 pt-2 sm:grid-cols-2">
        <DetailFact label="Estado"><Badge variant={customerPaymentStatusVariant(payment.status)}>{formatCustomerPaymentStatus(payment.status)}</Badge></DetailFact>
        <DetailFact label="Fecha de pago">{formatTenantDateTime(payment.paymentDate)}</DetailFact>
        <DetailFact label="Registrado">{formatTenantDateTime(payment.createdAt)}</DetailFact>
        <DetailFact label="Método">{formatFinancePaymentMethod(payment.paymentMethod)}</DetailFact>
        <DetailFact label="Monto recibido">{formatFinanceMoney(payment.receivedAmount, payment.currencyCode)}</DetailFact>
        <DetailFact label="Referencia">{payment.reference ?? '—'}</DetailFact>
        {payment.settlementCurrencyCode && payment.settlementAmount ? <>
          <DetailFact label="Equivalente de liquidación">{formatFinanceMoney(payment.settlementAmount, payment.settlementCurrencyCode)}</DetailFact>
          <DetailFact label="Saldo disponible de liquidación">{payment.settlementAvailableAmount ? formatFinanceMoney(payment.settlementAvailableAmount, payment.settlementCurrencyCode) : '—'}</DetailFact>
          <DetailFact label="Tipo de cambio">{payment.settlementExchangeRate ?? 'No registrado'}</DetailFact>
          <DetailFact label="Fuente del tipo de cambio">{payment.settlementExchangeRateSource ?? 'No registrada'}</DetailFact>
          <DetailFact label="Fecha efectiva">{payment.settlementExchangeRateEffectiveDate ? formatBusinessDate(payment.settlementExchangeRateEffectiveDate) : 'No registrada'}</DetailFact>
        </> : null}
        {payment.rejectionReason ? <DetailFact label="Razón de rechazo" className="sm:col-span-2">{payment.rejectionReason}</DetailFact> : null}
      </div>
      <section className="mt-2 rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">Aplicado a</h3>
        {payment.applications.length ? <div className="mt-3 space-y-3">{payment.applications.map((application) => <div className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between" key={`${application.type}-${application.reference}-${application.applicationDate}`}>
          <div><p className="text-sm font-medium text-foreground">{applicationLabel(application)}</p>{application.description ? <p className="mt-1 text-sm text-muted-foreground">{application.description}</p> : null}<p className="mt-1 text-xs text-muted-foreground">{formatTenantDateTime(application.applicationDate)} · {application.status === 'ACTIVE' ? 'Aplicado' : 'Revertido'}</p></div>
          <p className="whitespace-nowrap text-sm font-semibold text-foreground">{formatFinanceMoney(application.amount, application.currencyCode)}</p>
        </div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">Este pago aún no tiene aplicaciones registradas.</p>}
      </section>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {payment.evidence.length ? <Button type="button" variant="outline" size="sm" disabled={evidenceBusy} onClick={() => void onViewEvidence(payment)}><Paperclip aria-hidden="true" />{evidenceBusy ? 'Abriendo…' : 'Comprobante'}</Button> : null}
        {payment.receiptAvailable ? <Button type="button" variant="outline" size="sm" disabled={receiptBusy} onClick={() => void downloadReceipt()}><Download aria-hidden="true" />{receiptBusy ? 'Descargando…' : 'Descargar'}</Button> : null}
      </div>
      {evidenceError ? <Alert variant="destructive"><AlertTitle>No se pudo abrir el comprobante</AlertTitle><AlertDescription>{evidenceError}</AlertDescription></Alert> : null}
      {receiptError ? <Alert variant="destructive"><AlertTitle>No se pudo descargar el recibo</AlertTitle><AlertDescription>{receiptError}</AlertDescription></Alert> : null}
    </DialogContent>
  </Dialog>;
}

function DetailFact({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <div className={`min-w-0 ${className}`}><p className="text-xs font-medium text-muted-foreground">{label}</p><div className="mt-1 text-sm text-foreground">{children}</div></div>;
}

export function CustomerPaymentsReceipts({ customerId }: { customerId: string }) {
  const formatTenantDateTime = useTenantDateTimeFormatter();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<CustomerPaymentsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<CustomerPaymentListItem | null>(null);
  const [receiptBusyId, setReceiptBusyId] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [evidenceBusyId, setEvidenceBusyId] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [evidenceViewer, setEvidenceViewer] = useState<{ paymentId: string; attachments: Attachment[] } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void listCustomerPayments(customerId, { page, pageSize: PAGE_SIZE }, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setResult(response);
        if (response.totalPages > 0 && page > response.totalPages) setPage(response.totalPages);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError instanceof FinanceApiError ? requestError.message : requestError instanceof Error ? requestError.message : 'No se pudieron cargar los pagos.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [customerId, page]);

  const summary = useMemo(() => {
    if (!result || result.total === 0) return null;
    const first = (result.page - 1) * result.pageSize + 1;
    const last = Math.min(result.page * result.pageSize, result.total);
    return `${first}–${last} de ${result.total} pagos`;
  }, [result]);

  async function downloadReceipt(payment: CustomerPaymentListItem) {
    setReceiptBusyId(payment.id);
    setReceiptError(null);
    try {
      const file = await downloadCustomerPaymentReceipt(customerId, payment.id);
      const url = URL.createObjectURL(file.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setReceiptError(requestError instanceof Error ? requestError.message : 'No se pudo descargar el recibo.');
    } finally {
      setReceiptBusyId(null);
    }
  }

  async function openEvidence(payment: CustomerPaymentListItem): Promise<void> {
    const selectedEvidence = payment.evidence[0];
    if (!selectedEvidence) return;
    setEvidenceBusyId(payment.id);
    setEvidenceError(null);
    try {
      const access = await getReportedInvoicePaymentEvidence(customerId, payment.id, selectedEvidence.id);
      setEvidenceViewer({
        paymentId: payment.id,
        attachments: payment.evidence.map((evidence) => ({
          id: evidence.id,
          originalFileName: evidence.originalFileName,
          mimeType: evidence.mimeType,
          ...(evidence.id === selectedEvidence.id ? { url: access.url } : {}),
        })),
      });
    } catch (requestError) {
      setEvidenceError(requestError instanceof Error ? requestError.message : 'No se pudo abrir el comprobante.');
    } finally {
      setEvidenceBusyId(null);
    }
  }

  async function resolveEvidenceUrl(attachment: Attachment, signal: AbortSignal): Promise<string> {
    if (!evidenceViewer) throw new Error('No se pudo cargar el comprobante.');
    const evidence = await getReportedInvoicePaymentEvidence(customerId, evidenceViewer.paymentId, attachment.id, signal);
    return evidence.url;
  }

  return <div className="mb-6">
    <SectionCard title={<span className="flex items-center gap-2"><IconBadge tone="success" size="sm"><ReceiptText aria-hidden="true" /></IconBadge>Pagos y recibos{result ? ` (${result.total})` : ''}</span>}>
      {loading ? <p className="py-6 text-center text-sm text-muted-foreground">Cargando pagos…</p> : null}
      {error ? <Alert variant="destructive"><AlertTitle>No se pudieron cargar los pagos</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {!loading && !error && result?.items.length === 0 ? <div className="rounded-lg border border-dashed border-border bg-muted/40 px-5 py-10 text-center"><IconBadge tone="success" className="mx-auto"><ReceiptText aria-hidden="true" /></IconBadge><p className="mt-3 text-sm font-semibold text-foreground">No hay pagos registrados para este cliente.</p></div> : null}
      {!loading && !error && result && result.items.length > 0 ? <div className="space-y-4">
        <div className="overflow-x-auto rounded-lg border border-border"><Table>
          <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Método de pago</TableHead><TableHead>Nº recibo</TableHead><TableHead>Monto</TableHead><TableHead>Aplicado a</TableHead><TableHead>Estado</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader>
          <TableBody>{result.items.map((payment) => <TableRow key={payment.id}>
            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatTenantDateTime(payment.paymentDate)}</TableCell>
            <TableCell className="text-sm text-foreground">{formatFinancePaymentMethod(payment.paymentMethod)}</TableCell>
            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{payment.receiptNumber ?? '—'}</TableCell>
            <TableCell>{paymentAmountSummary(payment)}</TableCell>
            <TableCell>{applicationSummary(payment)}</TableCell>
            <TableCell><div className="space-y-1"><Badge variant={customerPaymentStatusVariant(payment.status)}>{formatCustomerPaymentStatus(payment.status)}</Badge>{payment.rejectionReason ? <p className="max-w-52 text-xs text-destructive">Razón: {payment.rejectionReason}</p> : null}</div></TableCell>
            <TableCell className="whitespace-nowrap"><div className="flex items-center gap-1.5"><Button type="button" variant="outline" size="sm" onClick={() => setSelectedPayment(payment)}><Eye aria-hidden="true" />Detalle</Button>{payment.evidence.length ? <Button type="button" variant="outline" size="sm" disabled={evidenceBusyId === payment.id} onClick={() => void openEvidence(payment)}><Paperclip aria-hidden="true" />{evidenceBusyId === payment.id ? 'Abriendo…' : 'Comprobante'}</Button> : null}{payment.receiptAvailable ? <Button type="button" variant="outline" size="sm" disabled={receiptBusyId === payment.id} onClick={() => void downloadReceipt(payment)}><Download aria-hidden="true" />{receiptBusyId === payment.id ? 'Descargando…' : 'Descargar'}</Button> : null}</div></TableCell>
          </TableRow>)}</TableBody>
        </Table></div>
        {evidenceError ? <Alert variant="destructive"><AlertTitle>No se pudo abrir el comprobante</AlertTitle><AlertDescription>{evidenceError}</AlertDescription></Alert> : null}
        {receiptError ? <Alert variant="destructive"><AlertTitle>No se pudo descargar el recibo</AlertTitle><AlertDescription>{receiptError}</AlertDescription></Alert> : null}
        {result.totalPages > 1 ? <nav className="flex items-center justify-end gap-3" aria-label="Paginación de pagos"><span className="text-xs text-muted-foreground">{summary} · Página {result.page} de {result.totalPages}</span><Button type="button" variant="outline" size="sm" disabled={result.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft aria-hidden="true" />Anterior</Button><Button type="button" variant="outline" size="sm" disabled={result.page >= result.totalPages} onClick={() => setPage((current) => Math.min(result.totalPages, current + 1))}>Siguiente<ChevronRight aria-hidden="true" /></Button></nav> : null}
      </div> : null}
    </SectionCard>
    {selectedPayment ? <PaymentDetail payment={selectedPayment} customerId={customerId} onClose={() => setSelectedPayment(null)} onViewEvidence={openEvidence} evidenceBusy={evidenceBusyId === selectedPayment.id} evidenceError={evidenceError} /> : null}
    {evidenceViewer ? <AttachmentViewer attachments={evidenceViewer.attachments} resolveAttachmentUrl={resolveEvidenceUrl} onClose={() => setEvidenceViewer(null)} /> : null}
  </div>;
}

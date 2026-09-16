'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, Eye, Paperclip, Search, X } from 'lucide-react';
import AttachmentViewer, { type Attachment } from '@/components/attachment-viewer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  downloadPaymentReceipt,
  FinanceApiError,
  formatFinanceMoney,
  getPayment,
  getReportedInvoicePaymentEvidence,
  listPayments,
  type CustomerPaymentApplication,
  type FinanceCurrency,
  type PaymentDetail,
  type PaymentListItem,
  type PaymentsPage,
  type PaymentStatus,
} from '@/lib/finance-api';
import { FINANCE_PAYMENT_METHOD_OPTIONS, formatFinancePaymentMethod, type FinancePaymentMethod } from '@/lib/finance-payment-methods';
import { customerPaymentStatusVariant, formatCustomerPaymentStatus } from '@/features/finance/customer-payment-status-labels';
import { formatBusinessDate } from '@/shared/regional';
import { useTenantDateTimeFormatter, useTenantRegional } from '@/shared/regional/tenant-regional-provider';
import styles from './accounts-receivable.module.css';
import { financeQuickDateRanges, type FinanceDatePreset } from './finance-date-ranges';

const PAGE_SIZE = 25;
const PAYMENT_STATUS_OPTIONS: PaymentStatus[] = ['PENDING_VERIFICATION', 'REJECTED', 'RECEIVED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED', 'CANCELLED'];

export type PaymentCustomerFilter = { id: string; name: string; currency?: FinanceCurrency };

type EvidenceViewerSession = { paymentId: string; customerId: string; attachments: Attachment[] };

function applicationLabel(application: CustomerPaymentApplication): string {
  return application.type === 'ACCOUNT_RECEIVABLE' ? `Factura ${application.reference}` : `Contrato ${application.reference}`;
}

function applicationSummary(payment: Pick<PaymentListItem, 'applications'>) {
  if (!payment.applications.length) return <span className={styles.secondary}>Sin aplicaciones</span>;
  const application = payment.applications.find((item) => item.status === 'ACTIVE') ?? payment.applications[0];
  return <div className={styles.stack}>
    <span className={styles.reference}>{applicationLabel(application)}</span>
    <small className={styles.tableSubtext}>{formatFinanceMoney(application.amount, application.currencyCode)}</small>
    {payment.applications.length > 1 ? <small className={styles.tableSubtext}>+{payment.applications.length - 1} aplicación(es)</small> : null}
  </div>;
}

function amountSummary(payment: PaymentListItem) {
  const application = payment.applications.find((item) => item.status === 'ACTIVE') ?? payment.applications[0];
  const crossCurrency = Boolean(payment.settlementCurrencyCode && payment.settlementCurrencyCode !== payment.currencyCode);
  return <div className={styles.stack}>
    {crossCurrency && payment.settlementAmount ? <span className={styles.secondary}>Equivalente: {formatFinanceMoney(payment.settlementAmount, payment.settlementCurrencyCode!)}</span> : null}
    {application ? <strong className={styles.reference}>{crossCurrency ? 'Aplicado: ' : ''}{formatFinanceMoney(application.amount, application.currencyCode)}</strong> : <span className={styles.secondary}>Sin aplicar</span>}
  </div>;
}

function GlobalPaymentDetail({ payment, onClose, onViewEvidence, onDownloadReceipt, evidenceBusy, receiptBusy, actionError }: {
  payment: PaymentDetail;
  onClose: () => void;
  onViewEvidence: (payment: PaymentDetail) => Promise<void>;
  onDownloadReceipt: (paymentId: string) => Promise<void>;
  evidenceBusy: boolean;
  receiptBusy: boolean;
  actionError: string | null;
}) {
  const formatTenantDateTime = useTenantDateTimeFormatter();
  const applications = payment.applications ?? [];
  const evidence = payment.evidence ?? [];
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Detalle del pago</DialogTitle>
        <DialogDescription>Consulta financiera de solo lectura.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-5">
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">Recibo</p><p className="mt-1 font-semibold text-foreground">{payment.receiptNumber ?? 'Sin recibo asignado'}</p></div><Badge variant={customerPaymentStatusVariant(payment.status)}>{formatCustomerPaymentStatus(payment.status)}</Badge></div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <DetailFact label="Fecha">{formatTenantDateTime(payment.paymentDate ?? payment.receivedAt)}</DetailFact>
            <DetailFact label="Método">{formatFinancePaymentMethod(payment.paymentMethod)}</DetailFact>
            <DetailFact label="Monto recibido">{formatFinanceMoney(payment.receivedAmount, payment.currencyCode)}</DetailFact>
            <DetailFact label="Monto aplicado">{formatFinanceMoney(payment.settlement?.appliedAmount ?? payment.appliedAmount, payment.settlement?.currencyCode ?? payment.currencyCode)}</DetailFact>
            {!payment.settlement ? <DetailFact label="Saldo disponible">{formatFinanceMoney(payment.availableAmount, payment.currencyCode)}</DetailFact> : null}
            <DetailFact label="Referencia">{payment.externalReference ?? '—'}</DetailFact>
            <DetailFact label="Cliente">{payment.payerDisplayName}</DetailFact>
            <DetailFact label="Identificación">{payment.payerIdentificationNumber ?? '—'}</DetailFact>
          </dl>
        </section>
        {payment.settlement ? <section className="rounded-lg border border-border bg-card p-4"><h3 className="text-sm font-semibold text-foreground">Liquidación</h3><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <DetailFact label="Equivalente">{formatFinanceMoney(payment.settlement.amount, payment.settlement.currencyCode)}</DetailFact>
          <DetailFact label="Saldo disponible">{formatFinanceMoney(payment.settlement.availableAmount, payment.settlement.currencyCode)}</DetailFact>
          <DetailFact label="Tipo de cambio">{payment.settlement.exchangeRate ?? 'No registrado'}</DetailFact>
          <DetailFact label="Fuente">{payment.settlement.exchangeRateSource ?? 'No registrada'}</DetailFact>
          <DetailFact label="Fecha efectiva">{payment.settlement.exchangeRateEffectiveDate ? formatBusinessDate(payment.settlement.exchangeRateEffectiveDate) : 'No registrada'}</DetailFact>
        </dl></section> : null}
        {payment.rejectionReason ? <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"><h3 className="text-sm font-semibold text-foreground">Razón de rechazo</h3><p className="mt-1 text-sm text-foreground">{payment.rejectionReason}</p></section> : null}
        <section className="rounded-lg border border-border bg-card p-4"><h3 className="text-sm font-semibold text-foreground">Aplicado a</h3>{applications.length ? <div className="mt-3 space-y-3">{applications.map((application) => <div key={`${application.type}-${application.reference}-${application.applicationDate}`} className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-medium text-foreground">{applicationLabel(application)}</p>{application.description ? <p className="text-xs text-muted-foreground">{application.description}</p> : null}<p className="mt-1 text-xs text-muted-foreground">{formatTenantDateTime(application.applicationDate)}</p></div><div className="text-right"><p className="font-medium text-foreground">{formatFinanceMoney(application.amount, application.currencyCode)}</p><p className="text-xs text-muted-foreground">{application.status === 'ACTIVE' ? 'Aplicada' : 'Revertida'}</p></div></div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">Sin aplicaciones registradas.</p>}</section>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>{evidence.length ? <Button type="button" variant="outline" disabled={evidenceBusy} onClick={() => void onViewEvidence(payment)}><Paperclip aria-hidden="true" />{evidenceBusy ? 'Abriendo…' : 'Comprobante'}</Button> : null}{payment.receiptAvailable ? <Button type="button" variant="outline" disabled={receiptBusy} onClick={() => void onDownloadReceipt(payment.id)}><Download aria-hidden="true" />{receiptBusy ? 'Descargando…' : 'Descargar'}</Button> : null}</div>
        {actionError ? <Alert variant="destructive"><AlertTitle>No se pudo completar la acción</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert> : null}
      </div>
    </DialogContent>
  </Dialog>;
}

function DetailFact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 text-sm text-foreground">{children}</dd></div>;
}

export function PaymentsView({ reloadToken, customerFilter, onClearCustomer }: {
  reloadToken: number;
  customerFilter: PaymentCustomerFilter | null;
  onClearCustomer: () => void;
}) {
  const formatTenantDateTime = useTenantDateTimeFormatter();
  const { timeZone } = useTenantRegional();
  const [page, setPage] = useState(1);
  const [currency, setCurrency] = useState<FinanceCurrency | ''>('');
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [datePreset, setDatePreset] = useState<FinanceDatePreset>('');
  const [result, setResult] = useState<PaymentsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FinanceApiError | null>(null);
  const [retry, setRetry] = useState(0);
  const [openedPayment, setOpenedPayment] = useState<PaymentDetail | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [receiptBusyId, setReceiptBusyId] = useState<string | null>(null);
  const [evidenceBusyId, setEvidenceBusyId] = useState<string | null>(null);
  const [evidenceViewer, setEvidenceViewer] = useState<EvidenceViewerSession | null>(null);

  const quickRanges = useMemo(() => financeQuickDateRanges(timeZone), [timeZone]);

  const load = useCallback(async (signal: AbortSignal) => {
    void reloadToken; void retry;
    setLoading(true); setError(null);
    try {
      const response = await listPayments({
        page, pageSize: PAGE_SIZE, customerId: customerFilter?.id,
        currency: customerFilter?.currency ?? (currency || undefined), status: status || undefined,
        dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, customerSearch: customerSearch.trim() || undefined,
        paymentMethod: paymentMethod.trim() || undefined,
      }, signal);
      setResult(response);
      if (response.totalPages > 0 && page > response.totalPages) setPage(response.totalPages);
    } catch (requestError) {
      if (!signal.aborted) setError(requestError instanceof FinanceApiError ? requestError : new FinanceApiError('FINANCE_REQUEST_FAILED', 'No se pudieron cargar los pagos.'));
    } finally { if (!signal.aborted) setLoading(false); }
  }, [currency, customerFilter?.currency, customerFilter?.id, customerSearch, dateFrom, dateTo, page, paymentMethod, reloadToken, retry, status]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => { setPage(1); }, [customerFilter?.id]);

  const summary = useMemo(() => {
    if (!result || result.total === 0) return '0 pagos';
    const first = (result.page - 1) * result.pageSize + 1;
    const last = Math.min(result.page * result.pageSize, result.total);
    return `${first}–${last} de ${result.total} pagos`;
  }, [result]);

  const hasFilters = Boolean(currency || status || customerSearch || paymentMethod || dateFrom || dateTo);

  function updatePageOne(action: () => void) { action(); setPage(1); }
  function applyDatePreset(value: FinanceDatePreset) {
    setDatePreset(value);
    if (value === '' || value === 'CUSTOM') { if (value === '') { setDateFrom(''); setDateTo(''); } setPage(1); return; }
    const range = quickRanges[value]; setDateFrom(range.dateFrom); setDateTo(range.dateTo); setPage(1);
  }
  function clearFilters() {
    setCurrency(''); setStatus(''); setCustomerSearch(''); setPaymentMethod(''); setDateFrom(''); setDateTo(''); setDatePreset(''); setPage(1);
  }

  async function openPayment(paymentId: string) {
    setOpeningId(paymentId); setActionError(null);
    try { setOpenedPayment(await getPayment(paymentId)); }
    catch (requestError) { setActionError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el detalle del pago.'); }
    finally { setOpeningId(null); }
  }

  async function downloadReceipt(paymentId: string) {
    setReceiptBusyId(paymentId); setActionError(null);
    try {
      const file = await downloadPaymentReceipt(paymentId);
      const url = URL.createObjectURL(file.blob); const link = document.createElement('a');
      link.href = url; link.download = file.fileName; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (requestError) { setActionError(requestError instanceof Error ? requestError.message : 'No se pudo descargar el recibo.'); }
    finally { setReceiptBusyId(null); }
  }

  async function openEvidence(detail: PaymentDetail) {
    const selectedEvidence = detail.evidence?.[0];
    if (!selectedEvidence || !detail.customerId) { setActionError('No se encontró un comprobante disponible para este pago.'); return; }
    setEvidenceBusyId(detail.id); setActionError(null);
    try {
      const access = await getReportedInvoicePaymentEvidence(detail.customerId, detail.id, selectedEvidence.id);
      setEvidenceViewer({
        paymentId: detail.id, customerId: detail.customerId,
        attachments: (detail.evidence ?? []).map((evidence) => ({ id: evidence.id, originalFileName: evidence.originalFileName, mimeType: evidence.mimeType, ...(evidence.id === selectedEvidence.id ? { url: access.url } : {}) })),
      });
    } catch (requestError) { setActionError(requestError instanceof Error ? requestError.message : 'No se pudo abrir el comprobante.'); }
    finally { setEvidenceBusyId(null); }
  }

  const resolveEvidenceUrl = useCallback(async (attachment: Attachment, signal: AbortSignal) => {
    if (!evidenceViewer) throw new Error('No hay comprobante seleccionado.');
    const evidence = await getReportedInvoicePaymentEvidence(evidenceViewer.customerId, evidenceViewer.paymentId, attachment.id, signal);
    return evidence.url;
  }, [evidenceViewer]);

  return <>
    <section className={styles.paymentFilters} aria-label="Filtros de pagos">
      <div className={styles.field}><label htmlFor="payment-date-preset">Fecha</label><select id="payment-date-preset" className={styles.select} value={datePreset} onChange={(event) => applyDatePreset(event.target.value as FinanceDatePreset)}><option value="">Todas</option><option value="TODAY">Hoy</option><option value="LAST_7_DAYS">Últimos 7 días</option><option value="LAST_15_DAYS">Últimos 15 días</option><option value="LAST_MONTH">Último mes</option><option value="PREVIOUS_MONTH">Mes anterior</option><option value="CUSTOM">Personalizado</option></select></div>
      {datePreset === 'CUSTOM' ? <><div className={styles.field}><label htmlFor="payment-date-from">Desde</label><input id="payment-date-from" className={styles.input} type="date" value={dateFrom} onChange={(event) => updatePageOne(() => setDateFrom(event.target.value))} /></div><div className={styles.field}><label htmlFor="payment-date-to">Hasta</label><input id="payment-date-to" className={styles.input} type="date" value={dateTo} onChange={(event) => updatePageOne(() => setDateTo(event.target.value))} /></div></> : null}
      <div className={styles.field}><label htmlFor="payment-customer-search">Cliente / identificación</label><input id="payment-customer-search" className={styles.input} value={customerSearch} onChange={(event) => updatePageOne(() => setCustomerSearch(event.target.value))} /></div>
      <div className={styles.field}><label htmlFor="payment-currency">Moneda recibida</label><select id="payment-currency" className={styles.select} value={customerFilter?.currency ?? currency} disabled={Boolean(customerFilter?.currency)} onChange={(event) => updatePageOne(() => setCurrency(event.target.value as FinanceCurrency | ''))}><option value="">Todas</option><option value="CRC">CRC</option><option value="USD">USD</option></select></div>
      <div className={styles.field}><label htmlFor="payment-status">Estado</label><select id="payment-status" className={styles.select} value={status} onChange={(event) => updatePageOne(() => setStatus(event.target.value as PaymentStatus | ''))}><option value="">Todos</option>{PAYMENT_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{formatCustomerPaymentStatus(option)}</option>)}</select></div>
      <div className={styles.field}><label htmlFor="payment-method">Método de pago</label><select id="payment-method" className={styles.select} value={paymentMethod} onChange={(event) => updatePageOne(() => setPaymentMethod(event.target.value as FinancePaymentMethod | ''))}><option value="">Todos</option>{FINANCE_PAYMENT_METHOD_OPTIONS.map((option) => <option key={option.token} value={option.token}>{option.label}</option>)}</select></div>
      {hasFilters ? <Button className={styles.secondaryAction} type="button" variant="outline" onClick={clearFilters}>Limpiar filtros</Button> : null}
      {customerFilter ? <div className={styles.customerFilterChip}><span>Cliente</span><strong>{customerFilter.name}</strong><button type="button" aria-label="Quitar filtro de cliente" onClick={onClearCustomer}><X aria-hidden="true" /></button></div> : null}
    </section>
    {actionError && !openedPayment ? <div className={styles.inlineError} role="alert"><AlertCircle aria-hidden="true" /><span>{actionError}</span></div> : null}
    <section className={styles.tableCard}>
      <div className={styles.tableHeading}><div><h2>{customerFilter ? `Historial de recibos — ${customerFilter.name}` : 'Recibos'}</h2><p>Consulta de solo lectura de pagos y sus aplicaciones financieras.</p></div><span>{loading ? 'Cargando…' : summary}</span></div>
      {error ? <div className={styles.state}><div><span className={styles.stateIcon}><AlertCircle aria-hidden="true" /></span><h3 className={styles.error}>No se pudieron cargar los pagos</h3><p>{error.message}</p><Button className={styles.secondaryAction} variant="outline" type="button" onClick={() => setRetry((value) => value + 1)}>Intentar nuevamente</Button></div></div> : !loading && (!result || result.payments.length === 0) ? <div className={styles.state}><div><span className={styles.stateIcon}><Search aria-hidden="true" /></span><h3>No se encontraron pagos</h3><p>No hay pagos bajo los filtros seleccionados.</p></div></div> : <Table className={styles.paymentTable}><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Cliente / identificación</TableHead><TableHead>Recibido</TableHead><TableHead>Aplicado / equivalente</TableHead><TableHead>Estado</TableHead><TableHead>Aplicado a</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{loading ? Array.from({ length: 5 }, (_, row) => <TableRow key={row}>{Array.from({ length: 7 }, (_, cell) => <TableCell key={cell}><span className={styles.skeleton} /></TableCell>)}</TableRow>) : result?.payments.map((payment) => <TableRow key={payment.id}><TableCell>{formatTenantDateTime(payment.paymentDate)}</TableCell><TableCell><div className={styles.stack}><strong className={styles.reference}>{payment.customerDisplayName}</strong><small className={styles.tableSubtext}>{payment.customerIdentification ?? 'Sin identificación'}</small></div></TableCell><TableCell><div className={styles.stack}><strong className={styles.reference}>{formatFinanceMoney(payment.receivedAmount, payment.currencyCode)}</strong><small className={styles.tableSubtext}>{formatFinancePaymentMethod(payment.paymentMethod)}</small></div></TableCell><TableCell>{amountSummary(payment)}</TableCell><TableCell><div className={styles.stack}><Badge variant={customerPaymentStatusVariant(payment.status)}>{formatCustomerPaymentStatus(payment.status)}</Badge>{payment.rejectionReason ? <small className={styles.tableSubtext}>Ver razón en detalle</small> : null}</div></TableCell><TableCell>{applicationSummary(payment)}</TableCell><TableCell><Button className={styles.secondaryAction} disabled={openingId === payment.id} size="sm" type="button" variant="outline" onClick={() => void openPayment(payment.id)}><Eye aria-hidden="true" />{openingId === payment.id ? 'Abriendo…' : 'Detalle'}</Button></TableCell></TableRow>)}</TableBody></Table>}
      {!loading && !error && result && result.totalPages > 1 ? <nav className={styles.pagination}><p>Página {result.page} de {result.totalPages} · {summary}</p><div className={styles.paginationActions}><Button className={styles.secondaryAction} disabled={result.page <= 1} variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><Button className={styles.secondaryAction} disabled={result.page >= result.totalPages} variant="outline" onClick={() => setPage((value) => Math.min(result.totalPages, value + 1))}>Siguiente</Button></div></nav> : null}
    </section>
    {openedPayment ? <GlobalPaymentDetail payment={openedPayment} onClose={() => { setOpenedPayment(null); setActionError(null); }} onViewEvidence={openEvidence} onDownloadReceipt={downloadReceipt} evidenceBusy={evidenceBusyId === openedPayment.id} receiptBusy={receiptBusyId === openedPayment.id} actionError={actionError} /> : null}
    {evidenceViewer ? <AttachmentViewer attachments={evidenceViewer.attachments} resolveAttachmentUrl={resolveEvidenceUrl} onClose={() => setEvidenceViewer(null)} /> : null}
  </>;
}

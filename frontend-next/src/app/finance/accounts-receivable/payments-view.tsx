'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Eye, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  FinanceApiError,
  formatFinanceMoney,
  getPayment,
  listPayments,
  type FinanceCurrency,
  type PaymentDetail,
  type PaymentsPage,
  type PaymentStatus,
} from '@/lib/finance-api';
import { formatBusinessDate } from '@/shared/regional';
import styles from './accounts-receivable.module.css';
import { PaymentFlow } from './payment-flow';

const PAGE_SIZE = 20;

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  RECEIVED: 'Recibido',
  PARTIALLY_ALLOCATED: 'Aplicado parcialmente',
  FULLY_ALLOCATED: 'Aplicado por completo',
  CANCELLED: 'Cancelado',
};

export type PaymentCustomerFilter = { id: string; name: string; currency?: FinanceCurrency };

export function PaymentsView({ reloadToken, customerFilter, onClearCustomer }: {
  reloadToken: number;
  customerFilter: PaymentCustomerFilter | null;
  onClearCustomer: () => void;
}) {
  const [page, setPage] = useState(1);
  const [currency, setCurrency] = useState<FinanceCurrency | ''>('');
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [result, setResult] = useState<PaymentsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FinanceApiError | null>(null);
  const [retry, setRetry] = useState(0);
  const [openedPayment, setOpenedPayment] = useState<PaymentDetail | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    void reloadToken;
    void retry;
    setLoading(true);
    setError(null);
    try {
      const response = await listPayments({
        page,
        pageSize: PAGE_SIZE,
        customerId: customerFilter?.id,
        currency: customerFilter?.currency ?? (currency || undefined),
        status: status || undefined,
      }, signal);
      setResult(response);
      if (response.totalPages > 0 && page > response.totalPages) setPage(response.totalPages);
    } catch (requestError) {
      if (!signal.aborted) setError(requestError instanceof FinanceApiError ? requestError : new FinanceApiError('FINANCE_REQUEST_FAILED', 'No se pudieron cargar los pagos.'));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [currency, customerFilter?.currency, customerFilter?.id, page, reloadToken, retry, status]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => { setPage(1); }, [customerFilter?.id]);

  const summary = useMemo(() => {
    if (!result || result.total === 0) return '0 pagos';
    const first = (result.page - 1) * result.pageSize + 1;
    const last = Math.min(result.page * result.pageSize, result.total);
    return `${first}–${last} de ${result.total} pagos`;
  }, [result]);

  async function openPayment(id: string) {
    setOpeningId(id);
    setOpenError(null);
    try {
      setOpenedPayment(await getPayment(id));
    } catch (requestError) {
      setOpenError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el detalle del pago.');
    } finally {
      setOpeningId(null);
    }
  }

  return <>
    <section className={styles.paymentFilters} aria-label="Filtros de pagos">
      <div className={styles.field}><label htmlFor="payment-currency">Moneda</label><select id="payment-currency" className={styles.select} value={customerFilter?.currency ?? currency} disabled={Boolean(customerFilter?.currency)} onChange={(event) => { setCurrency(event.target.value as FinanceCurrency | ''); setPage(1); }}><option value="">Todas</option><option value="CRC">CRC</option><option value="USD">USD</option></select></div>
      <div className={styles.field}><label htmlFor="payment-status">Estado</label><select id="payment-status" className={styles.select} value={status} onChange={(event) => { setStatus(event.target.value as PaymentStatus | ''); setPage(1); }}><option value="">Todos</option><option value="RECEIVED">Recibido</option><option value="PARTIALLY_ALLOCATED">Aplicado parcialmente</option><option value="FULLY_ALLOCATED">Aplicado por completo</option><option value="CANCELLED">Cancelado</option></select></div>
      {customerFilter && <div className={styles.customerFilterChip}><span>Cliente</span><strong>{customerFilter.name}</strong><button type="button" aria-label="Quitar filtro de cliente" onClick={onClearCustomer}><X aria-hidden="true" /></button></div>}
    </section>
    {openError && <div className={styles.inlineError} role="alert"><AlertCircle aria-hidden="true" /><span>{openError}</span></div>}
    <section className={styles.tableCard}>
      <div className={styles.tableHeading}><div><h2>{customerFilter ? `Historial de pagos — ${customerFilter.name}` : 'Historial de pagos'}</h2><p>Consulta de solo lectura de pagos y facturas asignadas.</p></div><span>{loading ? 'Cargando…' : summary}</span></div>
      {error ? <div className={styles.state}><div><span className={styles.stateIcon}><AlertCircle aria-hidden="true" /></span><h3 className={styles.error}>No se pudieron cargar los pagos</h3><p>{error.message}</p><Button className={styles.secondaryAction} variant="outline" type="button" onClick={() => setRetry((value) => value + 1)}>Intentar nuevamente</Button></div></div> : !loading && (!result || result.payments.length === 0) ? <div className={styles.state}><div><span className={styles.stateIcon}><Search aria-hidden="true" /></span><h3>No se encontraron pagos</h3><p>No hay pagos bajo los filtros seleccionados.</p></div></div> : <Table className={styles.paymentTable}><TableHeader><TableRow><TableHead>Recibo / pagador</TableHead><TableHead>Fecha recibida</TableHead><TableHead>Moneda</TableHead><TableHead className={styles.numeric}>Recibido</TableHead><TableHead className={styles.numeric}>Disponible</TableHead><TableHead>Método</TableHead><TableHead>Estado</TableHead><TableHead>Detalle</TableHead></TableRow></TableHeader><TableBody>{loading ? Array.from({ length: 5 }, (_, row) => <TableRow key={row}>{Array.from({ length: 8 }, (_, cell) => <TableCell key={cell}><span className={styles.skeleton} /></TableCell>)}</TableRow>) : result?.payments.map((payment) => <TableRow key={payment.id}><TableCell><div className={styles.stack}><strong className={styles.reference}>{payment.receiptNumber}</strong><span>{payment.payerDisplayName}</span><span className={styles.secondary}>{payment.externalReference ? `Ref. ${payment.externalReference}` : payment.payerIdentificationNumber ?? 'Sin referencia externa'}</span></div></TableCell><TableCell>{formatBusinessDate(payment.receivedAt)}</TableCell><TableCell>{payment.currencyCode}</TableCell><TableCell className={styles.numeric}>{formatFinanceMoney(payment.receivedAmount, payment.currencyCode)}</TableCell><TableCell className={styles.numeric}><strong className={styles.availableAmount}>{formatFinanceMoney(payment.availableAmount, payment.currencyCode)}</strong></TableCell><TableCell>{payment.paymentMethod}</TableCell><TableCell><Badge className={styles.paymentStatusBadge} variant="outline">{PAYMENT_STATUS_LABELS[payment.status]}</Badge></TableCell><TableCell><Button className={styles.secondaryAction} disabled={openingId === payment.id} size="sm" type="button" variant="outline" onClick={() => void openPayment(payment.id)}><Eye aria-hidden="true" />{openingId === payment.id ? 'Abriendo…' : 'Ver detalle'}</Button></TableCell></TableRow>)}</TableBody></Table>}
      {!loading && !error && result && result.totalPages > 1 && <nav className={styles.pagination}><p>Página {result.page} de {result.totalPages} · {summary}</p><div className={styles.paginationActions}><Button className={styles.secondaryAction} disabled={result.page <= 1} variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><Button className={styles.secondaryAction} disabled={result.page >= result.totalPages} variant="outline" onClick={() => setPage((value) => Math.min(result.totalPages, value + 1))}>Siguiente</Button></div></nav>}
    </section>
    {openedPayment && <PaymentFlow initialPayment={openedPayment} canAllocate={false} onClose={() => setOpenedPayment(null)} onAllocated={() => undefined} />}
  </>;
}

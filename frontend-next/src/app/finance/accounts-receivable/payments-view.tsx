'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Eye, Search, WalletCards, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  FinanceApiError,
  formatFinanceMoney,
  getPayment,
  listPayments,
  listUnallocatedPaymentBalances,
  type FinanceCurrency,
  type PaymentDetail,
  type PaymentsPage,
  type PaymentStatus,
  type UnallocatedPaymentBalancesPage,
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

function UnallocatedPaymentBalances({ canWrite, reloadToken, onApplyBalance }: { canWrite: boolean; reloadToken: number; onApplyBalance: (customer: PaymentCustomerFilter) => void }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<UnallocatedPaymentBalancesPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FinanceApiError | null>(null);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    void reloadToken;
    void retry;
    setLoading(true);
    setError(null);
    try {
      const response = await listUnallocatedPaymentBalances({ page, pageSize: PAGE_SIZE }, signal);
      setResult(response);
      if (response.totalPages > 0 && page > response.totalPages) setPage(response.totalPages);
    } catch (requestError) {
      if (!signal.aborted) setError(requestError instanceof FinanceApiError ? requestError : new FinanceApiError('FINANCE_REQUEST_FAILED', 'No se pudieron cargar los saldos a favor.'));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [page, reloadToken, retry]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (!loading && !error && (!result || result.balances.length === 0)) return null;

  return <section className={`${styles.tableCard} ${styles.creditBalances}`}>
    <div className={styles.tableHeading}><div><h2>Saldo a favor — Recibos de dinero</h2><p>Dinero recibido sin aplicar, incluso cuando no existe una cuenta por cobrar para el cliente.</p></div><span>{loading ? 'Cargando…' : `${result?.total ?? 0} cliente(s) / moneda`}</span></div>
    {error ? <div className={styles.inlineError} role="alert"><AlertCircle aria-hidden="true" /><span>{error.message}</span><Button className={styles.secondaryAction} size="sm" type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>Intentar nuevamente</Button></div> : <Table className={styles.paymentTable}><TableHeader><TableRow><TableHead>Cliente / deudor</TableHead><TableHead>Moneda</TableHead><TableHead className={styles.numeric}>Saldo a favor</TableHead><TableHead className={styles.numeric}>Recibos de dinero</TableHead><TableHead>Acción</TableHead></TableRow></TableHeader><TableBody>{loading ? Array.from({ length: 3 }, (_, row) => <TableRow key={row}>{Array.from({ length: 5 }, (_, cell) => <TableCell key={cell}><span className={styles.skeleton} /></TableCell>)}</TableRow>) : result?.balances.map((balance) => <TableRow key={`${balance.customerId}-${balance.currencyCode}`}><TableCell><div className={styles.stack}><strong>{balance.debtor.displayName}</strong><span className={styles.secondary}>{balance.debtor.identificationNumber ?? balance.customerId}</span></div></TableCell><TableCell>{balance.currencyCode}</TableCell><TableCell className={styles.numeric}><strong>{formatFinanceMoney(balance.unallocatedPaymentAmount, balance.currencyCode)}</strong></TableCell><TableCell className={styles.numeric}>{balance.unallocatedPaymentCount}</TableCell><TableCell>{canWrite && <Button className={styles.creditAction} size="sm" type="button" onClick={() => onApplyBalance({ id: balance.customerId, name: balance.debtor.displayName, currency: balance.currencyCode })}>Aplicar saldo</Button>}</TableCell></TableRow>)}</TableBody></Table>}
    {!loading && !error && result && result.totalPages > 1 && <nav className={styles.pagination}><p>Página {result.page} de {result.totalPages}</p><div className={styles.paginationActions}><Button className={styles.secondaryAction} disabled={result.page <= 1} variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><Button className={styles.secondaryAction} disabled={result.page >= result.totalPages} variant="outline" onClick={() => setPage((value) => Math.min(result.totalPages, value + 1))}>Siguiente</Button></div></nav>}
  </section>;
}

export function PaymentsView({ canWrite, reloadToken, customerFilter, onClearCustomer, onChanged, onApplyBalance }: {
  canWrite: boolean;
  reloadToken: number;
  customerFilter: PaymentCustomerFilter | null;
  onClearCustomer: () => void;
  onChanged: () => void;
  onApplyBalance: (customer: PaymentCustomerFilter) => void;
}) {
  const [page, setPage] = useState(1);
  const [availableOnly, setAvailableOnly] = useState(true);
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
        availableOnly,
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
  }, [availableOnly, currency, customerFilter?.currency, customerFilter?.id, page, reloadToken, retry, status]);

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
      <label className={styles.availableToggle}><input type="checkbox" checked={availableOnly} onChange={(event) => { setAvailableOnly(event.target.checked); setPage(1); }} /><span><strong>Con dinero disponible</strong><small>Pagos recuperables para continuar su aplicación</small></span></label>
      <div className={styles.field}><label htmlFor="payment-currency">Moneda</label><select id="payment-currency" className={styles.select} value={customerFilter?.currency ?? currency} disabled={Boolean(customerFilter?.currency)} onChange={(event) => { setCurrency(event.target.value as FinanceCurrency | ''); setPage(1); }}><option value="">Todas</option><option value="CRC">CRC</option><option value="USD">USD</option></select></div>
      <div className={styles.field}><label htmlFor="payment-status">Estado</label><select id="payment-status" className={styles.select} value={status} onChange={(event) => { setStatus(event.target.value as PaymentStatus | ''); setPage(1); }}><option value="">Todos</option><option value="RECEIVED">Recibido</option><option value="PARTIALLY_ALLOCATED">Aplicado parcialmente</option><option value="FULLY_ALLOCATED">Aplicado por completo</option><option value="CANCELLED">Cancelado</option></select></div>
      {customerFilter && <div className={styles.customerFilterChip}><span>Cliente</span><strong>{customerFilter.name}</strong><button type="button" aria-label="Quitar filtro de cliente" onClick={onClearCustomer}><X aria-hidden="true" /></button></div>}
    </section>
    {openError && <div className={styles.inlineError} role="alert"><AlertCircle aria-hidden="true" /><span>{openError}</span></div>}
    <UnallocatedPaymentBalances canWrite={canWrite} reloadToken={reloadToken} onApplyBalance={onApplyBalance} />
    <section className={styles.tableCard}>
      <div className={styles.tableHeading}><div><h2>Pagos registrados</h2><p>Abra un pago disponible para continuar su aplicación sin volver a registrarlo.</p></div><span>{loading ? 'Cargando…' : summary}</span></div>
      {error ? <div className={styles.state}><div><span className={styles.stateIcon}><AlertCircle aria-hidden="true" /></span><h3 className={styles.error}>No se pudieron cargar los pagos</h3><p>{error.message}</p><Button className={styles.secondaryAction} variant="outline" type="button" onClick={() => setRetry((value) => value + 1)}>Intentar nuevamente</Button></div></div> : !loading && (!result || result.payments.length === 0) ? <div className={styles.state}><div><span className={styles.stateIcon}><Search aria-hidden="true" /></span><h3>No se encontraron pagos</h3><p>{availableOnly ? 'No hay pagos con dinero disponible bajo los filtros seleccionados.' : 'No hay pagos bajo los filtros seleccionados.'}</p></div></div> : <Table className={styles.paymentTable}><TableHeader><TableRow><TableHead>Pagador / cliente</TableHead><TableHead>Fecha recibida</TableHead><TableHead>Moneda</TableHead><TableHead className={styles.numeric}>Recibido</TableHead><TableHead className={styles.numeric}>Disponible</TableHead><TableHead>Método</TableHead><TableHead>Estado</TableHead><TableHead>Acción</TableHead></TableRow></TableHeader><TableBody>{loading ? Array.from({ length: 5 }, (_, row) => <TableRow key={row}>{Array.from({ length: 8 }, (_, cell) => <TableCell key={cell}><span className={styles.skeleton} /></TableCell>)}</TableRow>) : result?.payments.map((payment) => <TableRow key={payment.id}><TableCell><div className={styles.stack}><strong>{payment.payerDisplayName}</strong><span className={styles.secondary}>{payment.payerIdentificationNumber ?? 'Sin identificación asociada'}</span></div></TableCell><TableCell>{formatBusinessDate(payment.receivedAt)}</TableCell><TableCell>{payment.currencyCode}</TableCell><TableCell className={styles.numeric}>{formatFinanceMoney(payment.receivedAmount, payment.currencyCode)}</TableCell><TableCell className={styles.numeric}><strong>{formatFinanceMoney(payment.availableAmount, payment.currencyCode)}</strong></TableCell><TableCell>{payment.paymentMethod}</TableCell><TableCell><Badge className={styles.paymentStatusBadge} variant="outline">{PAYMENT_STATUS_LABELS[payment.status]}</Badge></TableCell><TableCell><Button className={canWrite ? styles.actionButton : styles.secondaryAction} disabled={openingId === payment.id} size="sm" type="button" variant={canWrite ? 'default' : 'outline'} onClick={() => void openPayment(payment.id)}>{canWrite ? <WalletCards aria-hidden="true" /> : <Eye aria-hidden="true" />}{openingId === payment.id ? 'Abriendo…' : canWrite ? 'Abrir / aplicar' : 'Ver detalle'}</Button></TableCell></TableRow>)}</TableBody></Table>}
      {!loading && !error && result && result.totalPages > 1 && <nav className={styles.pagination}><p>Página {result.page} de {result.totalPages} · {summary}</p><div className={styles.paginationActions}><Button className={styles.secondaryAction} disabled={result.page <= 1} variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><Button className={styles.secondaryAction} disabled={result.page >= result.totalPages} variant="outline" onClick={() => setPage((value) => Math.min(result.totalPages, value + 1))}>Siguiente</Button></div></nav>}
    </section>
    {openedPayment && <PaymentFlow initialPayment={openedPayment} canAllocate={canWrite} onClose={() => setOpenedPayment(null)} onAllocated={() => { setRetry((value) => value + 1); onChanged(); }} />}
  </>;
}

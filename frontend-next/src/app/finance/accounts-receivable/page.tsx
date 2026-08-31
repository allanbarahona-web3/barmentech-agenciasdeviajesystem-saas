'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Eye, FileSearch, ReceiptText, WalletCards, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getHomeRouteForRole, getStoredSession } from '@/lib/auth-api';
import {
  FinanceApiError,
  formatFinanceMoney,
  getAccountReceivable,
  listAccountReceivables,
  type AccountReceivableDetail,
  type AccountReceivableListItem,
  type AccountReceivableStatus,
  type AccountReceivablesPage,
  type FinanceCurrency,
} from '@/lib/finance-api';
import { formatBusinessDate } from '@/shared/regional';
import styles from './accounts-receivable.module.css';

const PAGE_SIZE = 20;
const READ_ROLES = new Set(['ADMIN', 'FACTURACION_COBROS', 'CONTADOR']);

const STATUS_LABELS: Record<AccountReceivableStatus, string> = {
  OPEN: 'Abierta',
  PARTIALLY_SETTLED: 'Pago parcial',
  SETTLED: 'Saldada',
  CANCELLED: 'Cancelada',
};

function statusClass(status: AccountReceivableStatus) {
  if (status === 'OPEN') return styles.openBadge;
  if (status === 'PARTIALLY_SETTLED') return styles.partialBadge;
  if (status === 'SETTLED') return styles.settledBadge;
  return styles.cancelledBadge;
}

function StatusBadge({ status }: { status: AccountReceivableStatus }) {
  return <Badge className={statusClass(status)} variant="outline">{STATUS_LABELS[status]}</Badge>;
}

function invoiceReference(receivable: AccountReceivableListItem) {
  return receivable.source.sourceNumber || receivable.source.billingDocumentId || receivable.source.sourceId;
}

function LoadingRows() {
  return Array.from({ length: 6 }, (_, row) => (
    <TableRow key={row}>{Array.from({ length: 8 }, (_, cell) => (
      <TableCell key={cell}><span className={styles.skeleton} /></TableCell>
    ))}</TableRow>
  ));
}

function ReceivableDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<AccountReceivableDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    getAccountReceivable(id, controller.signal)
      .then(setDetail)
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar la cuenta por cobrar.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <>
      <button className={styles.drawerBackdrop} type="button" aria-label="Cerrar detalle" onClick={onClose} />
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="receivable-detail-title">
        <header className={styles.drawerHeader}>
          <div><p>Cuenta por cobrar</p><h2 id="receivable-detail-title">Detalle de la deuda</h2></div>
          <Button className={styles.closeButton} size="icon" variant="ghost" type="button" aria-label="Cerrar" onClick={onClose}><X aria-hidden="true" /></Button>
        </header>
        <div className={styles.drawerBody}>
          {loading ? <div className={styles.state}><LoadingSpinner message="Cargando cuenta por cobrar…" /></div> : error || !detail ? (
            <div className={styles.state}><div><AlertCircle aria-hidden="true" /><h3>No se pudo cargar el detalle</h3><p>{error ?? 'La cuenta por cobrar no está disponible.'}</p></div></div>
          ) : (
            <>
              <section className={styles.detailCard}>
                <h3>Estado financiero</h3>
                <dl className={styles.facts}>
                  <div><dt>Estado</dt><dd><span className={styles.badgeGroup}><StatusBadge status={detail.status} />{detail.isOverdue && <Badge className={styles.overdueBadge} variant="outline">Vencida</Badge>}</span></dd></div>
                  <div><dt>Monto original</dt><dd>{formatFinanceMoney(detail.originalAmount, detail.currencyCode)}</dd></div>
                  <div><dt>Saldo pendiente</dt><dd>{formatFinanceMoney(detail.outstandingAmount, detail.currencyCode)}</dd></div>
                  <div><dt>Fecha de vencimiento</dt><dd>{formatBusinessDate(detail.dueDate)}</dd></div>
                  <div><dt>Fecha de reconocimiento</dt><dd>{formatBusinessDate(detail.recognizedAt)}</dd></div>
                  <div><dt>Fecha de liquidación</dt><dd>{detail.settledAt ? formatBusinessDate(detail.settledAt) : '—'}</dd></div>
                </dl>
              </section>
              <section className={styles.detailCard}>
                <h3>Factura y origen</h3>
                <dl className={styles.facts}>
                  <div><dt>Referencia fiscal</dt><dd>{detail.sourceNumber ?? 'No disponible'}</dd></div>
                  <div><dt>BillingDocument</dt><dd>{detail.sourceId}</dd></div>
                  <div><dt>Tipo de documento</dt><dd>{detail.sourceDocumentType ?? 'No disponible'}</dd></div>
                  <div><dt>Tipo de origen</dt><dd>{detail.sourceType}</dd></div>
                </dl>
              </section>
              <section className={styles.detailCard}>
                <h3>Deudor</h3>
                <dl className={styles.facts}>
                  <div><dt>Nombre</dt><dd>{detail.debtorDisplayName}</dd></div>
                  <div><dt>Identificación</dt><dd>{detail.debtorIdentificationNumber ?? 'No disponible'}</dd></div>
                  <div><dt>Cliente</dt><dd>{detail.customerId ?? 'Sin cliente asociado'}</dd></div>
                </dl>
              </section>
              <section className={styles.detailCard}>
                <h3>Aplicaciones registradas</h3>
                {detail.allocations.length === 0 ? <p className={styles.secondary}>No hay aplicaciones de pago registradas.</p> : (
                  <div className={styles.allocationList}>{detail.allocations.map((allocation) => (
                    <article className={styles.allocation} key={allocation.id}>
                      <div className={styles.allocationHeader}>
                        <strong>{formatFinanceMoney(allocation.amount, detail.currencyCode)}</strong>
                        <Badge className={allocation.status === 'ACTIVE' ? styles.activeBadge : styles.reversedBadge} variant="outline">{allocation.status === 'ACTIVE' ? 'Activa' : 'Revertida'}</Badge>
                      </div>
                      <p>Pago: {allocation.paymentId} · Aplicado: {formatBusinessDate(allocation.allocatedAt)}</p>
                      {allocation.reversal && <p>Reversión: {allocation.reversal.reason} · {formatBusinessDate(allocation.reversal.reversedAt)}</p>}
                    </article>
                  ))}</div>
                )}
              </section>
              <section className={styles.futureAction}>
                <p>La acción de cobro se habilitará en el siguiente incremento del espacio de Finanzas.</p>
                <Button className={styles.primaryAction} disabled type="button"><WalletCards aria-hidden="true" />Registrar pago / abono</Button>
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

export default function AccountsReceivablePage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [result, setResult] = useState<AccountReceivablesPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FinanceApiError | null>(null);
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(1);
  const [customerInput, setCustomerInput] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState<AccountReceivableStatus | ''>('');
  const [currency, setCurrency] = useState<FinanceCurrency | ''>('');
  const [dueDateFrom, setDueDateFrom] = useState('');
  const [dueDateTo, setDueDateTo] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user?.id) { router.replace('/'); return; }
    const role = String(session.user.role ?? '').toUpperCase();
    if (!READ_ROLES.has(role)) { router.replace(getHomeRouteForRole(role)); return; }
    setAuthorized(true);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setCustomerId(customerInput.trim()); setPage(1); }, 350);
    return () => window.clearTimeout(timer);
  }, [customerInput]);

  const load = useCallback(async (signal: AbortSignal) => {
    if (!authorized) return;
    void reload;
    setLoading(true);
    setError(null);
    try {
      const response = await listAccountReceivables({
        page, pageSize: PAGE_SIZE,
        customerId: customerId || undefined,
        status: status || undefined,
        currency: currency || undefined,
        dueDateFrom: dueDateFrom || undefined,
        dueDateTo: dueDateTo || undefined,
      }, signal);
      setResult(response);
      if (response.totalPages > 0 && page > response.totalPages) setPage(response.totalPages);
    } catch (requestError) {
      if (!signal.aborted) setError(requestError instanceof FinanceApiError ? requestError : new FinanceApiError('FINANCE_REQUEST_FAILED', 'No se pudieron cargar las cuentas por cobrar.'));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [authorized, currency, customerId, dueDateFrom, dueDateTo, page, reload, status]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const receivables = result?.accountReceivables ?? [];
  const hasFilters = Boolean(customerId || status || currency || dueDateFrom || dueDateTo);
  const summary = useMemo(() => {
    if (!result || result.total === 0) return '0 cuentas';
    const first = (result.page - 1) * result.pageSize + 1;
    const last = Math.min(result.page * result.pageSize, result.total);
    return `${first}–${last} de ${result.total} cuentas`;
  }, [result]);

  function clearFilters() {
    setCustomerInput(''); setCustomerId(''); setStatus(''); setCurrency(''); setDueDateFrom(''); setDueDateTo(''); setPage(1);
  }

  if (!authorized) return <main className="app-shell"><div className={styles.state}><LoadingSpinner message="Validando acceso…" /></div></main>;

  return (
    <main className="app-shell">
      <div className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Finanzas</p>
          <h1 className={styles.title}>Cuentas por cobrar</h1>
          <p className={styles.subtitle}>Consulte las deudas reconocidas desde documentos fiscales aceptados.</p>
        </header>
        <section className={styles.filters} aria-label="Filtros de cuentas por cobrar">
          <div className={styles.field}><label htmlFor="cxc-customer">Cliente (ID)</label><input id="cxc-customer" className={styles.input} value={customerInput} placeholder="Identificador del cliente" onChange={(event) => setCustomerInput(event.target.value)} /></div>
          <div className={styles.field}><label htmlFor="cxc-status">Estado</label><select id="cxc-status" className={styles.select} value={status} onChange={(event) => { setStatus(event.target.value as AccountReceivableStatus | ''); setPage(1); }}><option value="">Todos</option><option value="OPEN">Abierta</option><option value="PARTIALLY_SETTLED">Pago parcial</option><option value="SETTLED">Saldada</option><option value="CANCELLED">Cancelada</option></select></div>
          <div className={styles.field}><label htmlFor="cxc-currency">Moneda</label><select id="cxc-currency" className={styles.select} value={currency} onChange={(event) => { setCurrency(event.target.value as FinanceCurrency | ''); setPage(1); }}><option value="">Todas</option><option value="CRC">CRC</option><option value="USD">USD</option></select></div>
          <div className={styles.field}><label htmlFor="cxc-due-from">Vence desde</label><input id="cxc-due-from" className={styles.input} type="date" value={dueDateFrom} onChange={(event) => { setDueDateFrom(event.target.value); setPage(1); }} /></div>
          <div className={styles.field}><label htmlFor="cxc-due-to">Vence hasta</label><input id="cxc-due-to" className={styles.input} type="date" value={dueDateTo} onChange={(event) => { setDueDateTo(event.target.value); setPage(1); }} /></div>
          <Button className={styles.clearButton} disabled={!hasFilters && !customerInput} type="button" variant="outline" onClick={clearFilters}>Limpiar</Button>
        </section>
        <section className={styles.tableCard}>
          <div className={styles.tableHeading}><h2>Cuentas reconocidas</h2><span>{loading ? 'Cargando…' : summary}</span></div>
          {error ? <div className={styles.state}><div><span className={styles.stateIcon}><AlertCircle aria-hidden="true" /></span><h3 className={styles.error}>No se pudieron cargar las cuentas</h3><p>{error.message}</p><Button variant="outline" type="button" onClick={() => setReload((value) => value + 1)}>Intentar nuevamente</Button></div></div> : !loading && receivables.length === 0 ? <div className={styles.state}><div><span className={styles.stateIcon}>{hasFilters ? <FileSearch aria-hidden="true" /> : <ReceiptText aria-hidden="true" />}</span><h3>{hasFilters ? 'No se encontraron cuentas' : 'No hay cuentas por cobrar'}</h3><p>{hasFilters ? 'Ajuste los filtros para ampliar la búsqueda.' : 'Las deudas aparecerán aquí después de la aceptación fiscal.'}</p></div></div> : (
            <Table className={styles.table}><TableHeader><TableRow><TableHead>Cliente / deudor</TableHead><TableHead>Referencia fiscal</TableHead><TableHead>Moneda</TableHead><TableHead className={styles.numeric}>Monto original</TableHead><TableHead className={styles.numeric}>Saldo pendiente</TableHead><TableHead>Vencimiento</TableHead><TableHead>Estado</TableHead><TableHead>Acción</TableHead></TableRow></TableHeader><TableBody>{loading ? <LoadingRows /> : receivables.map((receivable) => <TableRow key={receivable.id}><TableCell><div className={styles.stack}><strong>{receivable.debtorDisplayName}</strong><span className={styles.secondary}>{receivable.debtorIdentificationNumber ?? receivable.customerId ?? 'Sin identificación'}</span></div></TableCell><TableCell><div className={styles.stack}><span className={styles.reference}>{invoiceReference(receivable)}</span><span className={styles.secondary}>{receivable.source.sourceDocumentType ?? receivable.source.type}</span></div></TableCell><TableCell>{receivable.currencyCode}</TableCell><TableCell className={styles.numeric}>{formatFinanceMoney(receivable.originalAmount, receivable.currencyCode)}</TableCell><TableCell className={styles.numeric}>{formatFinanceMoney(receivable.outstandingAmount, receivable.currencyCode)}</TableCell><TableCell>{formatBusinessDate(receivable.dueDate)}</TableCell><TableCell className={styles.status}><span className={styles.badgeGroup}><StatusBadge status={receivable.status} />{receivable.isOverdue && <Badge className={styles.overdueBadge} variant="outline">Vencida</Badge>}</span></TableCell><TableCell><Button className={styles.actionButton} size="sm" type="button" onClick={() => setSelectedId(receivable.id)}><Eye aria-hidden="true" />Ver detalle</Button></TableCell></TableRow>)}</TableBody></Table>
          )}
          {!loading && !error && result && result.totalPages > 1 && <nav className={styles.pagination} aria-label="Paginación de cuentas por cobrar"><p>Página {result.page} de {result.totalPages} · {summary}</p><div className={styles.paginationActions}><Button disabled={result.page <= 1} variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><Button disabled={result.page >= result.totalPages} variant="outline" onClick={() => setPage((value) => Math.min(result.totalPages, value + 1))}>Siguiente</Button></div></nav>}
        </section>
      </div>
      {selectedId && <ReceivableDrawer key={selectedId} id={selectedId} onClose={() => setSelectedId(null)} />}
    </main>
  );
}

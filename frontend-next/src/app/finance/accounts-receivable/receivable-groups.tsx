'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, Eye, FileSearch, WalletCards } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  FinanceApiError,
  formatFinanceMoney,
  listAccountReceivableGroupItems,
  listAccountReceivableGroups,
  type AccountReceivableGroup,
  type AccountReceivableGroupsPage,
  type AccountReceivableStatus,
  type AccountReceivablesPage,
} from '@/lib/finance-api';
import { formatBusinessDate } from '@/shared/regional';
import styles from './accounts-receivable.module.css';

const PAGE_SIZE = 20;
const CHILD_PAGE_SIZE = 10;

const STATUS_LABELS: Record<AccountReceivableStatus, string> = {
  OPEN: 'Abierta',
  PARTIALLY_SETTLED: 'Abonada',
  SETTLED: 'Cancelada',
  CANCELLED: 'Anulada',
};

function statusClass(status: AccountReceivableStatus) {
  if (status === 'OPEN') return styles.openBadge;
  if (status === 'PARTIALLY_SETTLED') return styles.partialBadge;
  if (status === 'SETTLED') return styles.settledBadge;
  return styles.cancelledBadge;
}

function invoiceReference(source: { sourceNumber: string | null; billingDocumentId: string | null; sourceId: string }) {
  return source.sourceNumber || source.billingDocumentId || source.sourceId;
}

function GroupRows({ group, canWrite, reloadToken, onOpenDetail, onRegisterPayment, onViewPayments }: {
  group: AccountReceivableGroup;
  canWrite: boolean;
  reloadToken: number;
  onOpenDetail: (id: string) => void;
  onRegisterPayment: (id: string) => void;
  onViewPayments: (customer: { id: string; name: string; currency: 'CRC' | 'USD' }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<(AccountReceivablesPage & { groupKey: string }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
      return listAccountReceivableGroupItems(group.groupKey, { page, pageSize: CHILD_PAGE_SIZE }, controller.signal)
        .then(setResult)
        .catch((requestError) => {
          if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar las cuentas del grupo.');
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    });
    return () => controller.abort();
  }, [expanded, group.groupKey, page, reloadToken]);

  return (
    <Fragment>
      <TableRow className={expanded ? styles.expandedGroupRow : undefined}>
        <TableCell>
          <button className={styles.expandButton} type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
            <ChevronRight className={expanded ? styles.expandIconOpen : undefined} aria-hidden="true" />
            <span className={styles.stack}><strong>{group.debtor.displayName}</strong><span className={styles.secondary}>{group.debtor.identificationNumber ?? group.customerId ?? 'Sin identificación asociada'}</span></span>
          </button>
        </TableCell>
        <TableCell>{group.currencyCode}</TableCell>
        <TableCell>
          <section className={`${styles.ledgerBlock} ${styles.debtLedger}`} aria-label="Cuentas por cobrar">
            <h3>CxC / Deuda</h3>
            <dl className={styles.ledgerMetrics}>
              <div><dt>Facturado / original</dt><dd>{formatFinanceMoney(group.totalOriginalAmount, group.currencyCode)}</dd></div>
              <div><dt>Aplicado</dt><dd>{formatFinanceMoney(group.totalAllocatedAmount, group.currencyCode)}</dd></div>
              <div><dt>Pendiente</dt><dd>{formatFinanceMoney(group.totalOutstandingAmount, group.currencyCode)}</dd></div>
              <div><dt>Vencido</dt><dd className={group.counts.overdue > 0 ? styles.overdueAmount : undefined}>{formatFinanceMoney(group.totalOverdueOutstandingAmount, group.currencyCode)}<small>{group.counts.overdue} vencida(s)</small></dd></div>
              <div><dt>Cuentas abiertas</dt><dd>{group.counts.open} abiertas<small>{group.counts.partiallySettled} abonadas</small></dd></div>
            </dl>
          </section>
        </TableCell>
        <TableCell>
          <section className={`${styles.ledgerBlock} ${styles.fundsLedger}`} aria-label="Fondos recibidos">
            <h3>Fondos recibidos</h3>
            <dl className={styles.ledgerMetrics}>
              <div><dt>Recibido</dt><dd>{formatFinanceMoney(group.totalReceivedAmount, group.currencyCode)}</dd></div>
              <div><dt>Aplicado</dt><dd>{formatFinanceMoney(group.totalActiveAllocatedAmount, group.currencyCode)}</dd></div>
              <div><dt>Saldo disponible</dt><dd>{formatFinanceMoney(group.unallocatedPaymentAmount, group.currencyCode)}</dd></div>
              <div><dt>Recibos con saldo</dt><dd>{group.unallocatedPaymentCount}</dd></div>
            </dl>
          </section>
        </TableCell>
        <TableCell><div className={styles.rowActions}><Button className={styles.secondaryAction} size="sm" type="button" variant="outline" onClick={() => setExpanded((value) => !value)}><ChevronDown aria-hidden="true" />{expanded ? 'Ocultar' : 'Ver cuentas'}</Button>{group.customerId && <Button className={styles.secondaryAction} size="sm" type="button" variant="outline" onClick={() => onViewPayments({ id: group.customerId!, name: group.debtor.displayName, currency: group.currencyCode })}>{group.unallocatedPaymentCount > 0 ? 'Ver recibos con saldo' : 'Ver pagos'}</Button>}</div></TableCell>
      </TableRow>
      {expanded && <TableRow className={styles.childContainerRow}>
        <TableCell colSpan={5}>
          <div className={styles.childPanel}>
            <div className={styles.childHeading}><div><h3>Cuentas por cobrar</h3><p>Cargadas bajo el grupo financiero emitido por el backend.</p></div><span>{loading ? 'Cargando…' : `${result?.total ?? 0} cuenta(s)`}</span></div>
            {error ? <div className={styles.inlineError}><AlertCircle aria-hidden="true" /><span>{error}</span></div> : loading && !result ? <div className={styles.childLoading}>Cargando cuentas…</div> : result && result.accountReceivables.length > 0 ? <div className={styles.childTableWrap}>
              <Table className={styles.childTable}><TableHeader><TableRow><TableHead>Documento</TableHead><TableHead className={styles.numeric}>Monto original</TableHead><TableHead className={styles.numeric}>Saldo pendiente</TableHead><TableHead>Vencimiento</TableHead><TableHead>Estado</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{result.accountReceivables.map((receivable) => <TableRow key={receivable.id}>
                <TableCell><div className={styles.stack}><span className={styles.reference}>{invoiceReference(receivable.source)}</span><span className={styles.secondary}>{receivable.source.sourceDocumentType ?? receivable.source.type}</span></div></TableCell>
                <TableCell className={styles.numeric}>{formatFinanceMoney(receivable.originalAmount, receivable.currencyCode)}</TableCell>
                <TableCell className={styles.numeric}>{formatFinanceMoney(receivable.outstandingAmount, receivable.currencyCode)}</TableCell>
                <TableCell>{formatBusinessDate(receivable.dueDate)}</TableCell>
                <TableCell><span className={styles.badgeGroup}><Badge className={statusClass(receivable.status)} variant="outline">{STATUS_LABELS[receivable.status]}</Badge>{receivable.isOverdue === true && <Badge className={styles.overdueBadge} variant="outline">Vencida</Badge>}</span></TableCell>
                <TableCell><div className={styles.rowActions}><Button className={styles.secondaryAction} size="sm" type="button" variant="outline" onClick={() => onOpenDetail(receivable.id)}><Eye aria-hidden="true" />Detalle</Button>{canWrite && (receivable.status === 'SETTLED' || receivable.status === 'CANCELLED' ? <Button className={styles.secondaryAction} disabled size="sm" type="button" variant="outline" title="Esta cuenta ya no admite abonos.">No disponible</Button> : <Button className={styles.actionButton} size="sm" type="button" onClick={() => onRegisterPayment(receivable.id)}><WalletCards aria-hidden="true" />Registrar abono</Button>)}</div></TableCell>
              </TableRow>)}</TableBody></Table>
            </div> : <div className={styles.childLoading}>El grupo no contiene cuentas disponibles.</div>}
            {result && result.totalPages > 1 && <nav className={styles.candidatePagination}><Button className={styles.secondaryAction} disabled={result.page <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><span>Página {result.page} de {result.totalPages}</span><Button className={styles.secondaryAction} disabled={result.page >= result.totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(result.totalPages, value + 1))}>Siguiente</Button></nav>}
          </div>
        </TableCell>
      </TableRow>}
    </Fragment>
  );
}

export function ReceivableGroupsView({ canWrite, reloadToken, onOpenDetail, onRegisterPayment, onViewPayments }: {
  canWrite: boolean;
  reloadToken: number;
  onOpenDetail: (id: string) => void;
  onRegisterPayment: (id: string) => void;
  onViewPayments: (customer: { id: string; name: string; currency: 'CRC' | 'USD' }) => void;
}) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AccountReceivableGroupsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FinanceApiError | null>(null);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    void reloadToken; void retry;
    setLoading(true); setError(null);
    try {
      const response = await listAccountReceivableGroups({ page, pageSize: PAGE_SIZE }, signal);
      setResult(response);
      if (response.totalPages > 0 && page > response.totalPages) setPage(response.totalPages);
    } catch (requestError) {
      if (!signal.aborted) setError(requestError instanceof FinanceApiError ? requestError : new FinanceApiError('FINANCE_REQUEST_FAILED', 'No se pudieron cargar los grupos financieros.'));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [page, reloadToken, retry]);

  useEffect(() => {
    const controller = new AbortController(); void load(controller.signal); return () => controller.abort();
  }, [load]);

  const summary = useMemo(() => {
    if (!result || result.total === 0) return '0 grupos';
    const first = (result.page - 1) * result.pageSize + 1;
    const last = Math.min(result.page * result.pageSize, result.total);
    return `${first}–${last} de ${result.total} grupos`;
  }, [result]);

  return <section className={styles.tableCard}>
    <div className={styles.tableHeading}><div><h2>Cartera por cliente y moneda</h2><p>Los totales provienen del modelo de lectura de Finanzas.</p></div><span>{loading ? 'Cargando…' : summary}</span></div>
    {error ? <div className={styles.state}><div><span className={styles.stateIcon}><AlertCircle aria-hidden="true" /></span><h3 className={styles.error}>No se pudo cargar la cartera</h3><p>{error.message}</p><Button className={styles.secondaryAction} variant="outline" type="button" onClick={() => setRetry((value) => value + 1)}>Intentar nuevamente</Button></div></div> : !loading && (!result || result.groups.length === 0) ? <div className={styles.state}><div><span className={styles.stateIcon}><FileSearch aria-hidden="true" /></span><h3>No hay grupos de cuentas por cobrar</h3><p>Las deudas reconocidas aparecerán aquí después de la aceptación fiscal.</p></div></div> : <Table className={styles.groupTable}><TableHeader><TableRow><TableHead>Cliente / deudor</TableHead><TableHead>Moneda</TableHead><TableHead>CxC / Deuda</TableHead><TableHead>Fondos recibidos</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{loading ? Array.from({ length: 5 }, (_, row) => <TableRow key={row}>{Array.from({ length: 5 }, (_, cell) => <TableCell key={cell}><span className={styles.skeleton} /></TableCell>)}</TableRow>) : result?.groups.map((group) => <GroupRows key={group.groupKey} group={group} canWrite={canWrite} reloadToken={reloadToken} onOpenDetail={onOpenDetail} onRegisterPayment={onRegisterPayment} onViewPayments={onViewPayments} />)}</TableBody></Table>}
    {!loading && !error && result && result.totalPages > 1 && <nav className={styles.pagination}><p>Página {result.page} de {result.totalPages} · {summary}</p><div className={styles.paginationActions}><Button className={styles.secondaryAction} disabled={result.page <= 1} variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><Button className={styles.secondaryAction} disabled={result.page >= result.totalPages} variant="outline" onClick={() => setPage((value) => Math.min(result.totalPages, value + 1))}>Siguiente</Button></div></nav>}
  </section>;
}

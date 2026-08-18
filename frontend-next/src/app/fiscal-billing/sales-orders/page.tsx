'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ReceiptText } from 'lucide-react';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  FiscalBillingApiError,
  getEligibleSalesOrders,
  type EligibleSalesOrder,
  type EligibleSalesOrdersPage,
} from '@/lib/fiscal-billing-api';
import styles from '../fiscal-billing.module.css';

const PAGE_SIZE = 20;

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-CR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(value));
}

function formatDecimal(value: string) {
  const [whole = '0', fraction] = value.split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = sign ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}.${(fraction ?? '').padEnd(2, '0').slice(0, 2)}`;
}

function Action({ order }: { order: EligibleSalesOrder }) {
  if (order.action === 'START') {
    return (
      <Button asChild className={styles.primaryAction} size="sm">
        <Link href={`/fiscal-billing/sales-orders/${encodeURIComponent(order.id)}/preparation`}>
          Preparar documento
        </Link>
      </Button>
    );
  }
  return (
    <Button className={styles.disabledAction} disabled size="sm" variant="outline" type="button">
      {order.action === 'RESUME' ? 'Continuar borrador' : 'Ver documento'}
    </Button>
  );
}

export default function EligibleFiscalSalesOrdersPage() {
  const [result, setResult] = useState<EligibleSalesOrdersPage | null>(null);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FiscalBillingApiError | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    void reload;
    setLoading(true);
    setError(null);
    try {
      const response = await getEligibleSalesOrders(page, PAGE_SIZE, signal);
      setResult(response);
      if (response.totalPages > 0 && page > response.totalPages) setPage(response.totalPages);
    } catch (requestError) {
      if (signal.aborted) return;
      setError(requestError instanceof FiscalBillingApiError
        ? requestError
        : new FiscalBillingApiError('FISCAL_BILLING_REQUEST_FAILED', 'No se pudieron cargar las órdenes por facturar.'));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [page, reload]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const orders = result?.salesOrders ?? [];
  const summary = useMemo(() => {
    if (!result || result.total === 0) return '0 órdenes';
    const first = (result.page - 1) * result.pageSize + 1;
    const last = Math.min(result.page * result.pageSize, result.total);
    return `${first}–${last} de ${result.total} órdenes`;
  }, [result]);

  return (
    <main className="app-shell">
      <div className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Facturación fiscal</p>
          <h1 className={styles.title}>Órdenes por facturar</h1>
          <p className={styles.subtitle}>Órdenes de servicios adicionales elegibles para preparar un documento fiscal.</p>
        </header>

        <section className={styles.card}>
          <div className={styles.cardHeading}>
            <h2>Órdenes elegibles</h2>
            <span>{loading ? 'Cargando…' : summary}</span>
          </div>
          {loading ? (
            <div className={styles.state}><LoadingSpinner message="Cargando órdenes por facturar…" /></div>
          ) : error ? (
            <div className={styles.state}>
              <div>
                <AlertCircle aria-hidden="true" />
                <h3>No se pudieron cargar las órdenes</h3>
                <p>{error.message}</p>
                <p className={styles.errorCode}>Código: {error.code}</p>
                <Button type="button" variant="outline" onClick={() => setReload((value) => value + 1)}>Intentar nuevamente</Button>
              </div>
            </div>
          ) : orders.length === 0 ? (
            <div className={styles.state}>
              <div>
                <ReceiptText aria-hidden="true" />
                <h3>No hay órdenes por facturar</h3>
                <p>Las órdenes elegibles aparecerán aquí cuando estén listas para preparación fiscal.</p>
              </div>
            </div>
          ) : (
            <Table className={styles.table}>
              <TableHeader><TableRow>
                <TableHead>Número</TableHead><TableHead>Cliente</TableHead><TableHead>Fecha</TableHead>
                <TableHead>Moneda</TableHead><TableHead className={styles.numeric}>Total</TableHead>
                <TableHead>Estado</TableHead><TableHead>Acción fiscal</TableHead>
              </TableRow></TableHeader>
              <TableBody>{orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className={styles.number}>{order.orderNumber}</TableCell>
                  <TableCell><div className={styles.stack}><span>{order.customerName}</span>{order.customerEmail && <span className={styles.secondary}>{order.customerEmail}</span>}</div></TableCell>
                  <TableCell>{formatDate(order.createdAt)}</TableCell>
                  <TableCell>{order.currency}</TableCell>
                  <TableCell className={styles.numeric}>{order.currency} {formatDecimal(order.total)}</TableCell>
                  <TableCell><Badge className={styles.readyBadge} variant="outline">{order.status}</Badge></TableCell>
                  <TableCell><Action order={order} /></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
          {!loading && !error && result && result.totalPages > 1 && (
            <nav className={styles.pagination} aria-label="Paginación de órdenes por facturar">
              <p>Página {result.page} de {result.totalPages} · {summary}</p>
              <div className={styles.paginationActions}>
                <Button disabled={result.page <= 1} variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button>
                <Button disabled={result.page >= result.totalPages} variant="outline" onClick={() => setPage((value) => Math.min(result.totalPages, value + 1))}>Siguiente</Button>
              </div>
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}

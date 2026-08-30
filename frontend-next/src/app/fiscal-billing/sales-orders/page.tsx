'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, LoaderCircle, ReceiptText } from 'lucide-react';
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
const POLL_INTERVAL_MS = 5_000;

type FiscalPresentation = {
  kind: 'NOT_STARTED' | 'DRAFT' | 'PROCESSING' | 'ACCEPTED' | 'REJECTED' | 'FAILED';
  label: string;
  actionLabel: string | null;
};

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

function fiscalPresentation(order: EligibleSalesOrder): FiscalPresentation {
  const status = order.fiscalStatus;
  if (!status) return { kind: 'NOT_STARTED', label: 'Sin facturar', actionLabel: 'Facturar' };
  if (status.taxAuthorityStatus === 'ACCEPTED') return { kind: 'ACCEPTED', label: 'Aceptada', actionLabel: 'Ver factura' };
  if (status.taxAuthorityStatus === 'REJECTED') return { kind: 'REJECTED', label: 'Rechazada', actionLabel: 'Revisar' };
  if (status.providerStatus === 'FAILED') return { kind: 'FAILED', label: 'Error', actionLabel: 'Revisar' };
  if (status.lifecycleStatus === 'DRAFT') return { kind: 'DRAFT', label: 'Pendiente', actionLabel: 'Continuar' };
  return { kind: 'PROCESSING', label: 'Procesando…', actionLabel: null };
}

function statusClass(kind: FiscalPresentation['kind']) {
  if (kind === 'ACCEPTED') return styles.readyBadge;
  if (kind === 'REJECTED' || kind === 'FAILED') return styles.errorBadge;
  if (kind === 'PROCESSING') return styles.warningBadge;
  return styles.documentTypeBadge;
}

function Action({ order }: { order: EligibleSalesOrder }) {
  const presentation = fiscalPresentation(order);
  if (presentation.kind === 'NOT_STARTED' && order.action === 'START') {
    return (
      <Button asChild className={styles.primaryAction} size="sm">
        <Link href={`/fiscal-billing/sales-orders/${encodeURIComponent(order.id)}/preparation`}>
          Facturar
        </Link>
      </Button>
    );
  }
  if (presentation.kind === 'PROCESSING') {
    return <Button className={styles.primaryAction} disabled size="sm" type="button"><LoaderCircle className={styles.spin} aria-hidden="true" />Procesando…</Button>;
  }
  if (order.existingPrimaryDocument && presentation.actionLabel) {
    return <Button asChild className={styles.primaryAction} size="sm"><Link href={`/fiscal-billing/documents/${encodeURIComponent(order.existingPrimaryDocument.id)}`}>{presentation.actionLabel}</Link></Button>;
  }
  return (
    <Button className={styles.primaryAction} disabled size="sm" type="button">
      {presentation.actionLabel ?? presentation.label}
    </Button>
  );
}

export default function EligibleFiscalSalesOrdersPage() {
  const [result, setResult] = useState<EligibleSalesOrdersPage | null>(null);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FiscalBillingApiError | null>(null);

  const load = useCallback(async (signal: AbortSignal, background = false) => {
    void reload;
    if (!background) {
      setLoading(true);
      setError(null);
    }
    try {
      const response = await getEligibleSalesOrders(page, PAGE_SIZE, signal);
      setResult(response);
      if (response.totalPages > 0 && page > response.totalPages) setPage(response.totalPages);
    } catch (requestError) {
      if (signal.aborted || background) return;
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
  const hasProcessing = orders.some((order) => fiscalPresentation(order).kind === 'PROCESSING');
  useEffect(() => {
    if (!hasProcessing) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    const poll = async () => {
      controller = new AbortController();
      await load(controller.signal, true);
      if (!stopped) timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };
    timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
  }, [hasProcessing, load]);
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
                  <TableCell>{(() => { const presentation = fiscalPresentation(order); return <Badge className={statusClass(presentation.kind)} variant="outline">{presentation.kind === 'PROCESSING' && <LoaderCircle className={styles.spin} aria-hidden="true" />}{presentation.label}</Badge>; })()}</TableCell>
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

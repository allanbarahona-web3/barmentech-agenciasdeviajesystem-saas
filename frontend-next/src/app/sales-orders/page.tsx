'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Eye, FileSearch, ReceiptText, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getSalesOrders,
  type SalesOrderCurrency,
  type SalesOrderListItem,
  type SalesOrderPaymentCondition,
  type SalesOrderPaymentTermUnit,
  type SalesOrderStatus,
  type SalesOrdersPage,
} from '@/lib/sales-orders-api';
import styles from './sales-orders-dashboard.module.css';

const PAGE_SIZE = 20;

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-CR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatAmount(value: string, currency: SalesOrderCurrency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} ${value}`;
  return new Intl.NumberFormat('es-CR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function paymentTermUnitLabel(
  unit: SalesOrderPaymentTermUnit,
  value: number,
) {
  if (unit === 'DAYS') return value === 1 ? 'día' : 'días';
  return value === 1 ? 'mes' : 'meses';
}

function paymentConditionLabel(order: SalesOrderListItem) {
  if (order.paymentConditionType === 'CASH') return 'Contado';
  if (order.paymentConditionType === 'CREDIT') {
    if (order.paymentTermValue && order.paymentTermUnit) {
      return `Crédito · ${order.paymentTermValue} ${paymentTermUnitLabel(
        order.paymentTermUnit,
        order.paymentTermValue,
      )}`;
    }
    return 'Crédito';
  }
  return 'No especificada';
}

function LoadingRows() {
  return Array.from({ length: 6 }, (_, rowIndex) => (
    <TableRow key={rowIndex}>
      {Array.from({ length: 9 }, (_, cellIndex) => (
        <TableCell key={cellIndex}>
          <span
            className={styles.skeleton}
            style={{ width: cellIndex === 1 ? '130px' : '82px' }}
          />
        </TableCell>
      ))}
    </TableRow>
  ));
}

export default function SalesOrdersDashboardPage() {
  const [response, setResponse] = useState<SalesOrdersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SalesOrderStatus | ''>('');
  const [currency, setCurrency] = useState<SalesOrderCurrency | ''>('');
  const [paymentCondition, setPaymentCondition] = useState<
    SalesOrderPaymentCondition | ''
  >('');

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const loadOrders = useCallback(
    async (signal: AbortSignal) => {
      void reloadToken;
      setLoading(true);
      setError(false);
      try {
        const result = await getSalesOrders(
          {
            page,
            pageSize: PAGE_SIZE,
            search: search || undefined,
            status: status || undefined,
            currency: currency || undefined,
            paymentConditionType: paymentCondition || undefined,
          },
          signal,
        );
        setResponse(result);
        if (result.totalPages > 0 && page > result.totalPages) {
          setPage(result.totalPages);
        }
      } catch {
        if (!signal.aborted) setError(true);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }, [currency, page, paymentCondition, reloadToken, search, status]);

  useEffect(() => {
    const controller = new AbortController();
    void loadOrders(controller.signal);
    return () => controller.abort();
  }, [loadOrders]);

  const orders = response?.salesOrders ?? [];
  const hasActiveFilters = Boolean(
    search || status || currency || paymentCondition,
  );
  const pageSummary = useMemo(() => {
    if (!response || response.total === 0) return '0 órdenes';
    const first = (response.page - 1) * response.pageSize + 1;
    const last = Math.min(response.page * response.pageSize, response.total);
    return `${first}–${last} de ${response.total} órdenes`;
  }, [response]);

  function clearFilters() {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setCurrency('');
    setPaymentCondition('');
    setPage(1);
  }

  return (
    <main className="app-shell">
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Espacio comercial</p>
            <h1 className={styles.title}>Órdenes de Venta</h1>
            <p className={styles.subtitle}>
              Ventas confirmadas y generadas a partir de procesos comerciales
              aprobados.
            </p>
          </div>
        </header>

        <section className={styles.filters} aria-label="Filtros de órdenes de venta">
          <div className={styles.field}>
            <label htmlFor="sales-orders-search">Buscar</label>
            <div className={styles.searchControl}>
              <Search aria-hidden="true" />
              <input
                id="sales-orders-search"
                className={`${styles.input} ${styles.searchInput}`}
                type="search"
                value={searchInput}
                placeholder="Buscar por número, cliente o correo..."
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="sales-order-status">Estado</label>
            <select
              id="sales-order-status"
              className={styles.select}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as SalesOrderStatus | '');
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="CREATED">Creada</option>
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="sales-order-currency">Moneda</label>
            <select
              id="sales-order-currency"
              className={styles.select}
              value={currency}
              onChange={(event) => {
                setCurrency(event.target.value as SalesOrderCurrency | '');
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              <option value="USD">USD</option>
              <option value="CRC">CRC</option>
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="sales-order-payment">Condición de pago</label>
            <select
              id="sales-order-payment"
              className={styles.select}
              value={paymentCondition}
              onChange={(event) => {
                setPaymentCondition(
                  event.target.value as SalesOrderPaymentCondition | '',
                );
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              <option value="CASH">Contado</option>
              <option value="CREDIT">Crédito</option>
            </select>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHeading}>
            <h2>Órdenes de Venta</h2>
            <span>{loading ? 'Cargando…' : pageSummary}</span>
          </div>

          {error ? (
            <div className={styles.state}>
              <div>
                <span className={styles.stateIcon}>
                  <AlertCircle aria-hidden="true" />
                </span>
                <h3 className={styles.error}>No se pudieron cargar las órdenes</h3>
                <p>Intente nuevamente en unos momentos.</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReloadToken((value) => value + 1)}
                >
                  Intentar nuevamente
                </Button>
              </div>
            </div>
          ) : !loading && orders.length === 0 ? (
            <div className={styles.state}>
              <div>
                <span className={styles.stateIcon}>
                  {hasActiveFilters ? (
                    <FileSearch aria-hidden="true" />
                  ) : (
                    <ReceiptText aria-hidden="true" />
                  )}
                </span>
                <h3>
                  {hasActiveFilters
                    ? 'No se encontraron órdenes'
                    : 'No hay órdenes de venta'}
                </h3>
                <p>
                  {hasActiveFilters
                    ? 'Pruebe con otros criterios de búsqueda o limpie los filtros.'
                    : 'Las órdenes aparecerán aquí cuando una venta aprobada sea convertida en Orden de Venta.'}
                </p>
                {hasActiveFilters && (
                  <Button type="button" variant="outline" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <Table className={styles.table}>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className={styles.numeric}>Total</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead>Condición de pago</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado por</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <LoadingRows />
                ) : (
                  orders.map((order) => {
                    const orderHref = `/sales-orders/${encodeURIComponent(order.id)}`;
                    return (
                      <TableRow key={order.id}>
                        <TableCell className={styles.orderNumber}>
                          {order.orderNumber}
                        </TableCell>
                        <TableCell>
                          <div>{order.customerName}</div>
                          {order.customerEmail && (
                            <span className={styles.secondaryText}>
                              {order.customerEmail}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(order.createdAt)}</TableCell>
                        <TableCell className={`${styles.numeric} font-semibold`}>
                          {formatAmount(order.total, order.currency)}
                        </TableCell>
                        <TableCell>{order.currency}</TableCell>
                        <TableCell>{paymentConditionLabel(order)}</TableCell>
                        <TableCell className={styles.status}>
                          <Badge variant="outline" className={styles.createdBadge}>
                            Creada
                          </Badge>
                        </TableCell>
                        <TableCell>{order.createdByName}</TableCell>
                        <TableCell>
                          <Button asChild size="sm" className={styles.actionButton}>
                            <Link href={orderHref}>
                              <Eye aria-hidden="true" className="mr-2 h-4 w-4" />
                              Ver orden
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}

          {!error && !loading && response && response.totalPages > 1 && (
            <nav className={styles.pagination} aria-label="Paginación de órdenes de venta">
              <p>
                Página {response.page} de {response.totalPages} · {pageSummary}
              </p>
              <div className={styles.paginationActions}>
                <Button
                  type="button"
                  variant="outline"
                  disabled={response.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={response.page >= response.totalPages}
                  onClick={() =>
                    setPage((current) =>
                      Math.min(response.totalPages, current + 1),
                    )
                  }
                >
                  Siguiente
                </Button>
              </div>
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}

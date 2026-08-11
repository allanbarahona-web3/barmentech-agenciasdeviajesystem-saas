'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Eye,
  FileSearch,
  PackageOpen,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
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
  getAdditionalServiceOrders,
  type AdditionalServiceOrderDashboardItem,
  type AdditionalServiceOrdersDashboardResponse,
  type AdditionalServiceOrderStatus,
  type AdditionalServiceOrderTravelType,
  type CommercialProposalStatus,
} from '@/lib/additional-services-orders-api';
import styles from './orders-dashboard.module.css';
import { commercialProposalStatusLabel } from '@/shared/commercial-proposal-status';

const PAGE_SIZE = 20;

type DatePreset = 'ALL' | 'LAST_7' | 'LAST_15' | 'LAST_30' | 'CUSTOM';

const STATUS_OPTIONS: Array<{
  value: AdditionalServiceOrderStatus;
  label: string;
}> = [
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'REQUESTED', label: 'Solicitada' },
  { value: 'CONFIRMED', label: 'Confirmada' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

const TRAVEL_TYPE_LABELS: Record<AdditionalServiceOrderTravelType, string> = {
  INTERNATIONAL: 'Internacional',
  INTERNAL: 'Interno',
};

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function presetRange(preset: DatePreset) {
  if (preset === 'ALL' || preset === 'CUSTOM') {
    return { createdFrom: '', createdTo: '' };
  }

  const days = preset === 'LAST_7' ? 7 : preset === 'LAST_15' ? 15 : 30;
  const createdTo = new Date();
  const createdFrom = new Date();
  createdFrom.setDate(createdFrom.getDate() - (days - 1));

  return {
    createdFrom: toDateInputValue(createdFrom),
    createdTo: toDateInputValue(createdTo),
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-CR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatAmount(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('es-CR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    : value;
}

function commercialStatusBadgeClass(status: CommercialProposalStatus | null) {
  if (status === 'APPROVED') return styles.commercialApproved;
  if (status === 'SENT') return styles.commercialSent;
  if (status === 'PDF_GENERATED') return styles.commercialGenerated;
  if (status === 'REJECTED' || status === 'EXPIRED') {
    return styles.commercialClosed;
  }
  return styles.statusDraft;
}

function LoadingRows() {
  return Array.from({ length: 6 }, (_, rowIndex) => (
    <TableRow key={rowIndex}>
      {Array.from({ length: 10 }, (_, cellIndex) => (
        <TableCell key={cellIndex}>
          <span
            className={styles.skeleton}
            style={{ width: cellIndex === 2 ? '130px' : '82px' }}
          />
        </TableCell>
      ))}
    </TableRow>
  ));
}

export default function AdditionalServiceOrdersDashboardPage() {
  const router = useRouter();
  const [response, setResponse] =
    useState<AdditionalServiceOrdersDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [travelType, setTravelType] = useState<
    AdditionalServiceOrderTravelType | ''
  >('');
  const [travelNumberInput, setTravelNumberInput] = useState('');
  const [travelNumber, setTravelNumber] = useState('');
  const [status, setStatus] = useState<AdditionalServiceOrderStatus | ''>('');
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setTravelNumber(travelNumberInput.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [searchInput, travelNumberInput]);

  const loadOrders = useCallback(
    async (signal: AbortSignal) => {
      void reloadToken;
      setLoading(true);
      setError(null);

      try {
        const result = await getAdditionalServiceOrders(
          {
            page,
            pageSize: PAGE_SIZE,
            search: search || undefined,
            travelNumber: travelNumber.trim() || undefined,
            travelType: travelType || undefined,
            status: status || undefined,
            createdFrom: createdFrom || undefined,
            createdTo: createdTo || undefined,
          },
          signal,
        );
        setResponse(result);

        if (result.totalPages > 0 && page > result.totalPages) {
          setPage(result.totalPages);
        }
      } catch (loadError) {
        if (signal.aborted) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No fue posible cargar las órdenes.',
        );
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [
      createdFrom,
      createdTo,
      page,
      reloadToken,
      search,
      status,
      travelType,
      travelNumber,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadOrders(controller.signal);
    return () => controller.abort();
  }, [loadOrders]);

  const hasActiveFilters = Boolean(
    search || travelNumber || travelType || status || createdFrom || createdTo,
  );

  const pageSummary = useMemo(() => {
    if (!response || response.total === 0) {
      return '0 órdenes';
    }
    const first = (response.page - 1) * response.pageSize + 1;
    const last = Math.min(response.page * response.pageSize, response.total);
    return `${first}–${last} de ${response.total} órdenes`;
  }, [response]);

  function changeDatePreset(value: DatePreset) {
    setDatePreset(value);
    setPage(1);
    if (value !== 'CUSTOM') {
      const range = presetRange(value);
      setCreatedFrom(range.createdFrom);
      setCreatedTo(range.createdTo);
    }
  }

  function clearFilters() {
    setSearchInput('');
    setSearch('');
    setTravelType('');
    setTravelNumberInput('');
    setTravelNumber('');
    setStatus('');
    setDatePreset('ALL');
    setCreatedFrom('');
    setCreatedTo('');
    setPage(1);
  }

  const orders: AdditionalServiceOrderDashboardItem[] = response?.orders ?? [];

  return (
    <main className="app-shell">
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Espacio comercial</p>
            <h1 className={styles.title}>
              Órdenes de servicios adicionales
            </h1>
            <p className={styles.subtitle}>
              Consulte y dé seguimiento a las órdenes de servicios adicionales.
            </p>
          </div>
          <Button asChild>
            <Link href="/additional-services">
              <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
              Crear orden
            </Link>
          </Button>
        </header>

        <section className={styles.filters} aria-label="Filtros de órdenes">
          <div className={styles.field}>
            <label htmlFor="orders-search">Buscar</label>
            <div className={styles.searchControl}>
              <Search aria-hidden="true" />
              <input
                id="orders-search"
                className={`${styles.input} ${styles.searchInput}`}
                type="search"
                value={searchInput}
                placeholder="Buscar por cliente, identificación o número de orden"
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="travel-filter">Viaje</label>
            <input
              id="travel-filter"
              className={styles.input}
              type="search"
              value={travelNumberInput}
              placeholder="Número de viaje o contrato"
              onChange={(event) => {
                setTravelNumberInput(event.target.value);
              }}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="travel-type-filter">Tipo de viaje</label>
            <select
              id="travel-type-filter"
              className={styles.select}
              value={travelType}
              onChange={(event) => {
                setTravelType(
                  event.target.value as AdditionalServiceOrderTravelType | '',
                );
                setPage(1);
              }}
            >
              <option value="">Todos los viajes</option>
              <option value="INTERNATIONAL">Internacionales</option>
              <option value="INTERNAL">Internos</option>
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="status-filter">Estado operativo</label>
            <select
              id="status-filter"
              className={styles.select}
              value={status}
              onChange={(event) => {
                setStatus(
                  event.target.value as AdditionalServiceOrderStatus | '',
                );
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="date-filter">Fecha</label>
            <select
              id="date-filter"
              className={styles.select}
              value={datePreset}
              onChange={(event) =>
                changeDatePreset(event.target.value as DatePreset)
              }
            >
              <option value="ALL">Todas las fechas</option>
              <option value="LAST_7">Últimos 7 días</option>
              <option value="LAST_15">Últimos 15 días</option>
              <option value="LAST_30">Últimos 30 días</option>
              <option value="CUSTOM">Rango personalizado</option>
            </select>
          </div>

          {datePreset === 'CUSTOM' && (
            <div className={styles.customDates}>
              <div className={styles.field}>
                <label htmlFor="created-from">Desde</label>
                <input
                  id="created-from"
                  className={styles.input}
                  type="date"
                  value={createdFrom}
                  max={createdTo || undefined}
                  onChange={(event) => {
                    setCreatedFrom(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="created-to">Hasta</label>
                <input
                  id="created-to"
                  className={styles.input}
                  type="date"
                  value={createdTo}
                  min={createdFrom || undefined}
                  onChange={(event) => {
                    setCreatedTo(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
          )}
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHeading}>
            <h2>Órdenes</h2>
            <span>{loading ? 'Cargando…' : pageSummary}</span>
          </div>

          {error ? (
            <div className={styles.state}>
              <div>
                <span className={styles.stateIcon}>
                  <AlertCircle aria-hidden="true" />
                </span>
                <h3 className={styles.error}>No se pudieron cargar las órdenes</h3>
                <p>{error}</p>
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
                    <PackageOpen aria-hidden="true" />
                  )}
                </span>
                <h3>
                  {hasActiveFilters
                    ? 'No se encontraron órdenes'
                    : 'Todavía no hay órdenes'}
                </h3>
                <p>
                  {hasActiveFilters
                    ? 'Pruebe con otros criterios de búsqueda o limpie los filtros.'
                    : 'Cree la primera orden de servicios adicionales para comenzar.'}
                </p>
                {hasActiveFilters ? (
                  <Button type="button" variant="outline" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href="/additional-services">Crear primera orden</Link>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <Table className={styles.table}>
              <TableHeader>
                <TableRow>
                  <TableHead>Número de orden</TableHead>
                  <TableHead>Cliente de la cotización</TableHead>
                  <TableHead>Viaje</TableHead>
                  <TableHead>Tipo de viaje</TableHead>
                  <TableHead>Fecha de creación</TableHead>
                  <TableHead className={styles.numeric}>Total</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Orden de Venta</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <LoadingRows />
                ) : (
                  orders.map((order, index) => {
                    const orderHref = `/additional-services/orders/${encodeURIComponent(
                      order.id,
                    )}`;

                    return (
                    <TableRow
                      key={order.id}
                      className={styles.clickableRow}
                      onClick={() => router.push(orderHref)}
                    >
                      <TableCell>
                        <div className={styles.orderNumberCell}>
                          <span className={styles.orderNumber}>
                            {order.orderNumber}
                          </span>
                          {response?.page === 1 && index === 0 && (
                            <Badge
                              variant="outline"
                              className={styles.newOrderBadge}
                            >
                              <Sparkles aria-hidden="true" />
                              Nueva
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {order.customerName ?? (
                          <span className={styles.muted}>Sin asignar</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {order.travelName ?? (
                          <span className={styles.muted}>No disponible</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {TRAVEL_TYPE_LABELS[order.travelType]}
                      </TableCell>
                      <TableCell>{formatDate(order.createdAt)}</TableCell>
                      <TableCell
                        className={`${styles.numeric} font-semibold`}
                      >
                        {formatAmount(order.totalAmount)}
                      </TableCell>
                      <TableCell>{order.currency}</TableCell>
                      <TableCell className={styles.status}>
                        <Badge
                          variant="outline"
                          className={commercialStatusBadgeClass(
                            order.commercialStatus,
                          )}
                        >
                          {commercialProposalStatusLabel(
                            order.commercialStatus,
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {order.commercialStatus !== 'APPROVED' ? (
                          <span className={styles.muted}>—</span>
                        ) : order.salesOrder ? (
                          <Link
                            className={styles.salesOrderLink}
                            href={`/sales-orders/${encodeURIComponent(order.salesOrder.id)}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {order.salesOrder.orderNumber}
                          </Link>
                        ) : (
                          <Badge
                            variant="outline"
                            className={styles.pendingConversionBadge}
                          >
                            Pendiente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          asChild
                          size="sm"
                          className={styles.actionButton}
                        >
                          <Link
                            href={orderHref}
                            onClick={(event) => event.stopPropagation()}
                          >
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
            <nav className={styles.pagination} aria-label="Paginación de órdenes">
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

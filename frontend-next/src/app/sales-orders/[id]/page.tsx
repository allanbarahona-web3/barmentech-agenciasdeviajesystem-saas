'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CircleUserRound,
  ReceiptText,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getSalesOrder,
  SalesOrderNotFoundError,
  type SalesOrderCurrency,
  type SalesOrderDetail,
  type SalesOrderLine,
  type SalesOrderPaymentTermUnit,
} from '@/lib/sales-orders-api';
import { formatCommercialService } from '@/shared/additional-services';
import styles from './sales-order-workspace.module.css';

type ParticipantSnapshot = {
  fullName: string;
  role: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-CR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

function formatMoney(value: string, currency: SalesOrderCurrency) {
  const amount = Number(value);
  const formatted = Number.isFinite(amount)
    ? new Intl.NumberFormat('es-CR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    : value;
  return `${currency} ${formatted}`;
}

function paymentTermUnitLabel(
  unit: SalesOrderPaymentTermUnit,
  value: number,
) {
  if (unit === 'DAYS') return value === 1 ? 'día' : 'días';
  return value === 1 ? 'mes' : 'meses';
}

function paymentConditionLabel(order: SalesOrderDetail) {
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

function roleLabel(role: string | null) {
  if (role === 'HOLDER') return 'Titular';
  if (role === 'COMPANION') return 'Acompañante';
  if (role === 'MINOR') return 'Menor';
  return role ? 'Participante' : null;
}

function participantSnapshots(value: unknown): ParticipantSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const snapshot = item as Record<string, unknown>;
    if (typeof snapshot.fullName !== 'string' || !snapshot.fullName.trim()) {
      return [];
    }
    return [{
      fullName: snapshot.fullName.trim(),
      role: typeof snapshot.role === 'string' ? snapshot.role : null,
    }];
  });
}

function ServiceCard({
  line,
  currency,
}: {
  line: SalesOrderLine;
  currency: SalesOrderCurrency;
}) {
  const description = formatCommercialService({
    serviceCode: line.serviceCode,
    serviceDetailsVersion: line.serviceDetailsVersion,
    serviceDetails: line.serviceDetails,
  });
  const participants = participantSnapshots(line.participants);

  return (
    <article className={styles.serviceCard}>
      <div className={styles.serviceMain}>
        <div className={styles.serviceHeading}>
          <div>
            <h3>{line.serviceName}</h3>
            {line.serviceCode !== 'BAGGAGE' && <p>{description.summary}</p>}
          </div>
        </div>

        {description.attributes.length > 0 && (
          <dl className={styles.attributes}>
            {description.attributes.map((attribute) => (
              <div key={attribute.key}>
                <dt>{attribute.label}</dt>
                <dd>{attribute.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {participants.length > 0 && (
          <div className={styles.participants}>
            <div className={styles.inlineHeading}>
              <Users aria-hidden="true" />
              <span>Participantes</span>
            </div>
            <div className={styles.participantList}>
              {participants.map((participant, index) => (
                <span key={`${participant.fullName}-${index}`}>
                  {participant.fullName}
                  {roleLabel(participant.role) && (
                    <small>{roleLabel(participant.role)}</small>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {line.commercialNotes && (
          <div className={styles.notes}>
            <strong>Notas comerciales</strong>
            <p>{line.commercialNotes}</p>
          </div>
        )}
      </div>

      <dl className={styles.linePricing}>
        <div>
          <dt>Subtotal</dt>
          <dd>{formatMoney(line.subtotal, currency)}</dd>
        </div>
        <div>
          <dt>IVA {Number(line.vatPercentage).toLocaleString('es-CR')}%</dt>
          <dd>{formatMoney(line.vatAmount, currency)}</dd>
        </div>
        <div className={styles.lineTotal}>
          <dt>Total</dt>
          <dd>{formatMoney(line.total, currency)}</dd>
        </div>
      </dl>
    </article>
  );
}

export default function SalesOrderWorkspacePage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<SalesOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getSalesOrder(params.id, controller.signal)
      .then((persistedOrder) => {
        setOrder(persistedOrder);
        setError(false);
        setNotFound(false);
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        if (requestError instanceof SalesOrderNotFoundError) {
          setNotFound(true);
        } else {
          setError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [params.id]);

  if (loading) {
    return (
      <main className="app-shell">
        <div className={styles.state}>
          <span className={styles.loadingMark} aria-hidden="true" />
          <h1>Cargando orden de venta</h1>
          <p>Consultando el snapshot comercial persistido.</p>
        </div>
      </main>
    );
  }

  if (notFound || error || !order) {
    return (
      <main className="app-shell">
        <div className={styles.state}>
          <span className={styles.stateIcon}>
            <AlertCircle aria-hidden="true" />
          </span>
          <h1>{notFound ? 'Orden de venta no encontrada' : 'No se pudo cargar la orden'}</h1>
          <p>
            {notFound
              ? 'La orden solicitada no existe o no está disponible.'
              : 'Intente nuevamente en unos momentos.'}
          </p>
          <Button asChild variant="outline">
            <Link href="/sales-orders">Volver a Órdenes de Venta</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className={styles.page}>
        <Link className={styles.backLink} href="/sales-orders">
          <ArrowLeft aria-hidden="true" />
          Volver a Órdenes de Venta
        </Link>

        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>ORDEN DE VENTA</p>
            <h1>{order.orderNumber}</h1>
          </div>
          <div className={styles.headerMeta}>
            <Badge variant="outline" className={styles.createdBadge}>
              Creada
            </Badge>
            <span>
              <CalendarDays aria-hidden="true" />
              {formatDate(order.createdAt)}
            </span>
          </div>
        </header>

        <div className={styles.summaryGrid}>
          <section className={styles.infoCard} aria-labelledby="customer-title">
            <div className={styles.sectionTitle}>
              <CircleUserRound aria-hidden="true" />
              <h2 id="customer-title">Cliente</h2>
            </div>
            <dl className={styles.infoList}>
              <div>
                <dt>Nombre</dt>
                <dd>{order.customerName}</dd>
              </div>
              <div>
                <dt>Correo</dt>
                <dd>{order.customerEmail ?? 'No registrado'}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.infoCard} aria-labelledby="commercial-title">
            <div className={styles.sectionTitle}>
              <ReceiptText aria-hidden="true" />
              <h2 id="commercial-title">Información comercial</h2>
            </div>
            <dl className={styles.infoList}>
              <div>
                <dt>Moneda</dt>
                <dd className={styles.currency}>{order.currency}</dd>
              </div>
              <div>
                <dt>Condición de pago</dt>
                <dd>{paymentConditionLabel(order)}</dd>
              </div>
              <div>
                <dt>Creada por</dt>
                <dd>{order.createdByName}</dd>
              </div>
              <div>
                <dt>Fecha</dt>
                <dd>{formatDate(order.createdAt)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section className={styles.servicesSection} aria-labelledby="services-title">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="services-title">Servicios</h2>
              <p>
                {order.lines.length}{' '}
                {order.lines.length === 1 ? 'servicio' : 'servicios'}
              </p>
            </div>
          </div>
          <div className={styles.serviceList}>
            {order.lines.map((line) => (
              <ServiceCard key={line.id} line={line} currency={order.currency} />
            ))}
          </div>
        </section>

        <div className={styles.bottomGrid}>
          <div>
            {order.commercialObservations && (
              <section className={styles.observations}>
                <h2>Observaciones comerciales</h2>
                <p>{order.commercialObservations}</p>
              </section>
            )}
          </div>

          <section className={styles.totals} aria-labelledby="totals-title">
            <h2 id="totals-title">Resumen de la orden</h2>
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>{formatMoney(order.commercialSubtotal, order.currency)}</dd>
              </div>
              <div>
                <dt>IVA</dt>
                <dd>{formatMoney(order.totalVat, order.currency)}</dd>
              </div>
              <div className={styles.grandTotal}>
                <dt>TOTAL</dt>
                <dd>{formatMoney(order.total, order.currency)}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}

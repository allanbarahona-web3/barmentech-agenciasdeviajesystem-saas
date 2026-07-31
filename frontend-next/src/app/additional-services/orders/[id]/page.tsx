'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  CircleCheck,
  FileText,
  MapPin,
  ReceiptText,
  Users,
} from 'lucide-react';
import { LoadingModal } from '@/components/loading-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getAdditionalServiceOrder,
  type AdditionalServiceOrder,
  type AdditionalServiceOrderCurrency,
  type AdditionalServiceOrderParticipant,
  type AdditionalServiceOrderParticipantRole,
} from '@/lib/additional-services-orders-api';
import { formatCommercialService } from '@/shared/additional-services';
import styles from './quotation-preview.module.css';

function formatCurrency(
  value: string,
  currency: AdditionalServiceOrderCurrency,
) {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-CR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function roleLabel(role: AdditionalServiceOrderParticipantRole) {
  const labels: Record<AdditionalServiceOrderParticipantRole, string> = {
    HOLDER: 'Titular',
    COMPANION: 'Acompañante',
    MINOR: 'Menor',
  };
  return labels[role];
}

function travelTypeLabel(type: AdditionalServiceOrder['travelType']) {
  return type === 'INTERNATIONAL' ? 'Internacional' : 'Interno';
}

function participantKey(participant: AdditionalServiceOrderParticipant) {
  return (
    participant.clientId ??
    `${participant.fullName}:${participant.identification}`
  );
}

export default function AdditionalServiceOrderPreviewPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const orderId = params.id;
  const isCreationCompletion = searchParams.get('created') === 'true';
  const [order, setOrder] = useState<AdditionalServiceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void getAdditionalServiceOrder(orderId)
      .then((persistedOrder) => {
        if (!cancelled) {
          setOrder(persistedOrder);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No se pudo cargar la orden de servicios adicionales.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const participants = useMemo(() => {
    const persistedParticipants = new Map<
      string,
      AdditionalServiceOrderParticipant
    >();
    order?.lines.forEach((line) => {
      line.participants.forEach((participant) => {
        persistedParticipants.set(participantKey(participant), participant);
      });
    });
    return [...persistedParticipants.values()];
  }, [order]);

  if (loading) {
    return (
      <main className="app-shell">
        <LoadingModal
          isOpen
          state="loading"
          loadingMessage="Cargando cotización..."
        />
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="app-shell">
        <section className={styles.errorState} role="alert">
          <FileText aria-hidden="true" />
          <h1>No se pudo cargar la cotización</h1>
          <p>
            {error ??
              'La orden de servicios adicionales no está disponible.'}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className={styles.page}>
        {isCreationCompletion && (
          <section
            className={styles.successBanner}
            role="status"
            aria-labelledby="creation-success-title"
          >
            <CircleCheck aria-hidden="true" />
            <div className={styles.successBannerContent}>
              <h2 id="creation-success-title">
                Orden creada correctamente
              </h2>
              <p>
                La orden se guardó con éxito. Puede revisar su información
                antes de continuar.
              </p>
            </div>
            <div className={styles.successBannerActions}>
              <Button asChild type="button" className={styles.dashboardButton}>
                <Link href="/additional-services/orders">
                  <BarChart3 aria-hidden="true" />
                  Ir al panel de órdenes
                </Link>
              </Button>
            </div>
          </section>
        )}

        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>Cotización de servicios adicionales</p>
            <div className={styles.titleRow}>
              <h1>{order.orderNumber}</h1>
              <Badge variant="secondary">Borrador</Badge>
            </div>
            <p className={styles.subtitle}>
              Revisión comercial basada en la orden persistida.
            </p>
          </div>
          {!isCreationCompletion && (
            <div className={styles.actions} aria-label="Acciones futuras">
              <Button type="button" variant="outline" disabled>
                Editar
              </Button>
              <Button type="button" variant="outline" disabled>
                Generar PDF comercial
              </Button>
              <Button type="button" disabled>
                Enviar para aprobación
              </Button>
            </div>
          )}
        </header>

        <section className={styles.headerCard} aria-labelledby="order-data">
          <h2 id="order-data">Información de la orden</h2>
          <dl className={styles.headerGrid}>
            <div>
              <dt>Viaje</dt>
              <dd>{order.travel?.name ?? 'Viaje no disponible'}</dd>
              {order.travel?.destination && (
                <span>
                  <MapPin aria-hidden="true" />
                  {order.travel.destination}
                </span>
              )}
            </div>
            <div>
              <dt>Tipo de viaje</dt>
              <dd>{travelTypeLabel(order.travelType)}</dd>
            </div>
            <div>
              <dt>Fecha de creación</dt>
              <dd>{formatDate(order.createdAt)}</dd>
            </div>
            <div>
              <dt>Creado por</dt>
              <dd>{order.createdByName}</dd>
            </div>
            <div>
              <dt>Moneda de cotización</dt>
              <dd>{order.quotationCurrency}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>Borrador</dd>
            </div>
          </dl>
        </section>

        <section className={styles.section} aria-labelledby="participants">
          <div className={styles.sectionHeading}>
            <span className={styles.sectionIcon}>
              <Users aria-hidden="true" />
            </span>
            <div>
              <h2 id="participants">Participantes</h2>
              <p>{participants.length} participante(s) en la orden</p>
            </div>
          </div>
          <div className={styles.participantGrid}>
            {participants.map((participant) => (
              <article
                className={styles.participantCard}
                key={participantKey(participant)}
              >
                <div>
                  <h3>{participant.fullName}</h3>
                  <Badge variant="outline">{roleLabel(participant.role)}</Badge>
                </div>
                {participant.identification && (
                  <p>Identificación: {participant.identification}</p>
                )}
              </article>
            ))}
          </div>
        </section>

        <div className={styles.commercialLayout}>
          <section className={styles.section} aria-labelledby="services">
            <div className={styles.sectionHeading}>
              <span className={styles.sectionIcon}>
                <ReceiptText aria-hidden="true" />
              </span>
              <div>
                <h2 id="services">Servicios</h2>
                <p>Detalle comercial persistido</p>
              </div>
            </div>
            <div className={styles.tableWrapper}>
              <table className={styles.servicesTable}>
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th>Proveedor</th>
                    <th>Participantes asignados</th>
                    <th>Costo proveedor</th>
                    <th>Margen</th>
                    <th>IVA</th>
                    <th>Precio final</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => {
                    const commercialDescription = formatCommercialService({
                      serviceCode: line.serviceCode,
                      serviceDetailsVersion: line.serviceDetailsVersion,
                      serviceDetails: line.serviceDetails,
                    });

                    return (
                      <tr key={line.id}>
                        <td className={styles.serviceDescription}>
                          <strong>{commercialDescription.serviceLabel}</strong>
                          <span>{commercialDescription.summary}</span>
                          {commercialDescription.attributes.length > 0 && (
                            <span className={styles.serviceAttributes}>
                              {commercialDescription.attributes
                                .map(
                                  ({ label, value }) => `${label}: ${value}`,
                                )
                                .join(' · ')}
                            </span>
                          )}
                        </td>
                        <td>{line.supplierName}</td>
                        <td>
                          {line.participants
                            .map((participant) => participant.fullName)
                            .join(', ')}
                        </td>
                        <td>
                          {formatCurrency(
                            line.supplierCost,
                            line.supplierCostCurrency,
                          )}
                        </td>
                        <td>
                          {formatCurrency(
                            line.marginAmount,
                            line.quotationCurrency,
                          )}
                        </td>
                        <td>
                          {formatCurrency(
                            line.vatAmount,
                            line.quotationCurrency,
                          )}
                        </td>
                        <td className={styles.finalPrice}>
                          {formatCurrency(
                            line.finalSellingPrice,
                            line.quotationCurrency,
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <aside className={styles.summaryCard}>
            <div className={styles.summaryHeading}>
              <CalendarDays aria-hidden="true" />
              <h2>Resumen comercial</h2>
            </div>
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>
                  {formatCurrency(
                    order.commercialSubtotal,
                    order.quotationCurrency,
                  )}
                </dd>
              </div>
              <div>
                <dt>IVA</dt>
                <dd>
                  {formatCurrency(order.totalVat, order.quotationCurrency)}
                </dd>
              </div>
              <div className={styles.grandTotal}>
                <dt>Total general</dt>
                <dd>
                  {formatCurrency(
                    order.totalSellingPrice,
                    order.quotationCurrency,
                  )}
                </dd>
              </div>
              <div className={styles.currencyRow}>
                <dt>Moneda</dt>
                <dd>{order.quotationCurrency}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    </main>
  );
}

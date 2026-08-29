'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  CircleCheck,
  FileText,
  ExternalLink,
  LoaderCircle,
  Mail,
  MapPin,
  ReceiptText,
  Users,
} from 'lucide-react';
import { LoadingModal } from '@/components/loading-modal';
import { ConfirmModal } from '@/components/confirm-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getAdditionalServiceOrder,
  getCommercialProposalPreview,
  generateCommercialProposal,
  approveCommercialProposalInPerson,
  sendCommercialProposal,
  type AdditionalServiceOrder,
  type AdditionalServiceOrderCurrency,
  type AdditionalServicePaymentConditionType,
  type AdditionalServicePaymentTermUnit,
  type AdditionalServiceOrderParticipant,
  type AdditionalServiceOrderParticipantRole,
  type CommercialProposalPreview,
} from '@/lib/additional-services-orders-api';
import { formatCommercialService } from '@/shared/additional-services';
import styles from './quotation-preview.module.css';
import { commercialProposalStatusLabel } from '@/shared/commercial-proposal-status';

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

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat('es-CR', {
    dateStyle: 'medium',
    timeZone: 'America/Costa_Rica',
  }).format(new Date(value));
}

function paymentConditionLabel(
  condition: AdditionalServicePaymentConditionType | null,
) {
  if (!condition) {
    return 'No especificada';
  }

  const labels: Record<AdditionalServicePaymentConditionType, string> = {
    CASH: 'Contado',
    CREDIT: 'Crédito',
  };
  return labels[condition];
}

function paymentTermLabel(
  value: number | null,
  unit: AdditionalServicePaymentTermUnit | null,
) {
  if (value === null || unit === null) {
    return 'No especificado';
  }

  if (unit === 'MONTHS') {
    return `${value} ${value === 1 ? 'mes' : 'meses'}`;
  }

  return `${value} ${value === 1 ? 'día' : 'días'}`;
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

function commercialStatusLabel(
  status: AdditionalServiceOrder['commercialStatus'],
) {
  return commercialProposalStatusLabel(status);
}

function commercialStatusBadgeClass(
  status: AdditionalServiceOrder['commercialStatus'],
) {
  if (status === 'APPROVED') return styles.commercialStatusApproved;
  if (status === 'SENT') return styles.commercialStatusSent;
  if (status === 'PDF_GENERATED') return styles.commercialStatusGenerated;
  if (status === 'REJECTED' || status === 'EXPIRED') {
    return styles.commercialStatusClosed;
  }
  return styles.commercialStatusDraft;
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
  const [proposal, setProposal] = useState<CommercialProposalPreview | null>(
    null,
  );
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [sendingProposal, setSendingProposal] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [ccEmail, setCcEmail] = useState('');
  const [sendModalError, setSendModalError] = useState<string | null>(null);
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvingInPerson, setApprovingInPerson] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;

    void getCommercialProposalPreview(orderId)
      .then((persistedProposal) => {
        if (!cancelled) {
          setProposal(persistedProposal);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProposalError("No se pudo consultar el PDF comercial.");
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

  function openSendModal() {
    setCcEmail('');
    setSendModalError(null);
    setSendModalOpen(true);
  }

  async function handleSendProposal() {
    if (!order || sendingProposal) return;
    const primaryEmail = order.quoteCustomer?.email?.trim();
    if (!primaryEmail) {
      setSendModalError(
        'El cliente de la cotización no tiene un correo electrónico registrado.',
      );
      return;
    }
    const normalizedCc = ccEmail.trim();
    if (normalizedCc && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedCc)) {
      setSendModalError('Ingrese un correo CC válido.');
      return;
    }
    setSendingProposal(true);
    setSendModalError(null);
    setDeliveryMessage(null);
    try {
      const delivery = await sendCommercialProposal(order.id, {
        ...(normalizedCc ? { cc: normalizedCc } : {}),
      });
      const persistedOrder = await getAdditionalServiceOrder(order.id);
      setOrder(persistedOrder);
      setSendModalOpen(false);
      setDeliveryMessage(`Propuesta enviada a ${delivery.recipientEmail}.`);
    } catch (requestError) {
      setSendModalError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo enviar la propuesta comercial.',
      );
    } finally {
      setSendingProposal(false);
    }
  }

  async function handleGenerateProposal() {
    if (!order || generatingProposal) return;
    setGeneratingProposal(true);
    setProposalError(null);
    setDeliveryMessage(null);
    try {
      await generateCommercialProposal(order.id);
      const [persistedOrder, persistedProposal] = await Promise.all([
        getAdditionalServiceOrder(order.id),
        getCommercialProposalPreview(order.id),
      ]);
      setOrder(persistedOrder);
      setProposal(persistedProposal);
      setDeliveryMessage('PDF comercial generado correctamente.');
    } catch (requestError) {
      setProposalError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo generar el PDF comercial.',
      );
    } finally {
      setGeneratingProposal(false);
    }
  }

  async function handleApproveInPerson() {
    if (!order || approvingInPerson) return;
    setApprovingInPerson(true);
    setApprovalError(null);
    try {
      await approveCommercialProposalInPerson(order.id);
      const persistedOrder = await getAdditionalServiceOrder(order.id);
      setOrder(persistedOrder);
      setApprovalModalOpen(false);
      setDeliveryMessage(
        persistedOrder.salesOrder
          ? `Aprobación registrada. Orden de Venta: ${persistedOrder.salesOrder.orderNumber}.`
          : 'Aprobación registrada correctamente.',
      );
    } catch (requestError) {
      setApprovalError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo registrar la aprobación presencial.',
      );
    } finally {
      setApprovingInPerson(false);
    }
  }

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
              <Badge
                variant="outline"
                className={commercialStatusBadgeClass(order.commercialStatus)}
              >
                Estado: {commercialStatusLabel(order.commercialStatus)}
              </Badge>
            </div>
            <p className={styles.subtitle}>
              Revisión comercial basada en la orden persistida.
            </p>
          </div>
          <div className={styles.actions} aria-label="Acciones de la orden">
            {order.commercialStatus === 'DRAFT' && (
              <Button
                type="button"
                className={styles.primaryActionButton}
                onClick={handleGenerateProposal}
                disabled={generatingProposal}
              >
                {generatingProposal ? (
                  <LoaderCircle className={styles.spin} aria-hidden="true" />
                ) : (
                  <FileText aria-hidden="true" />
                )}
                {generatingProposal
                  ? 'Generando...'
                  : 'Generar PDF comercial'}
              </Button>
            )}
            {proposal && (
              <Button
                asChild
                type="button"
                className={styles.primaryActionButton}
              >
                <a href={proposal.url} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" />
                  Ver PDF
                </a>
              </Button>
            )}
            {proposal && order.commercialStatus === 'PDF_GENERATED' && (
              <Button
                type="button"
                className={styles.primaryActionButton}
                onClick={openSendModal}
                disabled={sendingProposal}
              >
                {sendingProposal ? (
                  <LoaderCircle className={styles.spin} aria-hidden="true" />
                ) : (
                  <Mail aria-hidden="true" />
                )}
                {sendingProposal ? 'Enviando...' : 'Enviar propuesta'}
              </Button>
            )}
            {(order.commercialStatus === 'PDF_GENERATED' ||
              order.commercialStatus === 'SENT') && (
              <Button
                type="button"
                className={styles.inPersonApprovalButton}
                onClick={() => {
                  setApprovalError(null);
                  setApprovalModalOpen(true);
                }}
              >
                <CircleCheck aria-hidden="true" />
                Registrar aprobación presencial
              </Button>
            )}
          </div>
        </header>

        {proposalError && (
          <p className={styles.proposalError} role="status">
            {proposalError}
          </p>
        )}
        {deliveryMessage && (
          <p className={styles.deliveryMessage} role="status">
            {deliveryMessage}
          </p>
        )}
        {order.salesOrder && (
          <p className={styles.deliveryMessage} role="status">
            Orden de Venta:{' '}
            <strong>{order.salesOrder.orderNumber}</strong>.
          </p>
        )}

        <ConfirmModal
          isOpen={sendModalOpen}
          title="Enviar propuesta"
          confirmText={sendingProposal ? 'Enviando...' : 'Enviar propuesta'}
          cancelText="Cancelar"
          isLoading={sendingProposal}
          confirmDisabled={!order.quoteCustomer?.email}
          onCancel={() => {
            setSendModalOpen(false);
            setSendModalError(null);
          }}
          onConfirm={() => void handleSendProposal()}
          message={
            <div className={styles.sendForm}>
              <div className={styles.sendField}>
                <span>Para</span>
                <div className={styles.readOnlyEmail}>
                  {order.quoteCustomer?.email ?? 'Correo no registrado'}
                </div>
                {!order.quoteCustomer?.email && (
                  <p className={styles.sendError}>
                    El cliente debe tener un correo electrónico registrado para enviar la propuesta.
                  </p>
                )}
              </div>
              <label className={styles.sendField} htmlFor="proposal-cc-email">
                <span>CC (opcional)</span>
                <input
                  id="proposal-cc-email"
                  type="email"
                  value={ccEmail}
                  placeholder="copia@email.com"
                  autoComplete="email"
                  disabled={sendingProposal}
                  onChange={(event) => {
                    setCcEmail(event.target.value);
                    setSendModalError(null);
                  }}
                />
              </label>
              {sendModalError && (
                <p className={styles.sendError} role="alert">
                  {sendModalError}
                </p>
              )}
            </div>
          }
        />

        <ConfirmModal
          isOpen={approvalModalOpen}
          title="Registrar aprobación presencial"
          confirmText={
            approvingInPerson ? 'Registrando...' : 'Confirmar aprobación'
          }
          cancelText="Cancelar"
          isLoading={approvingInPerson}
          onCancel={() => {
            setApprovalModalOpen(false);
            setApprovalError(null);
          }}
          onConfirm={() => void handleApproveInPerson()}
          message={
            <div className={styles.approvalConfirmation}>
              <p>
                Confirme que el cliente revisó y aceptó esta cotización
                presencialmente.
              </p>
              <dl>
                <div>
                  <dt>Cotización</dt>
                  <dd>{order.orderNumber}</dd>
                </div>
                <div>
                  <dt>Cliente</dt>
                  <dd>{order.quoteCustomer?.fullName ?? 'No disponible'}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>
                    {formatCurrency(
                      order.totalSellingPrice,
                      order.quotationCurrency,
                    )}
                  </dd>
                </div>
              </dl>
              <p>Esta acción registrará la aprobación de la cotización.</p>
              {approvalError && (
                <p className={styles.sendError} role="alert">
                  {approvalError}
                </p>
              )}
            </div>
          }
        />

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
              <dd>{commercialStatusLabel(order.commercialStatus)}</dd>
            </div>
          </dl>
        </section>

        <section
          className={styles.headerCard}
          aria-labelledby="commercial-conditions"
        >
          <h2 id="commercial-conditions">Condiciones comerciales</h2>
          <dl className={styles.headerGrid}>
            <div>
              <dt>Condición de pago</dt>
              <dd>{paymentConditionLabel(order.paymentConditionType)}</dd>
            </div>
            <div>
              <dt>Plazo de pago</dt>
              <dd>
                {paymentTermLabel(
                  order.paymentTermValue,
                  order.paymentTermUnit,
                )}
              </dd>
            </div>
            <div>
              <dt>Cotización válida hasta</dt>
              <dd>
                {order.quotationValidUntil
                  ? formatDateOnly(order.quotationValidUntil)
                  : 'No especificada'}
              </dd>
            </div>
            <div className={styles.commercialObservations}>
              <dt>Observaciones comerciales</dt>
              <dd>
                {order.commercialObservations ?? 'Sin observaciones'}
              </dd>
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

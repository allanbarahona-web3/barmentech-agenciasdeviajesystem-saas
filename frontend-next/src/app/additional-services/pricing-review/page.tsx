'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdditionalServicesContextHeader } from '@/components/additional-services-context-header';
import {
  AdditionalServicesPricingReview,
  type AdditionalServicePricingReviewEntry,
} from '@/components/additional-services-pricing-review';
import { LoadingModal } from '@/components/loading-modal';
import {
  ToastNotification,
  useToast,
} from '@/components/toast-notification';
import { Button } from '@/components/ui/button';
import { getAdditionalServiceSuppliers } from '@/lib/additional-services-admin-api';
import {
  createAdditionalServiceOrder,
  type AdditionalServiceDetails,
} from '@/lib/additional-services-orders-api';
import {
  getAdditionalServicesQuotationCurrency,
  getAdditionalServicesQuoteCustomerId,
  getAdditionalServicesWorkflowContext,
  getOrCreateAdditionalServiceOrderIdempotencyKey,
  getTemporaryAdditionalServiceLineId,
  getTemporaryAdditionalServiceLinePricing,
  getTemporaryAdditionalServiceLineSourcing,
  getTemporaryAdditionalServiceLines,
  resetAdditionalServicesWorkflow,
  type TemporaryAdditionalServiceLine,
} from '@/lib/additional-services-temporary-store';
import { getAdditionalServiceName } from '@/shared/additional-services';
import styles from '../order-summary/order-summary.module.css';
import reviewStyles from '@/components/additional-services-pricing-review.module.css';

function getServiceDetails(
  line: TemporaryAdditionalServiceLine,
): AdditionalServiceDetails {
  switch (line.serviceType) {
    case 'BAGGAGE':
      return {
        baggageTypes: line.baggageTypes,
        tripScope: line.tripScope,
        pieceQuantity: line.pieceQuantity,
        weightKg: line.weightKg,
      };
    case 'LODGING':
      return {
        lodgingType: line.lodgingType,
        checkInDate: line.checkInDate,
        checkOutDate: line.checkOutDate,
      };
    case 'ACCOMMODATION_TYPE':
      return { accommodationType: line.accommodationType };
    case 'INSURANCE':
      return {
        coverage: line.coverage,
        customCoverageAmount: line.customCoverageAmount,
        currency: line.currency,
      };
    case 'TRANSPORTATION':
      return {
        transportationType: line.transportationType,
        tripType: line.tripType,
        serviceDate: line.serviceDate,
        origin: line.origin,
        destination: line.destination,
      };
    case 'TOUR':
      return { tourName: line.tourName, serviceDate: line.serviceDate };
    case 'FLIGHT_TICKET':
      return {
        tripType: line.tripType,
        originAirport: line.originAirport,
        destinationAirport: line.destinationAirport,
        departureDate: line.departureDate,
        returnDate: line.returnDate,
        quantity: line.quantity,
      };
    case 'SEAT_SELECTION':
      return {
        seatPreference: line.seatPreference,
        otherPreferenceDescription: line.otherPreferenceDescription,
        quantity: line.quantity,
      };
    case 'EVENT_TICKET':
      return {
        eventName: line.eventName,
        serviceDate: line.serviceDate,
        quantity: line.quantity,
        venueOrCity: line.venueOrCity,
      };
    case 'TRAVEL_EXTENSION':
    case 'TRIP_REDUCTION':
      return {
        newReturnDate: line.newReturnDate,
        quantity: line.quantity,
      };
    case 'VISA_ASSISTANCE':
      return {
        destinationCountry: line.destinationCountry,
        visaType: line.visaType,
        expectedTravelDate: line.expectedTravelDate,
      };
  }
}

export default function AdditionalServicesPricingReviewPage() {
  const router = useRouter();
  const [lines] = useState(() => getTemporaryAdditionalServiceLines());
  const [context] = useState(() => getAdditionalServicesWorkflowContext());
  const [quotationCurrency] = useState(() =>
    getAdditionalServicesQuotationCurrency(),
  );
  const [quoteCustomerId] = useState(() =>
    getAdditionalServicesQuoteCustomerId(),
  );
  const [idempotencyKey] = useState(() =>
    getOrCreateAdditionalServiceOrderIdempotencyKey(),
  );
  const [supplierNames, setSupplierNames] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [suppliersError, setSuppliersError] = useState<string | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const submissionInProgress = useRef(false);
  const { toasts, showError, dismissToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    const suppliersRequest = context?.travelType
      ? getAdditionalServiceSuppliers({
          activeOnly: true,
          travelType: context.travelType,
        })
      : Promise.reject(
          new Error('No se encontró el tipo de viaje actual.'),
        );

    void suppliersRequest
      .then((suppliers) => {
        if (!cancelled) {
          setSupplierNames(
            new Map(
              suppliers.map((supplier) => [
                supplier.id,
                supplier.name,
              ]),
            ),
          );
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSuppliersError(
            error instanceof Error
              ? error.message
              : 'No se pudieron cargar los proveedores.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSuppliersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [context]);

  const participantNames = new Map(
    context?.selectedParticipants.map((participant) => [
      participant.participantId,
      participant.fullName,
    ]) ?? [],
  );
  const entries = lines.flatMap<AdditionalServicePricingReviewEntry>(
    (line) => {
      const breakdown =
        getTemporaryAdditionalServiceLinePricing(line);
      if (!breakdown) {
        return [];
      }

      const sourcing =
        getTemporaryAdditionalServiceLineSourcing(line);

      return [
        {
          id: getTemporaryAdditionalServiceLineId(line),
          participantName:
            participantNames.get(line.participantId) ??
            line.participantId,
          serviceName: getAdditionalServiceName(line),
          supplierName:
            (sourcing.supplierId
              ? supplierNames.get(sourcing.supplierId)
              : null) ?? 'Proveedor no disponible',
          breakdown,
        },
      ];
    },
  );

  async function continueToQuotation() {
    if (submissionInProgress.current) {
      return;
    }

    submissionInProgress.current = true;
    setCreatingOrder(true);

    try {
      if (!context) {
        throw new Error(
          'No se encontró el contexto del viaje seleccionado.',
        );
      }
      if (!quoteCustomerId) {
        throw new Error('Seleccione el cliente de la cotización.');
      }

      const orderLines = lines.map((line) => {
        const sourcing = getTemporaryAdditionalServiceLineSourcing(line);
        if (
          !sourcing.supplierId ||
          sourcing.cost === null ||
          !sourcing.currency
        ) {
          throw new Error(
            `La información comercial de ${getAdditionalServiceName(line)} está incompleta.`,
          );
        }

        return {
          serviceCode: line.serviceType,
          serviceDetailsVersion: 1 as const,
          serviceDetails: getServiceDetails(line),
          supplierId: sourcing.supplierId,
          supplierCostUrl: sourcing.providerUrl.trim() || undefined,
          supplierCost: sourcing.cost,
          supplierCostCurrency: sourcing.currency,
          commercialNotes:
            'notes' in line && line.notes ? line.notes : undefined,
          participantIds: [line.participantId],
        };
      });

      if (orderLines.length === 0) {
        throw new Error('No hay servicios adicionales para guardar.');
      }

      const response = await createAdditionalServiceOrder({
        idempotencyKey,
        travelId: context.travelId,
        travelType: context.travelType,
        quoteCustomerId,
        quotationCurrency,
        lines: orderLines,
      });

      if (!response.orderId) {
        throw new Error(
          'El servidor no devolvió el identificador de la orden.',
        );
      }

      resetAdditionalServicesWorkflow();
      router.push(
        `/additional-services/orders/${encodeURIComponent(response.orderId)}?created=true`,
      );
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : 'No se pudo crear la orden de servicios adicionales.',
      );
      submissionInProgress.current = false;
      setCreatingOrder(false);
    }
  }

  return (
    <main className="app-shell">
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
      <LoadingModal
        isOpen={suppliersLoading || creatingOrder}
        state="loading"
        loadingMessage={
          creatingOrder
            ? 'Guardando orden de servicios adicionales...'
            : 'Cargando revisión de precios...'
        }
      />
      <div className={`${styles.page} ${styles.pricingPage}`}>
        <AdditionalServicesContextHeader />
        <header className={reviewStyles.pageHeader}>
          <div>
            <h1 className={styles.title}>Revisión de precios</h1>
            <p className={styles.subtitle}>
              Revise el cálculo comercial de cada servicio antes de continuar.
            </p>
          </div>
          <div className={reviewStyles.headerActions}>
            <Button asChild variant="outline" className={styles.backButton}>
              <Link href="/additional-services/pricing">
                Volver a información comercial
              </Link>
            </Button>
            <Button
              type="button"
              className={styles.continueButton}
              disabled={
                suppliersLoading || creatingOrder || entries.length === 0
              }
              onClick={() => void continueToQuotation()}
            >
              Continuar
            </Button>
          </div>
        </header>

        <section>
          {suppliersError && (
            <p
              role="alert"
              style={{
                margin: '0 0 18px',
                padding: '12px 14px',
                border: '1px solid #fecaca',
                borderRadius: '9px',
                background: '#fff1f2',
                color: '#b91c1c',
                fontWeight: 600,
              }}
            >
              {suppliersError}
            </p>
          )}

          {entries.length > 0 ? (
            <AdditionalServicesPricingReview entries={entries} />
          ) : (
            <p className={styles.empty}>
              No hay cálculos de precios disponibles para revisar.
            </p>
          )}

        </section>
      </div>
    </main>
  );
}

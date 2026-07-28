'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdditionalServicesContextHeader } from '@/components/additional-services-context-header';
import {
  AdditionalServicesPricingReview,
  type AdditionalServicePricingReviewEntry,
} from '@/components/additional-services-pricing-review';
import { LoadingModal } from '@/components/loading-modal';
import { Button } from '@/components/ui/button';
import { getAdditionalServiceSuppliers } from '@/lib/additional-services-admin-api';
import {
  getAdditionalServicesWorkflowContext,
  getTemporaryAdditionalServiceLineId,
  getTemporaryAdditionalServiceLinePricing,
  getTemporaryAdditionalServiceLineSourcing,
  getTemporaryAdditionalServiceLines,
} from '@/lib/additional-services-temporary-store';
import { getAdditionalServiceName } from '@/shared/additional-services';
import styles from '../order-summary/order-summary.module.css';
import reviewStyles from '@/components/additional-services-pricing-review.module.css';

export default function AdditionalServicesPricingReviewPage() {
  const [lines] = useState(() => getTemporaryAdditionalServiceLines());
  const [context] = useState(() => getAdditionalServicesWorkflowContext());
  const [supplierNames, setSupplierNames] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [suppliersError, setSuppliersError] = useState<string | null>(null);

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

  return (
    <main className="app-shell">
      <LoadingModal
        isOpen={suppliersLoading}
        state="loading"
        loadingMessage="Cargando revisión de precios..."
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
              disabled
              title="Próximamente"
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

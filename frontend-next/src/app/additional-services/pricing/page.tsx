'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdditionalServicesContextHeader } from '@/components/additional-services-context-header';
import { AdditionalServicesLinesTable } from '@/components/additional-services-lines-table';
import { LoadingModal } from '@/components/loading-modal';
import { Button } from '@/components/ui/button';
import { calculateAdditionalServicePrice } from '@/lib/additional-services-pricing-api';
import {
  getAdditionalServicesWorkflowContext,
  getTemporaryAdditionalServiceLineSourcing,
  getTemporaryAdditionalServiceLines,
  setTemporaryAdditionalServiceLinePricing,
} from '@/lib/additional-services-temporary-store';
import { getAdditionalServiceName } from '@/shared/additional-services';
import styles from '../order-summary/order-summary.module.css';

export default function AdditionalServicesPricingPage() {
  const router = useRouter();
  const [calculating, setCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState<string | null>(null);

  async function continueToPricingReview() {
    if (calculating) {
      return;
    }

    setCalculating(true);
    setCalculationError(null);

    const lines = getTemporaryAdditionalServiceLines();
    const context = getAdditionalServicesWorkflowContext();
    const participantNames = new Map(
      context?.selectedParticipants.map((participant) => [
        participant.participantId,
        participant.fullName,
      ]) ?? [],
    );

    try {
      const results = await Promise.all(
        lines.map(async (line) => {
          const sourcing =
            getTemporaryAdditionalServiceLineSourcing(line);

          try {
            const breakdown = await calculateAdditionalServicePrice({
              serviceCode: line.serviceType,
              supplierCost: sourcing.cost,
              costCurrency: sourcing.currency,
            });
            return { line, breakdown };
          } catch (error) {
            const participant =
              participantNames.get(line.participantId) ??
              line.participantId;
            const serviceName = getAdditionalServiceName(line);
            const backendMessage =
              error instanceof Error
                ? error.message
                : 'No se pudo calcular el precio.';

            throw new Error(
              `${participant} · ${serviceName}: ${backendMessage}`,
            );
          }
        }),
      );

      setTemporaryAdditionalServiceLinePricing(results);
      router.push('/additional-services/pricing-review');
    } catch (error) {
      setCalculationError(
        error instanceof Error
          ? error.message
          : 'No se pudieron calcular los precios.',
      );
    } finally {
      setCalculating(false);
    }
  }

  return (
    <main className="app-shell">
      <LoadingModal
        isOpen={calculating}
        state="loading"
        loadingMessage="Calculando precios..."
      />
      <div className={`${styles.page} ${styles.pricingPage}`}>
        <AdditionalServicesContextHeader />
        <header className={styles.header}>
          <h1 className={styles.title}>Información comercial</h1>
          <p className={styles.subtitle}>
            Ingrese la información de origen para cada servicio adicional.
          </p>
        </header>

        <section className="form-section-card" style={{ marginTop: 0 }}>
          <AdditionalServicesLinesTable mode="pricing" />
          {calculationError && (
            <p
              role="alert"
              style={{
                margin: '20px 0 0',
                padding: '12px 14px',
                border: '1px solid #fecaca',
                borderRadius: '9px',
                background: '#fff1f2',
                color: '#b91c1c',
                fontWeight: 600,
              }}
            >
              {calculationError}
            </p>
          )}
          <div className={styles.actions}>
            <Button asChild variant="outline" className={styles.backButton}>
              <Link href="/additional-services/order-summary">
                Volver al resumen
              </Link>
            </Button>
            <Button
              type="button"
              className={styles.continueButton}
              disabled={calculating}
              onClick={() => void continueToPricingReview()}
            >
              {calculating ? 'Calculando...' : 'Continuar'}
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

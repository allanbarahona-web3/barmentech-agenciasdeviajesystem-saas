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
  getAdditionalServicesQuotationCurrency,
  getAdditionalServicesWorkflowContext,
  getTemporaryAdditionalServiceLineSourcing,
  getTemporaryAdditionalServiceLines,
  setAdditionalServicesQuotationCurrency,
  setTemporaryAdditionalServiceLinePricing,
  type TemporaryLineCurrency,
} from '@/lib/additional-services-temporary-store';
import { getAdditionalServiceName } from '@/shared/additional-services';
import styles from '../order-summary/order-summary.module.css';

function isValidOptionalSupplierCostUrl(value: string) {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return true;
  }

  try {
    const url = new URL(normalizedValue);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    const hostname = url.hostname;
    const isIpv4 =
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) &&
      hostname.split('.').every((part) => Number(part) <= 255);
    const isIpv6 = hostname.startsWith('[') && hostname.endsWith(']');
    const domainParts = hostname.split('.');
    const isDomain =
      domainParts.length >= 2 &&
      domainParts.every(
        (part) =>
          /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(part),
      ) &&
      domainParts[domainParts.length - 1].length >= 2;

    return isIpv4 || isIpv6 || isDomain;
  } catch {
    return false;
  }
}

export default function AdditionalServicesPricingPage() {
  const router = useRouter();
  const [calculating, setCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [quotationCurrency, setQuotationCurrency] =
    useState<TemporaryLineCurrency>(() =>
      getAdditionalServicesQuotationCurrency(),
    );

  function changeQuotationCurrency(currency: TemporaryLineCurrency) {
    setQuotationCurrency(currency);
    setAdditionalServicesQuotationCurrency(currency);
    setCalculationError(null);
  }

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
            if (!isValidOptionalSupplierCostUrl(sourcing.providerUrl)) {
              throw new Error(
                'La URL del costo debe ser una dirección HTTP o HTTPS válida, o dejarse vacía.',
              );
            }

            const breakdown = await calculateAdditionalServicePrice({
              serviceCode: line.serviceType,
              supplierCost: sourcing.cost,
              costCurrency: sourcing.currency,
              quotationCurrency,
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
          <fieldset
            style={{
              margin: '0 0 24px',
              padding: '18px 20px',
              border: '1px solid #dbe4f0',
              borderRadius: '12px',
              background: '#f8fafc',
            }}
          >
            <legend
              style={{
                padding: '0 6px',
                color: '#172554',
                fontSize: '15px',
                fontWeight: 700,
              }}
            >
              Moneda de la cotización
            </legend>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px',
                marginTop: '4px',
              }}
            >
              {(['USD', 'CRC'] as const).map((currency) => (
                <label
                  key={currency}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    minWidth: '96px',
                    padding: '10px 14px',
                    border:
                      quotationCurrency === currency
                        ? '2px solid #4f46e5'
                        : '1px solid #cbd5e1',
                    borderRadius: '10px',
                    background:
                      quotationCurrency === currency ? '#eef2ff' : '#fff',
                    color: '#172554',
                    fontWeight: 700,
                    cursor: calculating ? 'not-allowed' : 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="quotationCurrency"
                    value={currency}
                    checked={quotationCurrency === currency}
                    disabled={calculating}
                    onChange={() => changeQuotationCurrency(currency)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  {currency}
                </label>
              ))}
            </div>
          </fieldset>
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

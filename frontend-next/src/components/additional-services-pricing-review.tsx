import { Info, LockKeyhole, ReceiptText } from 'lucide-react';
import type { AdditionalServicePricingBreakdown } from '@/lib/additional-services-pricing-api';
import styles from './additional-services-pricing-review.module.css';

export interface AdditionalServicePricingReviewEntry {
  id: string;
  participantName: string;
  serviceName: string;
  supplierName: string;
  breakdown: AdditionalServicePricingBreakdown;
}

function formatCurrency(
  value: number,
  currency: AdditionalServicePricingBreakdown['quotationCurrency'],
) {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat('es-CR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

interface PricingSummary {
  currency: AdditionalServicePricingBreakdown['quotationCurrency'];
  subtotal: number;
  vatAmount: number;
  finalSellingPrice: number;
}

export function AdditionalServicesPricingReview({
  entries,
}: {
  entries: AdditionalServicePricingReviewEntry[];
}) {
  const summaries = Array.from(
    entries.reduce<Map<PricingSummary['currency'], PricingSummary>>(
      (byCurrency, { breakdown }) => {
        const summary = byCurrency.get(breakdown.quotationCurrency) ?? {
          currency: breakdown.quotationCurrency,
          subtotal: 0,
          vatAmount: 0,
          finalSellingPrice: 0,
        };

        summary.subtotal += breakdown.subtotal;
        summary.vatAmount += breakdown.vatAmount;
        summary.finalSellingPrice += breakdown.finalSellingPrice;
        byCurrency.set(breakdown.quotationCurrency, summary);
        return byCurrency;
      },
      new Map(),
    ).values(),
  );
  const quotationCurrency =
    summaries.length === 1 ? summaries[0].currency : 'Múltiples';

  return (
    <>
      <div className={styles.reviewLayout}>
        <div className={styles.grid}>
          {entries.map((entry) => {
            const { breakdown } = entry;

            return (
              <article className={styles.card} key={entry.id}>
                <header className={styles.cardHeader}>
                  <span className={styles.serviceIcon} aria-hidden="true">
                    <ReceiptText />
                  </span>
                  <div className={styles.serviceHeading}>
                    <h2 className={styles.serviceName}>{entry.serviceName}</h2>
                    <p className={styles.participant}>
                      {entry.participantName}
                    </p>
                  </div>
                  <span className={styles.currency}>
                    {breakdown.quotationCurrency}
                  </span>
                </header>

                <dl className={styles.details}>
                  <div className={styles.fullRow}>
                    <dt>Proveedor</dt>
                    <dd>{entry.supplierName}</dd>
                  </div>
                  <div>
                    <dt>Costo del proveedor</dt>
                    <dd>
                      {formatCurrency(
                        breakdown.supplierCost,
                        breakdown.costCurrency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Moneda del costo</dt>
                    <dd>{breakdown.costCurrency}</dd>
                  </div>
                  <div>
                    <dt>Tipo de margen</dt>
                    <dd>
                      {breakdown.marginType === 'PERCENTAGE'
                        ? 'Porcentaje'
                        : 'Monto fijo'}
                    </dd>
                  </div>
                  <div>
                    <dt>Valor del margen</dt>
                    <dd>
                      {breakdown.marginType === 'PERCENTAGE'
                        ? `${formatDecimal(breakdown.marginValue)} %`
                        : formatCurrency(
                            breakdown.marginValue,
                            breakdown.quotationCurrency,
                          )}
                    </dd>
                  </div>
                  <div>
                    <dt>Monto del margen</dt>
                    <dd>
                      {formatCurrency(
                        breakdown.marginAmount,
                        breakdown.quotationCurrency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Subtotal</dt>
                    <dd>
                      {formatCurrency(
                        breakdown.subtotal,
                        breakdown.quotationCurrency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>IVA</dt>
                    <dd>{formatDecimal(breakdown.vatPercentage)} %</dd>
                  </div>
                  <div>
                    <dt>Monto del IVA</dt>
                    <dd>
                      {formatCurrency(
                        breakdown.vatAmount,
                        breakdown.quotationCurrency,
                      )}
                    </dd>
                  </div>
                  <div className={styles.totalRow}>
                    <dt>Precio final de venta</dt>
                    <dd>
                      {formatCurrency(
                        breakdown.finalSellingPrice,
                        breakdown.quotationCurrency,
                      )}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>

        <aside className={styles.sidebar}>
          <section className={styles.summaryCard}>
            <h2>Resumen comercial</h2>
            <dl className={styles.summaryDetails}>
              <div>
                <dt>Número de servicios</dt>
                <dd>{entries.length}</dd>
              </div>
              <div>
                <dt>Moneda de cotización</dt>
                <dd>{quotationCurrency}</dd>
              </div>
            </dl>

            {summaries.map((summary) => (
              <dl className={styles.summaryAmounts} key={summary.currency}>
                {summaries.length > 1 && (
                  <div className={styles.summaryCurrency}>
                    <dt>Moneda</dt>
                    <dd>{summary.currency}</dd>
                  </div>
                )}
                <div>
                  <dt>Subtotal comercial</dt>
                  <dd>
                    {formatCurrency(summary.subtotal, summary.currency)}
                  </dd>
                </div>
                <div>
                  <dt>IVA total</dt>
                  <dd>
                    {formatCurrency(summary.vatAmount, summary.currency)}
                  </dd>
                </div>
                <div className={styles.estimatedTotal}>
                  <dt>Total estimado</dt>
                  <dd>
                    {formatCurrency(
                      summary.finalSellingPrice,
                      summary.currency,
                    )}
                  </dd>
                </div>
              </dl>
            ))}
          </section>

          <section className={styles.infoPanel}>
            <span className={styles.infoIcon} aria-hidden="true">
              <Info />
            </span>
            <div>
              <h2>Revisión comercial interna</h2>
              <p>
                Los precios fueron calculados por el motor de precios. No se
                realizan cálculos en el navegador. Los valores se confirmarán
                en el siguiente paso del flujo.
              </p>
            </div>
          </section>
        </aside>
      </div>

      <p className={styles.engineNote}>
        <LockKeyhole aria-hidden="true" />
        Los cálculos comerciales provienen del motor de precios.
      </p>
    </>
  );
}

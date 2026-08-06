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
  getAdditionalServicesCommercialConditions,
  getAdditionalServicesQuotationCurrency,
  getAdditionalServicesQuoteCustomerId,
  getAdditionalServicesWorkflowContext,
  getTemporaryAdditionalServiceLineSourcing,
  getTemporaryAdditionalServiceLines,
  setAdditionalServicesCommercialConditions,
  setAdditionalServicesQuotationCurrency,
  setAdditionalServicesQuoteCustomerId,
  setTemporaryAdditionalServiceLinePricing,
  type AdditionalServicesCommercialConditions,
  type TemporaryLineCurrency,
} from '@/lib/additional-services-temporary-store';
import { getAdditionalServiceName } from '@/shared/additional-services';
import styles from '../order-summary/order-summary.module.css';

const PAYMENT_TERM_OPTIONS = [
  { key: '15_DAYS', label: '15 días', value: 15, unit: 'DAYS' },
  { key: '30_DAYS', label: '30 días', value: 30, unit: 'DAYS' },
  { key: '45_DAYS', label: '45 días', value: 45, unit: 'DAYS' },
] as const;
type PaymentTermOption = '' | (typeof PAYMENT_TERM_OPTIONS)[number]['key'] | 'OTHER';
type CustomPaymentTermUnit = 'DAYS' | 'MONTHS';

function initialPaymentTermOption(
  conditions: AdditionalServicesCommercialConditions,
): PaymentTermOption {
  if (
    conditions.paymentTermValue === null ||
    conditions.paymentTermUnit === null
  ) {
    return '';
  }

  return (
    PAYMENT_TERM_OPTIONS.find(
      (option) =>
        option.value === conditions.paymentTermValue &&
        option.unit === conditions.paymentTermUnit,
    )?.key ?? 'OTHER'
  );
}

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
  const [quoteCustomerId, setQuoteCustomerId] = useState<string>(() =>
    getAdditionalServicesQuoteCustomerId() ?? '',
  );
  const [commercialConditions, setCommercialConditions] =
    useState<AdditionalServicesCommercialConditions>(() =>
      getAdditionalServicesCommercialConditions(),
    );
  const [paymentTermOption, setPaymentTermOption] =
    useState<PaymentTermOption>(() =>
      initialPaymentTermOption(getAdditionalServicesCommercialConditions()),
    );
  const initialCommercialConditions =
    getAdditionalServicesCommercialConditions();
  const [customPaymentTermAmount, setCustomPaymentTermAmount] = useState(
    initialCommercialConditions.paymentTermValue?.toString() ?? '',
  );
  const [customPaymentTermUnit, setCustomPaymentTermUnit] =
    useState<CustomPaymentTermUnit>(
      initialCommercialConditions.paymentTermUnit ?? 'DAYS',
    );

  function changeQuotationCurrency(currency: TemporaryLineCurrency) {
    setQuotationCurrency(currency);
    setAdditionalServicesQuotationCurrency(currency);
    setCalculationError(null);
  }

  function changeQuoteCustomer(customerId: string) {
    setQuoteCustomerId(customerId);
    setAdditionalServicesQuoteCustomerId(customerId || null);
    setCalculationError(null);
  }

  function changePaymentCondition(
    paymentConditionType:
      AdditionalServicesCommercialConditions['paymentConditionType'],
  ) {
    if (paymentConditionType === 'CASH') {
      setPaymentTermOption('');
      setCustomPaymentTermAmount('');
      changeCommercialConditions({
        paymentConditionType,
        paymentTermValue: null,
        paymentTermUnit: null,
      });
      return;
    }

    if (paymentConditionType !== 'CREDIT') {
      setPaymentTermOption('');
      setCustomPaymentTermAmount('');
      changeCommercialConditions({
        paymentConditionType,
        paymentTermValue: null,
        paymentTermUnit: null,
      });
      return;
    }

    changeCommercialConditions({
      paymentConditionType,
      paymentTermValue: null,
      paymentTermUnit: null,
    });
  }

  function changeCommercialConditions(
    changes: Partial<AdditionalServicesCommercialConditions>,
  ) {
    const nextConditions = {
      ...commercialConditions,
      ...changes,
    };
    setCommercialConditions(nextConditions);
    setAdditionalServicesCommercialConditions(nextConditions);
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
      if (!quoteCustomerId) {
        throw new Error('Seleccione el cliente de la cotización.');
      }
      if (
        commercialConditions.paymentConditionType === 'CREDIT' &&
        (commercialConditions.paymentTermValue === null ||
          commercialConditions.paymentTermUnit === null)
      ) {
        throw new Error('Seleccione el plazo de pago del crédito.');
      }

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
          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="quoteCustomerId"
              style={{
                display: 'block',
                marginBottom: '8px',
                color: '#172554',
                fontSize: '15px',
                fontWeight: 700,
              }}
            >
              Cliente de la cotización
            </label>
            <select
              id="quoteCustomerId"
              name="quoteCustomerId"
              value={quoteCustomerId}
              disabled={calculating}
              required
              onChange={(event) => changeQuoteCustomer(event.target.value)}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '10px 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                background: '#fff',
                color: '#172554',
              }}
            >
              <option value="">Seleccione un cliente</option>
              {getAdditionalServicesWorkflowContext()?.eligibleQuoteCustomers.map(
                (customer) => (
                  <option
                    key={customer.participantId}
                    value={customer.participantId}
                  >
                    {customer.fullName}
                  </option>
                ),
              )}
            </select>
          </div>
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
              Condiciones comerciales
            </legend>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px',
                marginTop: '6px',
              }}
            >
              <label
                htmlFor="paymentConditionType"
                style={{ display: 'grid', gap: '7px', color: '#172554' }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700 }}>
                  Condición de pago
                </span>
                <select
                  id="paymentConditionType"
                  value={commercialConditions.paymentConditionType ?? ''}
                  disabled={calculating}
                  onChange={(event) =>
                    changePaymentCondition(
                      (event.target.value || null) as
                        AdditionalServicesCommercialConditions['paymentConditionType'],
                    )
                  }
                  style={{
                    minHeight: '44px',
                    padding: '10px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    background: '#fff',
                    color: '#172554',
                  }}
                >
                  <option value="">Seleccione una condición</option>
                  <option value="CASH">Contado</option>
                  <option value="CREDIT">Crédito</option>
                </select>
              </label>

              <label
                htmlFor="paymentTerm"
                style={{ display: 'grid', gap: '7px', color: '#172554' }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700 }}>
                  Plazo de pago
                </span>
                <select
                  id="paymentTerm"
                  value={paymentTermOption}
                  disabled={
                    calculating ||
                    commercialConditions.paymentConditionType !== 'CREDIT'
                  }
                  onChange={(event) => {
                    const option = event.target.value as PaymentTermOption;
                    setPaymentTermOption(option);
                    if (option === 'OTHER') {
                      setCustomPaymentTermAmount('');
                      setCustomPaymentTermUnit('DAYS');
                      changeCommercialConditions({
                        paymentTermValue: null,
                        paymentTermUnit: null,
                      });
                      return;
                    }

                    const predefinedTerm = PAYMENT_TERM_OPTIONS.find(
                      (term) => term.key === option,
                    );
                    changeCommercialConditions({
                      paymentTermValue: predefinedTerm?.value ?? null,
                      paymentTermUnit: predefinedTerm?.unit ?? null,
                    });
                  }}
                  style={{
                    minHeight: '44px',
                    padding: '10px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    background: '#fff',
                    color: '#172554',
                  }}
                >
                  <option value="">
                    {commercialConditions.paymentConditionType === 'CREDIT'
                      ? 'Seleccione un plazo'
                      : 'No aplica'}
                  </option>
                  {PAYMENT_TERM_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                  <option value="OTHER">Otro</option>
                </select>
              </label>

              {paymentTermOption === 'OTHER' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(120px, 1fr) minmax(130px, 1fr)',
                    gap: '10px',
                    color: '#172554',
                  }}
                >
                  <label
                    htmlFor="customPaymentTermAmount"
                    style={{ display: 'grid', gap: '7px' }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>
                      Cantidad
                    </span>
                    <input
                      id="customPaymentTermAmount"
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      required
                      value={customPaymentTermAmount}
                      disabled={calculating}
                      placeholder="Ej.: 50"
                      onChange={(event) => {
                        const amount = event.target.value;
                        if (amount && !/^[1-9]\d*$/.test(amount)) {
                          return;
                        }
                        setCustomPaymentTermAmount(amount);
                        changeCommercialConditions({
                          paymentTermValue: amount ? Number(amount) : null,
                          paymentTermUnit: amount
                            ? customPaymentTermUnit
                            : null,
                        });
                      }}
                      style={{
                        minHeight: '44px',
                        padding: '10px 12px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '10px',
                        background: '#fff',
                        color: '#172554',
                      }}
                    />
                  </label>
                  <label
                    htmlFor="customPaymentTermUnit"
                    style={{ display: 'grid', gap: '7px' }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>
                      Unidad
                    </span>
                    <select
                      id="customPaymentTermUnit"
                      value={customPaymentTermUnit}
                      disabled={calculating}
                      onChange={(event) => {
                        const unit = event.target.value as CustomPaymentTermUnit;
                        setCustomPaymentTermUnit(unit);
                        changeCommercialConditions({
                          paymentTermValue: customPaymentTermAmount
                            ? Number(customPaymentTermAmount)
                            : null,
                          paymentTermUnit: customPaymentTermAmount
                            ? unit
                            : null,
                        });
                      }}
                      style={{
                        minHeight: '44px',
                        padding: '10px 12px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '10px',
                        background: '#fff',
                        color: '#172554',
                      }}
                    >
                      <option value="DAYS">Días</option>
                      <option value="MONTHS">Meses</option>
                    </select>
                  </label>
                </div>
              )}

              <label
                htmlFor="quotationValidUntil"
                style={{ display: 'grid', gap: '7px', color: '#172554' }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700 }}>
                  Cotización válida hasta
                </span>
                <input
                  id="quotationValidUntil"
                  type="date"
                  value={commercialConditions.quotationValidUntil}
                  disabled={calculating}
                  onChange={(event) =>
                    changeCommercialConditions({
                      quotationValidUntil: event.target.value,
                    })
                  }
                  style={{
                    minHeight: '44px',
                    padding: '10px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    background: '#fff',
                    color: '#172554',
                  }}
                />
              </label>

              <label
                htmlFor="commercialObservations"
                style={{
                  display: 'grid',
                  gridColumn: '1 / -1',
                  gap: '7px',
                  color: '#172554',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700 }}>
                  Observaciones comerciales
                </span>
                <textarea
                  id="commercialObservations"
                  value={commercialConditions.commercialObservations}
                  disabled={calculating}
                  rows={3}
                  placeholder="Agregue observaciones aplicables a la cotización"
                  onChange={(event) =>
                    changeCommercialConditions({
                      commercialObservations: event.target.value,
                    })
                  }
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    background: '#fff',
                    color: '#172554',
                    font: 'inherit',
                    resize: 'vertical',
                  }}
                />
              </label>
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

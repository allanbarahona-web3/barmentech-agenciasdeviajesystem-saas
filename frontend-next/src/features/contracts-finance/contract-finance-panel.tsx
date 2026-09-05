'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getStoredSession } from '@/lib/auth-api';
import {
  downloadPaymentReceipt,
  FinanceApiError,
  formatFinanceMoney,
  getContractCommercialObligation,
  registerContractInstallment,
  type ContractCommercialObligationResult,
  type RegisterContractInstallmentResult,
} from '@/lib/finance-api';
import {
  FINANCE_PAYMENT_METHOD_OPTIONS,
  formatFinancePaymentMethod,
  type FinancePaymentMethod,
} from '@/lib/finance-payment-methods';
import {
  buildContractInstallmentRequest,
  canRegisterContractInstallments,
  CONTRACT_OBLIGATION_STATUS_LABELS,
  createContractInstallmentDeduplicationKey,
  installmentFormError,
} from './contract-installment';

type ContractFinancePanelProps = {
  contractId: string;
  contractNumber: string;
  onClose: () => void;
};

type InstallmentSuccess = {
  payment: RegisterContractInstallmentResult['payment'];
  obligation: RegisterContractInstallmentResult['obligation'];
};

function localDateTimeValue(): string {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatOptionalDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('es-CR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function ContractFinancePanel({ contractId, contractNumber, onClose }: ContractFinancePanelProps) {
  const role = String(getStoredSession()?.user.role || '').toUpperCase();
  const canRegister = canRegisterContractInstallments(role);
  const [result, setResult] = useState<ContractCommercialObligationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod | ''>('');
  const [receivedAt, setReceivedAt] = useState(localDateTimeValue);
  const [externalReference, setExternalReference] = useState('');
  const [description, setDescription] = useState('');
  const [registrationDeduplicationKey, setRegistrationDeduplicationKey] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<InstallmentSuccess | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);

  const refreshObligation = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getContractCommercialObligation(contractId, signal);
      if (!signal?.aborted) setResult(response);
    } catch (requestError) {
      if (!signal?.aborted) {
        setError(requestError instanceof Error ? requestError.message : 'No se pudo consultar la obligación financiera.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshObligation(controller.signal);
    return () => controller.abort();
  }, [refreshObligation]);

  const openRegistration = () => {
    setAmount('');
    setPaymentMethod('');
    setReceivedAt(localDateTimeValue());
    setExternalReference('');
    setDescription('');
    setFormError(null);
    setRegistrationDeduplicationKey(createContractInstallmentDeduplicationKey());
    setModalOpen(true);
  };

  const closeRegistration = () => {
    if (submitting) return;
    setModalOpen(false);
    setFormError(null);
  };

  const submitInstallment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const obligation = result?.commercialObligation;
    if (!obligation || !registrationDeduplicationKey || !paymentMethod) return;

    const validationError = installmentFormError({
      amount,
      paymentMethod,
      receivedAt,
      outstandingAmount: obligation.outstandingAmount,
    });
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const response = await registerContractInstallment(
        contractId,
        buildContractInstallmentRequest({
          registrationDeduplicationKey,
          amount,
          receivedAt,
          paymentMethod,
          externalReference,
          description,
        }),
      );
      setSuccess(response);
      setModalOpen(false);
      setRegistrationDeduplicationKey(null);
      await refreshObligation();
    } catch (requestError) {
      setFormError(
        requestError instanceof FinanceApiError || requestError instanceof Error
          ? requestError.message
          : 'No se pudo registrar el abono.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const downloadReceipt = async () => {
    if (!success) return;
    setReceiptBusy(true);
    setError(null);
    try {
      const file = await downloadPaymentReceipt(success.payment.id);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo descargar el recibo.');
    } finally {
      setReceiptBusy(false);
    }
  };

  const obligation = result?.commercialObligation;

  return (
    <section className="viewer-modal" role="dialog" aria-modal="true" aria-labelledby="contract-finance-title" onClick={onClose}>
      <div className="viewer-panel" onClick={(event) => event.stopPropagation()}>
        <div className="viewer-head">
          <div>
            <h2 id="contract-finance-title">Finanzas del contrato</h2>
            <p style={{ margin: 0, color: '#4b6790' }}>{contractNumber}</p>
          </div>
          <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="viewer-body" style={{ display: 'grid', gap: 16 }}>
          {loading ? <p>Cargando obligación financiera…</p> : null}
          {error ? <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>{error}</p> : null}

          {!loading && !obligation ? (
            <p style={{ margin: 0 }}>Este contrato aún no tiene una obligación financiera activa.</p>
          ) : null}

          {!loading && obligation ? (
            <>
              <section className="card" style={{ margin: 0 }} aria-label="Obligación comercial">
                <h3 style={{ marginTop: 0 }}>Obligación financiera</h3>
                <dl className="contracts-grid" style={{ margin: 0 }}>
                  <div><dt>Total comprometido</dt><dd>{formatFinanceMoney(obligation.originalAmount, obligation.currencyCode)}</dd></div>
                  <div><dt>Saldo pendiente</dt><dd>{formatFinanceMoney(obligation.outstandingAmount, obligation.currencyCode)}</dd></div>
                  <div><dt>Moneda</dt><dd>{obligation.currencyCode}</dd></div>
                  <div><dt>Estado</dt><dd>{CONTRACT_OBLIGATION_STATUS_LABELS[obligation.status]}</dd></div>
                  <div><dt>Vencimiento</dt><dd>{formatOptionalDate(obligation.dueDate)}</dd></div>
                  <div><dt>Liquidada</dt><dd>{formatOptionalDate(obligation.settledAt)}</dd></div>
                </dl>
              </section>

              {canRegister && result?.payable ? (
                <div>
                  <button type="button" className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25" onClick={openRegistration}>
                    Registrar abono
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {success ? (
            <section className="card" style={{ margin: 0, borderColor: '#86efac' }} aria-live="polite">
              <h3 style={{ marginTop: 0, color: '#166534' }}>Abono registrado correctamente.</h3>
              <dl className="contracts-grid" style={{ margin: 0 }}>
                <div><dt>Recibo</dt><dd>{success.payment.receiptNumber}</dd></div>
                <div><dt>Monto pagado</dt><dd>{formatFinanceMoney(success.payment.amount, success.payment.currencyCode)}</dd></div>
                <div><dt>Método de pago</dt><dd>{formatFinancePaymentMethod(success.payment.paymentMethod)}</dd></div>
                <div><dt>Nuevo saldo</dt><dd>{formatFinanceMoney(success.obligation.outstandingAmount, success.payment.currencyCode)}</dd></div>
              </dl>
              <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold" onClick={() => void downloadReceipt()} disabled={receiptBusy}>
                {receiptBusy ? 'Descargando…' : 'Descargar recibo'}
              </button>
            </section>
          ) : null}
        </div>
      </div>

      {modalOpen && obligation ? (
        <section className="viewer-modal" role="dialog" aria-modal="true" aria-labelledby="contract-installment-title" onClick={closeRegistration}>
          <div className="viewer-panel" style={{ maxWidth: 640 }} onClick={(event) => event.stopPropagation()}>
            <div className="viewer-head">
              <div>
                <h2 id="contract-installment-title">Registrar abono</h2>
                <p style={{ margin: 0, color: '#4b6790' }}>Saldo pendiente: {formatFinanceMoney(obligation.outstandingAmount, obligation.currencyCode)}</p>
              </div>
              <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold" onClick={closeRegistration} disabled={submitting}>Cerrar</button>
            </div>
            <form className="viewer-body contracts-grid" onSubmit={submitInstallment}>
              <label>
                Monto
                <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
              </label>
              <label>
                Método de pago
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as FinancePaymentMethod | '')} required>
                  <option value="">Seleccione una opción</option>
                  {FINANCE_PAYMENT_METHOD_OPTIONS.map((method) => <option key={method.token} value={method.token}>{method.label}</option>)}
                </select>
              </label>
              <label>
                Fecha de recepción
                <input type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} required />
              </label>
              <label>
                Referencia <span style={{ color: '#64748b' }}>(opcional)</span>
                <input value={externalReference} onChange={(event) => setExternalReference(event.target.value)} />
              </label>
              <label>
                Descripción / nota <span style={{ color: '#64748b' }}>(opcional)</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
              </label>
              {formError ? <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>{formError}</p> : null}
              <div>
                <button type="submit" className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25" disabled={submitting}>
                  {submitting ? 'Registrando…' : 'Registrar abono'}
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : null}
    </section>
  );
}

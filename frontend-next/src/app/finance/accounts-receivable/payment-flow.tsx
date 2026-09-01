'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, WalletCards, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  allocatePayment,
  FinanceApiError,
  formatFinanceMoney,
  getAllocationSuggestion,
  listAccountReceivables,
  registerPayment,
  type AccountReceivableDetail,
  type AccountReceivableListItem,
  type AccountReceivableStatus,
  type AllocationSuggestion,
  type PaymentDetail,
  type PaymentStatus,
  type RegisterPaymentInput,
} from '@/lib/finance-api';
import { formatBusinessDate } from '@/shared/regional';
import styles from './accounts-receivable.module.css';

const CANDIDATE_PAGE_SIZE = 100;
const DECIMAL_TEXT = /^\d+(?:\.\d+)?$/;

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  RECEIVED: 'Recibido',
  PARTIALLY_ALLOCATED: 'Aplicado parcialmente',
  FULLY_ALLOCATED: 'Aplicado por completo',
  CANCELLED: 'Cancelado',
};

const AR_STATUS_LABELS: Record<AccountReceivableStatus, string> = {
  OPEN: 'Abierta',
  PARTIALLY_SETTLED: 'Abonada',
  SETTLED: 'Cancelada',
  CANCELLED: 'Anulada',
};

function localDateTimeValue() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function idempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function detailAsCandidate(detail: AccountReceivableDetail): AccountReceivableListItem {
  return {
    id: detail.id,
    customerId: detail.customerId,
    debtorDisplayName: detail.debtorDisplayName,
    debtorIdentificationType: detail.debtorIdentificationType,
    debtorIdentificationNumber: detail.debtorIdentificationNumber,
    currencyCode: detail.currencyCode,
    originalAmount: detail.originalAmount,
    outstandingAmount: detail.outstandingAmount,
    dueDate: detail.dueDate,
    status: detail.status,
    isOverdue: detail.isOverdue,
    recognizedAt: detail.recognizedAt,
    settledAt: detail.settledAt,
    source: {
      type: detail.sourceType,
      billingDocumentId: detail.sourceType === 'BILLING_DOCUMENT' ? detail.sourceId : null,
      sourceId: detail.sourceId,
      sourceNumber: detail.sourceNumber,
      sourceDocumentType: detail.sourceDocumentType,
    },
  };
}

function PaymentSummary({ payment }: { payment: PaymentDetail }) {
  return (
    <section className={styles.paymentSummary}>
      <div className={styles.paymentSummaryHeader}>
        <div><span>Pago</span><strong>{payment.id}</strong></div>
        <Badge className={styles.paymentStatusBadge} variant="outline">{PAYMENT_STATUS_LABELS[payment.status]}</Badge>
      </div>
      <dl className={styles.paymentFacts}>
        <div><dt>Pagador</dt><dd>{payment.payerDisplayName}</dd></div>
        <div><dt>Cliente</dt><dd>{payment.customerId ?? 'Sin cliente asociado'}</dd></div>
        <div><dt>Identificación</dt><dd>{payment.payerIdentificationNumber ?? '—'}</dd></div>
        <div><dt>Fecha</dt><dd>{formatBusinessDate(payment.receivedAt)}</dd></div>
        <div><dt>Moneda</dt><dd>{payment.currencyCode}</dd></div>
        <div><dt>Monto recibido</dt><dd>{formatFinanceMoney(payment.receivedAmount, payment.currencyCode)}</dd></div>
        <div><dt>Disponible sin aplicar</dt><dd>{formatFinanceMoney(payment.availableAmount, payment.currencyCode)}</dd></div>
        <div><dt>Método</dt><dd>{payment.paymentMethod}</dd></div>
        <div><dt>Referencia</dt><dd>{payment.externalReference ?? '—'}</dd></div>
        <div><dt>Notas</dt><dd>{payment.description ?? '—'}</dd></div>
      </dl>
    </section>
  );
}

function PaymentAllocations({ payment }: { payment: PaymentDetail }) {
  if (payment.allocations.length === 0) return <p className={styles.paymentEmpty}>Este pago todavía no tiene aplicaciones.</p>;
  return (
    <div className={styles.paymentAllocationList}>{payment.allocations.map((allocation) => (
      <article className={styles.paymentAllocation} key={allocation.id}>
        <div className={styles.paymentAllocationHeader}>
          <div><span>Cuenta por cobrar</span><strong>{allocation.accountReceivableId}</strong></div>
          <Badge className={allocation.status === 'ACTIVE' ? styles.activeBadge : styles.reversedBadge} variant="outline">{allocation.status === 'ACTIVE' ? 'Activa' : 'Revertida'}</Badge>
        </div>
        <dl className={styles.paymentFacts}>
          <div><dt>Monto aplicado</dt><dd>{formatFinanceMoney(allocation.amount, payment.currencyCode)}</dd></div>
          <div><dt>Saldo actual CxC</dt><dd>{formatFinanceMoney(allocation.accountReceivable.outstandingAmount, allocation.accountReceivable.currencyCode)}</dd></div>
          <div><dt>Estado actual CxC</dt><dd>{AR_STATUS_LABELS[allocation.accountReceivable.status]}</dd></div>
          <div><dt>Fecha de aplicación</dt><dd>{formatBusinessDate(allocation.allocatedAt)}</dd></div>
        </dl>
        {allocation.reversal && <div className={styles.reversalHistory}><strong>Reversión registrada</strong><p>{allocation.reversal.reason} · {formatBusinessDate(allocation.reversal.reversedAt)}</p></div>}
      </article>
    ))}</div>
  );
}

type PaymentFlowProps = {
  receivable?: AccountReceivableDetail;
  initialPayment?: PaymentDetail;
  canAllocate?: boolean;
  onClose: () => void;
  onAllocated: () => void;
};

export function PaymentFlow({ receivable, initialPayment, canAllocate = true, onClose, onAllocated }: PaymentFlowProps) {
  const [registrationKey] = useState(() => idempotencyKey('finance-payment'));
  const allocationKeys = useRef(new Map<string, string>());
  const requestedSuggestions = useRef(new Set<string>());
  const [payment, setPayment] = useState<PaymentDetail | null>(initialPayment ?? null);
  const [payerDisplayName, setPayerDisplayName] = useState(receivable?.debtorDisplayName ?? '');
  const [receivedAt, setReceivedAt] = useState(localDateTimeValue);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<RegisterPaymentInput['paymentMethod']>('BANK_TRANSFER');
  const [externalReference, setExternalReference] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidateResult, setCandidateResult] = useState<Awaited<ReturnType<typeof listAccountReceivables>> | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>(receivable ? { [receivable.id]: true } : {});
  const [amounts, setAmounts] = useState<Record<string, string>>(receivable ? { [receivable.id]: '' } : {});
  const [allocationComplete, setAllocationComplete] = useState(false);
  const [suggestionPaymentId, setSuggestionPaymentId] = useState<string | null>(initialPayment && receivable ? initialPayment.id : null);
  const [initiatingSuggestion, setInitiatingSuggestion] = useState<AllocationSuggestion | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  useEffect(() => {
    if (!payment || !canAllocate || allocationComplete) return;
    if (receivable && suggestionPaymentId && (!initiatingSuggestion || !initiatingSuggestion.hasRemainingAfterSuggestion)) return;
    const controller = new AbortController();
    setCandidatesLoading(true);
    listAccountReceivables({
      page: candidatePage,
      pageSize: CANDIDATE_PAGE_SIZE,
      ...(payment.customerId ? { customerId: payment.customerId } : {}),
      currency: payment.currencyCode,
    }, controller.signal)
      .then(setCandidateResult)
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar las cuentas candidatas.');
      })
      .finally(() => { if (!controller.signal.aborted) setCandidatesLoading(false); });
    return () => controller.abort();
  }, [allocationComplete, canAllocate, candidatePage, initiatingSuggestion, payment, receivable, suggestionPaymentId]);

  useEffect(() => {
    if (!suggestionPaymentId || !receivable || allocationComplete) return;
    if (requestedSuggestions.current.has(suggestionPaymentId)) return;
    requestedSuggestions.current.add(suggestionPaymentId);
    const controller = new AbortController();
    setSuggestionLoading(true);
    setSuggestionError(null);
    getAllocationSuggestion(suggestionPaymentId, receivable.id, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setInitiatingSuggestion(response);
        setAmounts((current) => ({ ...current, [receivable.id]: response.suggestedAmount }));
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setSuggestionError(requestError instanceof Error ? requestError.message : 'No se pudo obtener la sugerencia de aplicación.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setSuggestionLoading(false); });
    return () => controller.abort();
  }, [allocationComplete, receivable, suggestionPaymentId]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const candidates = useMemo(() => {
    const rows = candidateResult?.accountReceivables ?? [];
    const selectedReceivable = receivable ? detailAsCandidate(receivable) : null;
    if (!selectedReceivable) return rows;
    if (initiatingSuggestion && !initiatingSuggestion.hasRemainingAfterSuggestion) return [selectedReceivable];
    return [selectedReceivable, ...rows.filter((row) => row.id !== selectedReceivable.id)];
  }, [candidateResult, initiatingSuggestion, receivable]);

  async function submitRegistration(event: FormEvent) {
    event.preventDefault();
    if (!receivable) return;
    setError(null);
    if (!payerDisplayName.trim() || !receivedAt || !DECIMAL_TEXT.test(receivedAmount.trim())) {
      setError('Complete el pagador, la fecha y un monto decimal válido.');
      return;
    }
    setSubmitting(true);
    try {
      const identification = receivable.debtorIdentificationType && receivable.debtorIdentificationNumber
        ? { payerIdentificationType: receivable.debtorIdentificationType, payerIdentificationNumber: receivable.debtorIdentificationNumber }
        : {};
      const response = await registerPayment({
        registrationDeduplicationKey: registrationKey,
        payerDisplayName: payerDisplayName.trim(),
        currencyCode: receivable.currencyCode,
        receivedAmount: receivedAmount.trim(),
        receivedAt: new Date(receivedAt).toISOString(),
        paymentMethod,
        ...(receivable.customerId ? { customerId: receivable.customerId } : {}),
        ...identification,
        ...(externalReference.trim() ? { externalReference: externalReference.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setPayment(response);
      setSuggestionPaymentId(response.id);
    } catch (requestError) {
      setError(requestError instanceof FinanceApiError ? requestError.message : 'No se pudo registrar el pago.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitAllocations(event: FormEvent) {
    event.preventDefault();
    if (!payment) return;
    setError(null);
    const intent = Object.keys(selected)
      .filter((id) => selected[id])
      .map((id) => ({ id, amount: (amounts[id] ?? '').trim() }));
    if (intent.length === 0 || intent.some((item) => !DECIMAL_TEXT.test(item.amount))) {
      setError('Seleccione al menos una cuenta e indique cada monto como valor decimal.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await allocatePayment(payment.id, {
        allocations: intent.map((item) => {
          if (!allocationKeys.current.has(item.id)) allocationKeys.current.set(item.id, idempotencyKey(`finance-allocation-${payment.id}`));
          return {
            accountReceivableId: item.id,
            amount: item.amount,
            allocationDeduplicationKey: allocationKeys.current.get(item.id)!,
          };
        }),
      });
      setPayment(response);
      setAllocationComplete(true);
      onAllocated();
    } catch (requestError) {
      setError(requestError instanceof FinanceApiError ? requestError.message : 'No se pudo aplicar el pago.');
    } finally {
      setSubmitting(false);
    }
  }

  const contextName = receivable?.debtorDisplayName ?? payment?.payerDisplayName ?? 'Pago';
  const contextReference = receivable?.sourceNumber ?? receivable?.id ?? payment?.id ?? '—';
  const contextCurrency = receivable?.currencyCode ?? payment?.currencyCode ?? '—';
  const title = !payment ? 'Registrar pago / abono' : canAllocate ? 'Aplicar pago / abono' : 'Detalle del pago';
  const hasAuthoritativeAvailableMoney = payment?.status === 'RECEIVED' || payment?.status === 'PARTIALLY_ALLOCATED';
  const awaitingInitiatingSuggestion = Boolean(receivable && suggestionPaymentId && !initiatingSuggestion && !suggestionError);

  function continueAllocating() {
    setAllocationComplete(false);
    setSelected({});
    setAmounts({});
    allocationKeys.current = new Map();
    setCandidatePage(1);
    setCandidateResult(null);
    setInitiatingSuggestion(null);
    setSuggestionError(null);
    setSuggestionPaymentId(null);
  }

  return (
    <>
      <button className={styles.paymentBackdrop} type="button" aria-label="Cerrar pago" onClick={onClose} />
      <section className={styles.paymentModal} role="dialog" aria-modal="true" aria-labelledby="payment-flow-title">
        <header className={styles.paymentModalHeader}>
          <div><p>Finanzas · Cuentas por cobrar</p><h2 id="payment-flow-title">{title}</h2></div>
          <Button className={styles.closeButton} size="icon" variant="ghost" type="button" aria-label="Cerrar" onClick={onClose}><X aria-hidden="true" /></Button>
        </header>
        <div className={styles.paymentModalBody}>
          <section className={styles.paymentContext}>
            <div><span>Deudor / pagador</span><strong>{contextName}</strong></div>
            <div><span>{receivable ? 'Cuenta seleccionada' : 'Pago existente'}</span><strong>{contextReference}</strong></div>
            <div><span>Moneda</span><strong>{contextCurrency}</strong></div>
          </section>
          {error && <div className={styles.paymentError} role="alert"><AlertCircle aria-hidden="true" /><span>{error}</span></div>}
          {!payment && receivable ? (
            <form className={styles.paymentForm} onSubmit={submitRegistration}>
              <div className={styles.paymentFormGrid}>
                <label><span>Pagador</span><input value={payerDisplayName} maxLength={500} required onChange={(event) => setPayerDisplayName(event.target.value)} /></label>
                <label><span>Fecha del pago</span><input type="datetime-local" value={receivedAt} required onChange={(event) => setReceivedAt(event.target.value)} /></label>
                <label><span>Moneda</span><input value={receivable.currencyCode} readOnly /></label>
                <label><span>Monto recibido</span><input inputMode="decimal" maxLength={100} placeholder="0.00" value={receivedAmount} required onChange={(event) => setReceivedAmount(event.target.value)} /></label>
                <label><span>Método de pago</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as RegisterPaymentInput['paymentMethod'])}><option value="CASH">Efectivo</option><option value="BANK_TRANSFER">Transferencia bancaria</option><option value="CARD">Tarjeta</option><option value="CHECK">Cheque</option><option value="MOBILE_TRANSFER">Transferencia móvil</option><option value="OTHER">Otro</option></select></label>
                <label><span>Referencia externa</span><input value={externalReference} maxLength={150} onChange={(event) => setExternalReference(event.target.value)} /></label>
              </div>
              <label className={styles.paymentNotes}><span>Notas</span><textarea value={description} maxLength={500} rows={3} onChange={(event) => setDescription(event.target.value)} /></label>
              <div className={styles.paymentActions}><Button className={styles.secondaryAction} variant="outline" type="button" onClick={onClose}>Cancelar</Button><Button className={styles.primaryAction} disabled={submitting} type="submit"><WalletCards aria-hidden="true" />{submitting ? 'Registrando…' : 'Registrar pago'}</Button></div>
            </form>
          ) : !payment ? null : !canAllocate ? (
            <div className={styles.paymentResult}>
              <PaymentSummary payment={payment} />
              <section className={styles.paymentResultSection}><h3>Aplicaciones e historial</h3><PaymentAllocations payment={payment} /></section>
              <div className={styles.paymentActions}><Button className={styles.secondaryAction} variant="outline" type="button" onClick={onClose}>Cerrar</Button></div>
            </div>
          ) : allocationComplete ? (
            <div className={styles.paymentResult}>
              <div className={styles.paymentSuccess}><CheckCircle2 aria-hidden="true" /><div><strong>Aplicación registrada</strong><p>Los saldos y estados mostrados son la respuesta actual del backend.</p></div></div>
              <PaymentSummary payment={payment} />
              <section className={styles.paymentResultSection}><h3>Aplicaciones e historial</h3><PaymentAllocations payment={payment} /></section>
              <div className={styles.paymentActions}>{hasAuthoritativeAvailableMoney && <Button className={styles.secondaryAction} variant="outline" type="button" onClick={continueAllocating}>Continuar aplicando saldo</Button>}<Button className={styles.primaryAction} type="button" onClick={onClose}>Cerrar</Button></div>
            </div>
          ) : (
            <form className={styles.allocationForm} onSubmit={submitAllocations}>
              <PaymentSummary payment={payment} />
              <div className={styles.allocationHeading}><div><h3>Seleccione cuentas por cobrar</h3><p>Indique los montos que desea solicitar al backend. La validación financiera se realiza al enviar.</p></div></div>
              {(suggestionLoading || awaitingInitiatingSuggestion) && <div className={styles.paymentEmpty}>Cargando sugerencia del backend para la cuenta inicial…</div>}
              {suggestionError && <div className={styles.paymentError} role="alert"><AlertCircle aria-hidden="true" /><span>{suggestionError} Puede ingresar un monto manual y solicitar la validación al backend.</span></div>}
              {initiatingSuggestion && <div className={styles.remainingBalance}><strong>{initiatingSuggestion.hasRemainingAfterSuggestion ? 'Saldo disponible después de esta sugerencia' : 'La sugerencia utiliza el saldo disponible para esta confirmación'}</strong>{initiatingSuggestion.hasRemainingAfterSuggestion && <span>{formatFinanceMoney(initiatingSuggestion.remainingAfterSuggestion, initiatingSuggestion.currencyCode)}</span>}</div>}
              {awaitingInitiatingSuggestion ? null : candidatesLoading ? <div className={styles.paymentEmpty}>Cargando cuentas candidatas…</div> : candidates.length === 0 ? <div className={styles.paymentEmpty}>No hay cuentas por cobrar en esta página.</div> : (
                <div className={styles.candidateList}>{candidates.map((candidate) => (
                  <article className={styles.candidate} key={candidate.id}>
                    <label className={styles.candidateSelect}><input type="checkbox" checked={Boolean(selected[candidate.id])} onChange={(event) => setSelected((current) => ({ ...current, [candidate.id]: event.target.checked }))} /><span><strong>{candidate.source.sourceNumber ?? candidate.id}</strong><small>{candidate.debtorDisplayName} · {AR_STATUS_LABELS[candidate.status]}</small></span></label>
                    <div className={styles.candidateBalance}><span>Saldo backend</span><strong>{formatFinanceMoney(candidate.outstandingAmount, candidate.currencyCode)}</strong>{initiatingSuggestion?.accountReceivableId === candidate.id && <div className={styles.candidateSuggestion}><span>Sugerencia del backend</span><strong>{formatFinanceMoney(initiatingSuggestion.suggestedAmount, initiatingSuggestion.currencyCode)}</strong><small>Disponible: {formatFinanceMoney(initiatingSuggestion.paymentAvailableAmount, initiatingSuggestion.currencyCode)} · Saldo CxC: {formatFinanceMoney(initiatingSuggestion.accountReceivableOutstandingAmount, initiatingSuggestion.currencyCode)}</small></div>}</div>
                    <label className={styles.allocationAmount}><span>Monto a aplicar</span><input disabled={!selected[candidate.id]} inputMode="decimal" maxLength={100} placeholder="0.00" value={amounts[candidate.id] ?? ''} onChange={(event) => setAmounts((current) => ({ ...current, [candidate.id]: event.target.value }))} /></label>
                  </article>
                ))}</div>
              )}
              {candidateResult && candidateResult.totalPages > 1 && <nav className={styles.candidatePagination}><Button className={styles.secondaryAction} disabled={candidatePage <= 1} size="sm" type="button" variant="outline" onClick={() => setCandidatePage((value) => Math.max(1, value - 1))}><ChevronLeft aria-hidden="true" />Anterior</Button><span>Página {candidateResult.page} de {candidateResult.totalPages}</span><Button className={styles.secondaryAction} disabled={candidatePage >= candidateResult.totalPages} size="sm" type="button" variant="outline" onClick={() => setCandidatePage((value) => Math.min(candidateResult.totalPages, value + 1))}>Siguiente<ChevronRight aria-hidden="true" /></Button></nav>}
              <section className={styles.paymentResultSection}><h3>Estado actual del pago</h3><PaymentAllocations payment={payment} /></section>
              <div className={styles.paymentActions}><Button className={styles.secondaryAction} variant="outline" type="button" onClick={onClose}>Cerrar</Button><Button className={styles.primaryAction} disabled={submitting} type="submit">{submitting ? 'Aplicando…' : 'Aplicar pago'}</Button></div>
            </form>
          )}
        </div>
      </section>
    </>
  );
}

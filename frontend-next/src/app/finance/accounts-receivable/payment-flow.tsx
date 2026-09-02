'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, Download, Mail, PiggyBank, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  allocatePayment,
  cancelPayment,
  downloadPaymentReceipt,
  FinanceApiError,
  formatFinanceMoney,
  getAllocationSuggestion,
  listAccountReceivables,
  registerPayment,
  registerPaymentAndApply,
  sendPaymentReceipt,
  reversePaymentAllocation,
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

const PAYMENT_METHOD_LABELS: Record<RegisterPaymentInput['paymentMethod'], string> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia bancaria',
  CARD: 'Tarjeta',
  CHECK: 'Cheque',
  MOBILE_TRANSFER: 'Transferencia móvil',
  OTHER: 'Otro',
};

const ALLOCATION_STATUS_LABELS = { ACTIVE: 'Aplicado', REVERSED: 'Revertido' } as const;

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

function PaymentSummary({ payment, onCancel }: { payment: PaymentDetail; onCancel?: () => void }) {
  return (
    <section className={styles.paymentSummary}>
      <div className={styles.paymentSummaryHeader}>
        <div><span>RCP / recibo</span><strong>{payment.receiptNumber}</strong></div>
        <Badge className={styles.paymentStatusBadge} variant="outline">{PAYMENT_STATUS_LABELS[payment.status]}</Badge>
      </div>
      <dl className={styles.paymentFacts}>
        <div><dt>Cliente</dt><dd>{payment.payerDisplayName}</dd></div>
        <div><dt>Identificación</dt><dd>{payment.payerIdentificationNumber ?? '—'}</dd></div>
        <div><dt>Fecha</dt><dd>{formatBusinessDate(payment.receivedAt)}</dd></div>
        <div><dt>Moneda</dt><dd>{payment.currencyCode}</dd></div>
        <div><dt>Monto recibido</dt><dd>{formatFinanceMoney(payment.receivedAmount, payment.currencyCode)}</dd></div>
        <div><dt>Monto aplicado</dt><dd>{formatFinanceMoney(payment.appliedAmount, payment.currencyCode)}</dd></div>
        <div><dt>Saldo disponible</dt><dd>{formatFinanceMoney(payment.availableAmount, payment.currencyCode)}</dd></div>
        <div><dt>Método</dt><dd>{PAYMENT_METHOD_LABELS[payment.paymentMethod as RegisterPaymentInput['paymentMethod']] ?? payment.paymentMethod}</dd></div>
        <div><dt>Referencia</dt><dd>{payment.externalReference ?? '—'}</dd></div>
        <div><dt>Notas</dt><dd>{payment.description ?? '—'}</dd></div>
        {payment.registeredBy && <div><dt>Registrado por</dt><dd>{payment.registeredBy.name} · {formatBusinessDate(payment.registeredBy.at)}</dd></div>}
        {payment.cancelledBy && <div><dt>Cancelado por</dt><dd>{payment.cancelledBy.name} · {payment.cancelledAt ? formatBusinessDate(payment.cancelledAt) : formatBusinessDate(payment.cancelledBy.at)}{payment.cancelledBy.reason ? ` · ${payment.cancelledBy.reason}` : ''}</dd></div>}
      </dl>
      {onCancel && payment.canCancel && <div className={styles.paymentActions}><Button className={styles.secondaryAction} variant="outline" type="button" onClick={onCancel}>Cancelar recibo</Button></div>}
    </section>
  );
}

function PaymentAllocations({ payment, onReverse }: { payment: PaymentDetail; onReverse?: (allocation: PaymentDetail['allocations'][number]) => void }) {
  if (payment.allocations.length === 0) return <p className={styles.paymentEmptyCompact}>Sin aplicaciones registradas.</p>;
  return (
    <div className={styles.paymentAllocationList}>{payment.allocations.map((allocation) => (
      <article className={styles.paymentAllocation} key={allocation.id}>
        <div className={styles.paymentAllocationHeader}>
          <div><span>Factura / cuenta por cobrar</span><strong>{allocation.accountReceivable.sourceNumber ?? allocation.accountReceivable.sourceDocumentType ?? 'Cuenta por cobrar'}</strong></div>
          <Badge className={allocation.status === 'ACTIVE' ? styles.activeBadge : styles.reversedBadge} variant="outline">{ALLOCATION_STATUS_LABELS[allocation.status]}</Badge>
        </div>
        <dl className={styles.paymentFacts}>
          <div><dt>Monto aplicado</dt><dd>{formatFinanceMoney(allocation.amount, payment.currencyCode)}</dd></div>
          <div><dt>Saldo actual CxC</dt><dd>{formatFinanceMoney(allocation.accountReceivable.outstandingAmount, allocation.accountReceivable.currencyCode)}</dd></div>
          <div><dt>Estado actual CxC</dt><dd>{AR_STATUS_LABELS[allocation.accountReceivable.status]}</dd></div>
          <div><dt>Fecha de aplicación</dt><dd>{formatBusinessDate(allocation.allocatedAt)}</dd></div>
          {allocation.appliedBy && <div><dt>Aplicado por</dt><dd>{allocation.appliedBy.name}</dd></div>}
        </dl>
        {allocation.reversal && <div className={styles.reversalHistory}><strong>Revertido</strong><p>{allocation.reversal.reason} · {formatBusinessDate(allocation.reversal.reversedAt)}{allocation.reversal.reversedBy ? ` · ${allocation.reversal.reversedBy.name}` : ''}</p></div>}
        {onReverse && allocation.status === 'ACTIVE' && <div className={styles.paymentActions}><Button className={styles.secondaryAction} variant="outline" type="button" onClick={() => onReverse(allocation)}>Revertir aplicación</Button></div>}
      </article>
    ))}</div>
  );
}

type PaymentFlowProps = {
  receivable?: AccountReceivableDetail;
  customer?: { id: string; name: string; currency: RegisterPaymentInput['currencyCode']; identificationType: string | null; identificationNumber: string | null };
  initialPayment?: PaymentDetail;
  canAllocate?: boolean;
  canManage?: boolean;
  onClose: () => void;
  onAllocated: () => void;
  onCompleted?: (message: string) => void;
};

export function PaymentFlow({ receivable, customer, initialPayment, canAllocate = true, canManage = canAllocate, onClose, onAllocated, onCompleted }: PaymentFlowProps) {
  const [registrationKey] = useState(() => idempotencyKey('finance-payment'));
  const allocationKeys = useRef(new Map<string, string>());
  const requestedSuggestions = useRef(new Set<string>());
  const [payment, setPayment] = useState<PaymentDetail | null>(initialPayment ?? null);
  const [payerDisplayName, setPayerDisplayName] = useState(receivable?.debtorDisplayName ?? customer?.name ?? '');
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
  const [action, setAction] = useState<{ kind: 'reversal'; allocation: PaymentDetail['allocations'][number] } | { kind: 'cancellation' } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [receiptEmailOpen, setReceiptEmailOpen] = useState(false);
  const [receiptTo, setReceiptTo] = useState('');
  const [receiptCc, setReceiptCc] = useState('');
  const [receiptBusy, setReceiptBusy] = useState(false);
  const reversalKey = useRef<string | null>(null);

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
    if (!receivable && !customer) return;
    setError(null);
    if (!payerDisplayName.trim() || !receivedAt || !DECIMAL_TEXT.test(receivedAmount.trim())) {
      setError('Complete el cliente, la fecha y un monto decimal válido.');
      return;
    }
    setSubmitting(true);
    try {
      const identificationType = receivable?.debtorIdentificationType ?? customer?.identificationType;
      const identificationNumber = receivable?.debtorIdentificationNumber ?? customer?.identificationNumber;
      const identification = identificationType && identificationNumber
        ? { payerIdentificationType: identificationType, payerIdentificationNumber: identificationNumber }
        : {};
      const input = {
        registrationDeduplicationKey: registrationKey,
        payerDisplayName: payerDisplayName.trim(),
        currencyCode: receivable?.currencyCode ?? customer!.currency,
        receivedAmount: receivedAmount.trim(),
        receivedAt: new Date(receivedAt).toISOString(),
        paymentMethod,
        ...(receivable?.customerId ? { customerId: receivable.customerId } : customer ? { customerId: customer.id } : {}),
        ...identification,
        ...(externalReference.trim() ? { externalReference: externalReference.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      } satisfies RegisterPaymentInput;
      if (receivable) {
        const response = await registerPaymentAndApply(receivable.id, input);
        onAllocated(); onCompleted?.(`Abono registrado: ${response.payment.receiptNumber} · aplicado ${formatFinanceMoney(response.allocation.amount, receivable.currencyCode)} · disponible ${formatFinanceMoney(response.payment.availableAmount, receivable.currencyCode)}.`); onClose();
      } else {
        const response = await registerPayment(input);
        onAllocated(); onCompleted?.(`Pago registrado: ${response.receiptNumber} · disponible ${formatFinanceMoney(response.availableAmount, response.currencyCode)}.`); onClose();
      }
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

  const contextName = receivable?.debtorDisplayName ?? customer?.name ?? payment?.payerDisplayName ?? 'Pago';
  const contextReference = receivable?.sourceNumber ?? (receivable ? 'Cuenta por cobrar' : payment?.receiptNumber ?? '—');
  const contextCurrency = receivable?.currencyCode ?? customer?.currency ?? payment?.currencyCode ?? '—';
  const title = !payment ? (receivable ? 'Registrar abono' : 'Registrar pago') : canAllocate ? 'Aplicar pago / abono' : 'Detalle del pago';
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

  function startAction(next: typeof action) { setAction(next); setActionReason(''); reversalKey.current = null; }
  async function confirmAction() {
    if (!payment || !actionReason.trim()) { setError('Indique el motivo de la operación.'); return; }
    setSubmitting(true); setError(null);
    try {
      if (action?.kind === 'reversal') {
        reversalKey.current ??= idempotencyKey(`finance-reversal-${action.allocation.id}`);
        const response = await reversePaymentAllocation(action.allocation.id, { reversalDeduplicationKey: reversalKey.current, reason: actionReason.trim() });
        setPayment(response.payment);
      } else if (action?.kind === 'cancellation') {
        setPayment(await cancelPayment(payment.id, { reason: actionReason.trim() }));
      }
      setAction(null); onAllocated();
    } catch (requestError) { setError(requestError instanceof FinanceApiError ? requestError.message : 'No se pudo completar la operación. Actualice el detalle e intente nuevamente.'); }
    finally { setSubmitting(false); }
  }

  async function downloadReceipt() {
    if (!payment) return;
    setReceiptBusy(true); setError(null);
    try { const file = await downloadPaymentReceipt(payment.id); const url = URL.createObjectURL(file.blob); const link = document.createElement('a'); link.href = url; link.download = file.fileName; link.click(); URL.revokeObjectURL(url); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'No se pudo descargar el recibo.'); }
    finally { setReceiptBusy(false); }
  }
  async function sendReceipt(event: FormEvent) {
    event.preventDefault(); if (!payment) return;
    setReceiptBusy(true); setError(null);
    try { const result = await sendPaymentReceipt(payment.id, { ...(receiptTo.trim() ? { to: receiptTo.trim() } : {}), ...(receiptCc.trim() ? { cc: receiptCc.trim() } : {}) }); setReceiptEmailOpen(false); setReceiptTo(''); setReceiptCc(''); onCompleted?.(`Recibo ${payment.receiptNumber} enviado a ${result.sentTo}.`); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'No se pudo enviar el recibo.'); }
    finally { setReceiptBusy(false); }
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
            <div><span>Cliente</span><strong>{contextName}</strong></div>
            {(receivable || payment) && <div><span>{receivable ? 'Cuenta seleccionada' : 'Recibo existente'}</span><strong>{contextReference}</strong></div>}
            <div><span>Moneda</span><strong>{contextCurrency}</strong></div>
            {receivable && <div><span>Saldo pendiente CxC</span><strong className={styles.pendingAmount}>{formatFinanceMoney(receivable.outstandingAmount, receivable.currencyCode)}</strong></div>}
          </section>
          {error && <div className={styles.paymentError} role="alert"><AlertCircle aria-hidden="true" /><span>{error}</span></div>}
          {payment && <div className={styles.paymentActions}><Button className={styles.secondaryAction} disabled={receiptBusy} variant="outline" type="button" onClick={() => void downloadReceipt()}><Download aria-hidden="true" />{receiptBusy ? 'Procesando…' : 'Descargar recibo'}</Button><Button className={styles.secondaryAction} disabled={receiptBusy} variant="outline" type="button" onClick={() => setReceiptEmailOpen(true)}><Mail aria-hidden="true" />Enviar recibo</Button></div>}
          {!payment && (receivable || customer) ? (
            <form className={styles.paymentForm} onSubmit={submitRegistration}>
              <div className={styles.paymentFormGrid}>
                <label><span>Cliente</span><input value={payerDisplayName} maxLength={500} required onChange={(event) => setPayerDisplayName(event.target.value)} /></label>
                <label><span>Fecha del pago</span><input type="datetime-local" value={receivedAt} required onChange={(event) => setReceivedAt(event.target.value)} /></label>
                <label><span>Moneda</span><input value={contextCurrency} readOnly /></label>
                <label><span>Monto recibido</span><input inputMode="decimal" maxLength={100} placeholder="0.00" value={receivedAmount} required onChange={(event) => setReceivedAmount(event.target.value)} /></label>
                <label><span>Método de pago</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as RegisterPaymentInput['paymentMethod'])}><option value="CASH">Efectivo</option><option value="BANK_TRANSFER">Transferencia bancaria</option><option value="CARD">Tarjeta</option><option value="CHECK">Cheque</option><option value="MOBILE_TRANSFER">Transferencia móvil</option><option value="OTHER">Otro</option></select></label>
                <label><span>Referencia externa</span><input value={externalReference} maxLength={150} onChange={(event) => setExternalReference(event.target.value)} /></label>
              </div>
              <label className={styles.paymentNotes}><span>Notas</span><textarea value={description} maxLength={500} rows={3} onChange={(event) => setDescription(event.target.value)} /></label>
              <div className={styles.paymentActions}><Button className={styles.secondaryAction} variant="outline" type="button" onClick={onClose}>Cancelar</Button><Button className={styles.primaryAction} disabled={submitting} type="submit">{receivable ? <CircleDollarSign aria-hidden="true" /> : <PiggyBank aria-hidden="true" />}{submitting ? 'Registrando…' : receivable ? 'Registrar abono' : 'Registrar pago'}</Button></div>
            </form>
          ) : !payment ? null : !canAllocate ? (
            <div className={styles.paymentResult}>
              <PaymentSummary payment={payment} onCancel={canManage ? () => startAction({ kind: 'cancellation' }) : undefined} />
              <section className={styles.paymentResultSection}><h3>Pagos / abonos aplicados</h3><PaymentAllocations payment={payment} onReverse={canManage ? (allocation) => startAction({ kind: 'reversal', allocation }) : undefined} /></section>
              <div className={styles.paymentActions}><Button className={styles.secondaryAction} variant="outline" type="button" onClick={onClose}>Cerrar</Button></div>
            </div>
          ) : allocationComplete ? (
            <div className={styles.paymentResult}>
              <div className={styles.paymentSuccess}><CheckCircle2 aria-hidden="true" /><div><strong>Aplicación registrada</strong><p>Los saldos y estados mostrados corresponden al estado financiero actual.</p></div></div>
              <PaymentSummary payment={payment} onCancel={canManage ? () => startAction({ kind: 'cancellation' }) : undefined} />
              <section className={styles.paymentResultSection}><h3>Pagos / abonos aplicados</h3><PaymentAllocations payment={payment} onReverse={canManage ? (allocation) => startAction({ kind: 'reversal', allocation }) : undefined} /></section>
              <div className={styles.paymentActions}>{hasAuthoritativeAvailableMoney && <Button className={styles.secondaryAction} variant="outline" type="button" onClick={continueAllocating}>Continuar aplicando saldo</Button>}<Button className={styles.primaryAction} type="button" onClick={onClose}>Cerrar</Button></div>
            </div>
          ) : (
            <form className={styles.allocationForm} onSubmit={submitAllocations}>
              <PaymentSummary payment={payment} onCancel={canManage ? () => startAction({ kind: 'cancellation' }) : undefined} />
              <div className={styles.allocationHeading}><div><h3>Seleccione cuentas por cobrar</h3><p>Indique los montos que desea aplicar. La validación financiera se realiza al confirmar.</p></div></div>
              {(suggestionLoading || awaitingInitiatingSuggestion) && <div className={styles.paymentEmpty}>Cargando monto sugerido para la cuenta inicial…</div>}
              {suggestionError && <div className={styles.paymentError} role="alert"><AlertCircle aria-hidden="true" /><span>{suggestionError} Puede ingresar un monto manual y solicitar la validación financiera.</span></div>}
              {initiatingSuggestion && <div className={styles.remainingBalance}><strong>{initiatingSuggestion.hasRemainingAfterSuggestion ? 'Saldo disponible después de esta sugerencia' : 'La sugerencia utiliza el saldo disponible para esta confirmación'}</strong>{initiatingSuggestion.hasRemainingAfterSuggestion && <span>{formatFinanceMoney(initiatingSuggestion.remainingAfterSuggestion, initiatingSuggestion.currencyCode)}</span>}</div>}
              {awaitingInitiatingSuggestion ? null : candidatesLoading ? <div className={styles.paymentEmpty}>Cargando cuentas candidatas…</div> : candidates.length === 0 ? <div className={styles.paymentEmpty}>No hay cuentas por cobrar en esta página.</div> : (
                <div className={styles.candidateList}>{candidates.map((candidate) => (
                  <article className={styles.candidate} key={candidate.id}>
                    <label className={styles.candidateSelect}><input type="checkbox" checked={Boolean(selected[candidate.id])} onChange={(event) => setSelected((current) => ({ ...current, [candidate.id]: event.target.checked }))} /><span><strong>{candidate.source.sourceNumber ?? candidate.source.sourceDocumentType ?? 'Cuenta por cobrar'}</strong><small>{candidate.debtorDisplayName} · {AR_STATUS_LABELS[candidate.status]}</small></span></label>
                    <div className={styles.candidateBalance}><span>Saldo disponible</span><strong>{formatFinanceMoney(candidate.outstandingAmount, candidate.currencyCode)}</strong>{initiatingSuggestion?.accountReceivableId === candidate.id && <div className={styles.candidateSuggestion}><span>Monto sugerido</span><strong>{formatFinanceMoney(initiatingSuggestion.suggestedAmount, initiatingSuggestion.currencyCode)}</strong><small>Disponible {formatFinanceMoney(initiatingSuggestion.paymentAvailableAmount, initiatingSuggestion.currencyCode)} · Pendiente {formatFinanceMoney(initiatingSuggestion.accountReceivableOutstandingAmount, initiatingSuggestion.currencyCode)}</small></div>}</div>
                    <label className={styles.allocationAmount}><span>Monto a aplicar</span><input disabled={!selected[candidate.id]} inputMode="decimal" maxLength={100} placeholder="0.00" value={amounts[candidate.id] ?? ''} onChange={(event) => setAmounts((current) => ({ ...current, [candidate.id]: event.target.value }))} /></label>
                  </article>
                ))}</div>
              )}
              {candidateResult && candidateResult.totalPages > 1 && <nav className={styles.candidatePagination}><Button className={styles.secondaryAction} disabled={candidatePage <= 1} size="sm" type="button" variant="outline" onClick={() => setCandidatePage((value) => Math.max(1, value - 1))}><ChevronLeft aria-hidden="true" />Anterior</Button><span>Página {candidateResult.page} de {candidateResult.totalPages}</span><Button className={styles.secondaryAction} disabled={candidatePage >= candidateResult.totalPages} size="sm" type="button" variant="outline" onClick={() => setCandidatePage((value) => Math.min(candidateResult.totalPages, value + 1))}>Siguiente<ChevronRight aria-hidden="true" /></Button></nav>}
              <section className={styles.paymentResultSection}><h3>Pagos / abonos aplicados</h3><PaymentAllocations payment={payment} onReverse={canManage ? (allocation) => startAction({ kind: 'reversal', allocation }) : undefined} /></section>
              <div className={styles.paymentActions}><Button className={styles.secondaryAction} variant="outline" type="button" onClick={onClose}>Cerrar</Button><Button className={styles.primaryAction} disabled={submitting} type="submit">{submitting ? 'Aplicando…' : 'Confirmar aplicación'}</Button></div>
            </form>
          )}
        </div>
      </section>
      {action && <><button className={styles.paymentBackdrop} type="button" aria-label="Cerrar confirmación" onClick={() => setAction(null)} /><section className={styles.decisionModal} role="dialog" aria-modal="true" aria-label={action.kind === 'reversal' ? 'Confirmar reversión' : 'Confirmar cancelación'}><header className={styles.paymentModalHeader}><div><p>Finanzas · confirmación</p><h2>{action.kind === 'reversal' ? 'Revertir aplicación' : 'Cancelar recibo'}</h2></div></header><div className={styles.paymentModalBody}>{action.kind === 'reversal' ? <><p className={styles.decisionCopy}>Se revertirá {formatFinanceMoney(action.allocation.amount, payment?.currencyCode ?? '')} de {payment?.receiptNumber} hacia {action.allocation.accountReceivable.sourceNumber ?? 'la cuenta por cobrar'}. Los saldos autorizados se restaurarán.</p><Badge className={styles.activeBadge} variant="outline">{ALLOCATION_STATUS_LABELS[action.allocation.status]}</Badge></> : <p className={styles.decisionCopy}>Se cancelará el recibo {payment?.receiptNumber} por {payment && formatFinanceMoney(payment.receivedAmount, payment.currencyCode)}. Esto no cancela ninguna factura.</p>}<label className={styles.paymentNotes}><span>Motivo</span><textarea rows={3} maxLength={500} value={actionReason} onChange={(event) => { setActionReason(event.target.value); if (action.kind === 'reversal') reversalKey.current = null; }} /></label><div className={styles.paymentActions}><Button className={styles.secondaryAction} variant="outline" type="button" onClick={() => setAction(null)}>Volver</Button><Button className={styles.primaryAction} disabled={submitting} type="button" onClick={() => void confirmAction()}>{submitting ? 'Confirmando…' : action.kind === 'reversal' ? 'Confirmar reversión' : 'Confirmar cancelación'}</Button></div></div></section></>}
      {receiptEmailOpen && <><button className={styles.paymentBackdrop} type="button" aria-label="Cerrar envío de recibo" onClick={() => setReceiptEmailOpen(false)} /><section className={styles.decisionModal} role="dialog" aria-modal="true" aria-label="Enviar recibo"><header className={styles.paymentModalHeader}><div><p>Finanzas · recibo</p><h2>Enviar recibo</h2></div></header><form className={styles.paymentModalBody} onSubmit={sendReceipt}><p className={styles.decisionCopy}>Se enviará el PDF actualizado de {payment?.receiptNumber}.</p><div className={styles.paymentFormGrid}><label><span>Destinatario</span><input type="email" value={receiptTo} onChange={(event) => setReceiptTo(event.target.value)} placeholder="Correo del cliente" /></label><label><span>CC</span><input type="email" value={receiptCc} onChange={(event) => setReceiptCc(event.target.value)} placeholder="Opcional" /></label></div><div className={styles.paymentActions}><Button className={styles.secondaryAction} variant="outline" type="button" onClick={() => setReceiptEmailOpen(false)}>Cancelar</Button><Button className={styles.primaryAction} disabled={receiptBusy} type="submit">{receiptBusy ? 'Enviando…' : 'Enviar recibo'}</Button></div></form></section></>}
    </>
  );
}

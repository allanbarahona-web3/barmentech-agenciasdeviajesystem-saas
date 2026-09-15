'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, CircleDollarSign, Download, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatContractPaymentPurpose, formatContractPaymentStatus } from '@/features/contracts-finance/contract-payment-labels';
import { buildContractInstallmentRequest, canRegisterContractInstallments, CONTRACT_OBLIGATION_STATUS_LABELS, createContractInstallmentDeduplicationKey, installmentFormError } from '@/features/contracts-finance/contract-installment';
import { getStoredSession } from '@/lib/auth-api';
import { downloadPaymentReceipt, FinanceApiError, formatFinanceMoney, getContractCommercialObligation, getCustomerContractFinancialDetail, listContractPayments, registerContractInstallment, type CommercialObligationStatus, type ContractObligationPortfolioItem, type ContractPaymentsPage } from '@/lib/finance-api';
import { FINANCE_PAYMENT_METHOD_OPTIONS, formatFinancePaymentMethod, type FinancePaymentMethod } from '@/lib/finance-payment-methods';
import { formatBusinessDate } from '@/shared/regional';
import styles from '@/app/finance/accounts-receivable/accounts-receivable.module.css';

const PAYMENT_PAGE_SIZE = 10;

export type ContractFinanceDrawerContract = Pick<ContractObligationPortfolioItem, 'contractId' | 'contractNumber' | 'travelLabel'> & Partial<Omit<ContractObligationPortfolioItem, 'contractId' | 'contractNumber' | 'travelLabel'>>;

type FiscalDocumentPresentation = { kind: 'PENDING' | 'PROCESSING' | 'ACCEPTED' | 'REJECTED'; label: string };

function statusClass(status: CommercialObligationStatus) {
  if (status === 'OPEN') return styles.openBadge;
  if (status === 'PARTIALLY_SETTLED') return styles.partialBadge;
  if (status === 'SETTLED') return styles.settledBadge;
  return styles.cancelledBadge;
}

function localDateTimeValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function formatOptionalBusinessDate(value: string | null | undefined): string {
  return value ? formatBusinessDate(value) : '—';
}

function travelContextLabel(contract: ContractFinanceDrawerContract): string | null {
  const context = contract.travelContext;
  const values = [
    context?.destination,
    context?.travelType,
    contract.startDate && contract.endDate ? `${formatBusinessDate(contract.startDate)} – ${formatBusinessDate(contract.endDate)}` : contract.startDate ? formatBusinessDate(contract.startDate) : null,
  ].filter((value): value is string => Boolean(value));
  return values.length ? values.join(' · ') : null;
}

function fiscalDocumentPresentation(fiscalDocument: ContractPaymentsPage['items'][number]['fiscalDocument']): FiscalDocumentPresentation {
  if (!fiscalDocument) return { kind: 'PENDING', label: 'Factura electrónica pendiente' };
  if (fiscalDocument.taxAuthorityStatus === 'ACCEPTED') return { kind: 'ACCEPTED', label: 'Factura aceptada' };
  if (fiscalDocument.taxAuthorityStatus === 'REJECTED' || fiscalDocument.lifecycleStatus === 'CANCELLED') return { kind: 'REJECTED', label: fiscalDocument.taxAuthorityStatus === 'REJECTED' ? 'Factura rechazada' : 'Factura cancelada' };
  if (fiscalDocument.providerStatus === 'FAILED') return { kind: 'REJECTED', label: 'Factura con error de emisión' };
  if (fiscalDocument.lifecycleStatus === 'DRAFT') return { kind: 'PENDING', label: 'Preparando factura' };
  if (fiscalDocument.lifecycleStatus === 'CONFIRMED') return { kind: 'PROCESSING', label: 'Emisión solicitada' };
  return { kind: 'PROCESSING', label: fiscalDocument.lifecycleStatus === 'SUBMITTED' ? 'Factura enviada' : 'Factura electrónica en proceso' };
}

function fiscalDocumentStatusClass(kind: FiscalDocumentPresentation['kind']): string {
  if (kind === 'ACCEPTED') return styles.settledBadge;
  if (kind === 'REJECTED') return styles.cancelledBadge;
  if (kind === 'PROCESSING') return styles.partialBadge;
  return styles.openBadge;
}

function fiscalDocumentHref(fiscalDocument: NonNullable<ContractPaymentsPage['items'][number]['fiscalDocument']>): string {
  const documentId = encodeURIComponent(fiscalDocument.id);
  return fiscalDocument.taxAuthorityStatus === 'ACCEPTED' ? `/fiscal-billing/invoices/${documentId}` : `/fiscal-billing/documents/${documentId}`;
}

export function ContractInstallmentForm({ contractId, outstandingAmount, onSuccess }: { contractId: string; outstandingAmount: string; onSuccess: () => void | Promise<void> }) {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod | ''>('');
  const [receivedAt, setReceivedAt] = useState(localDateTimeValue);
  const [externalReference, setExternalReference] = useState('');
  const [description, setDescription] = useState('');
  const [registrationDeduplicationKey] = useState(() => createContractInstallmentDeduplicationKey());
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submitInstallment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paymentMethod) return;
    const validationError = installmentFormError({ amount, paymentMethod, receivedAt, outstandingAmount });
    if (validationError) { setFormError(validationError); return; }
    setSubmitting(true); setFormError(null);
    try {
      await registerContractInstallment(contractId, buildContractInstallmentRequest({ registrationDeduplicationKey, amount, receivedAt, paymentMethod, externalReference, description }));
      await onSuccess();
    } catch (requestError) {
      setFormError(requestError instanceof FinanceApiError || requestError instanceof Error ? requestError.message : 'No se pudo registrar el abono.');
    } finally { setSubmitting(false); }
  };

  return <form className={styles.paymentForm} onSubmit={submitInstallment}>
    <div className={styles.paymentFormGrid}>
      <label>Monto<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
      <label>Método de pago<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as FinancePaymentMethod | '')} required><option value="">Seleccione una opción</option>{FINANCE_PAYMENT_METHOD_OPTIONS.map((method) => <option key={method.token} value={method.token}>{method.label}</option>)}</select></label>
      <label>Fecha de recepción<input type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} required /></label>
      <label>Referencia <span className={styles.optionalField}>(opcional)</span><input value={externalReference} onChange={(event) => setExternalReference(event.target.value)} /></label>
    </div>
    <label className={styles.paymentNotes}>Descripción / nota <span className={styles.optionalField}>(opcional)</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label>
    {formError ? <div className={styles.inlineError} role="alert"><AlertCircle aria-hidden="true" /><span>{formError}</span></div> : null}
    <div className={styles.paymentActions}><Button className={styles.primaryAction} type="submit" disabled={submitting}>{submitting ? 'Registrando…' : 'Confirmar abono'}</Button></div>
  </form>;
}

export function ContractFinanceDrawer({ contract, customerId, canWrite, onClose, onChanged, onReturnToCustomer }: { contract: ContractFinanceDrawerContract; customerId?: string; canWrite: boolean; onClose: () => void; onChanged: () => void; onReturnToCustomer?: () => void }) {
  const [obligationResult, setObligationResult] = useState<Awaited<ReturnType<typeof getContractCommercialObligation>> | null>(null);
  const [paymentsResult, setPaymentsResult] = useState<ContractPaymentsPage | null>(null);
  const [paymentPage, setPaymentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInstallmentForm, setShowInstallmentForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [receiptBusyId, setReceiptBusyId] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      if (customerId) {
        const detail = await getCustomerContractFinancialDetail(customerId, contract.contractId, { page: paymentPage, pageSize: PAYMENT_PAGE_SIZE }, signal);
        if (!signal?.aborted) {
          setObligationResult({ contractId: detail.contract.contractId, commercialObligation: detail.commercialObligation, payable: detail.payable });
          setPaymentsResult(detail.payments);
          if (detail.payments.totalPages > 0 && paymentPage > detail.payments.totalPages) setPaymentPage(detail.payments.totalPages);
        }
      } else {
        const [obligation, payments] = await Promise.all([getContractCommercialObligation(contract.contractId, signal), listContractPayments(contract.contractId, { page: paymentPage, pageSize: PAYMENT_PAGE_SIZE }, signal)]);
        if (!signal?.aborted) { setObligationResult(obligation); setPaymentsResult(payments); if (payments.totalPages > 0 && paymentPage > payments.totalPages) setPaymentPage(payments.totalPages); }
      }
    } catch (requestError) {
      if (!signal?.aborted) setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el detalle financiero del contrato.');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [contract.contractId, customerId, paymentPage]);

  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  useEffect(() => { const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', closeOnEscape); return () => window.removeEventListener('keydown', closeOnEscape); }, [onClose]);

  const commercialObligation = obligationResult?.commercialObligation;
  const currencyCode = commercialObligation?.currencyCode ?? contract.currencyCode;
  const effectiveStatus = commercialObligation?.status ?? contract.status;
  const effectiveOriginal = commercialObligation?.originalAmount ?? contract.originalAmount;
  const effectivePaid = commercialObligation?.paidAmount ?? contract.paidAmount;
  const effectiveOutstanding = commercialObligation?.outstandingAmount ?? contract.outstandingAmount;
  const effectiveDueDate = commercialObligation?.dueDate ?? contract.dueDate;
  const effectiveSettledAt = commercialObligation?.settledAt ?? contract.settledAt;
  const canRegister = canWrite && canRegisterContractInstallments(getStoredSession()?.user.role) && obligationResult?.payable === true;

  const handleInstallmentSuccess = async () => { setNotice('Abono registrado correctamente. La información financiera fue actualizada.'); setShowInstallmentForm(false); await refresh(); onChanged(); };
  const downloadReceipt = async (paymentId: string) => {
    setReceiptBusyId(paymentId); setError(null);
    try { const file = await downloadPaymentReceipt(paymentId); const url = URL.createObjectURL(file.blob); const link = document.createElement('a'); link.href = url; link.download = file.fileName; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'No se pudo descargar el recibo.'); }
    finally { setReceiptBusyId(null); }
  };

  return <>
    <button className={styles.drawerBackdrop} type="button" aria-label="Cerrar detalle financiero" onClick={onClose} />
    <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="contract-finance-detail-title">
      <header className={styles.drawerHeader}><div><p>Contrato · Finanzas</p><h2 id="contract-finance-detail-title">Detalle financiero</h2></div><div className={styles.rowActions}>{onReturnToCustomer ? <Button className={styles.secondaryAction} size="sm" type="button" variant="outline" onClick={onReturnToCustomer}>Volver al cliente</Button> : null}<Button className={styles.closeButton} size="icon" variant="ghost" type="button" aria-label="Cerrar" onClick={onClose}><X aria-hidden="true" /></Button></div></header>
      <div className={styles.drawerBody}>
        {loading && !obligationResult ? <div className={styles.state}><LoadingSpinner message="Cargando detalle financiero…" /></div> : null}
        {error ? <div className={styles.inlineError} role="alert"><AlertCircle aria-hidden="true" /><span>{error}</span></div> : null}
        {!loading && !error ? <>
          <section className={styles.detailCard}><h3>{contract.contractNumber}</h3><p className={styles.contractTravelLabel}>{contract.travelLabel ?? 'Viaje sin nombre registrado'}</p>{travelContextLabel(contract) ? <p className={styles.contractTravelContext}>{travelContextLabel(contract)}</p> : null}</section>
          {currencyCode && effectiveStatus && effectiveOriginal && effectiveOutstanding ? <section className={styles.detailCard}><h3>Estado financiero</h3><dl className={styles.facts}>
            <div><dt>Estado</dt><dd><span className={styles.badgeGroup}><Badge className={statusClass(effectiveStatus)} variant="outline">{CONTRACT_OBLIGATION_STATUS_LABELS[effectiveStatus]}</Badge>{contract.isOverdue && <Badge className={styles.overdueBadge} variant="outline">Vencido</Badge>}</span></dd></div>
            <div><dt>Total contratado</dt><dd>{formatFinanceMoney(effectiveOriginal, currencyCode)}</dd></div>
            {effectivePaid ? <div><dt>Pagado</dt><dd className={styles.availableAmount}>{formatFinanceMoney(effectivePaid, currencyCode)}</dd></div> : null}
            <div><dt>Saldo pendiente</dt><dd className={styles.pendingAmount}>{formatFinanceMoney(effectiveOutstanding, currencyCode)}</dd></div><div><dt>Moneda</dt><dd>{currencyCode}</dd></div><div><dt>Vencimiento</dt><dd>{formatOptionalBusinessDate(effectiveDueDate)}</dd></div><div><dt>Liquidado</dt><dd>{formatOptionalBusinessDate(effectiveSettledAt)}</dd></div>
          </dl></section> : <section className={styles.detailCard}><p className={styles.secondary}>Este contrato aún no tiene una obligación financiera disponible.</p></section>}
          {notice ? <div className={styles.paymentSuccess} role="status"><CircleDollarSign aria-hidden="true" /><div><strong>Abono registrado</strong><p>{notice}</p></div></div> : null}
          {canRegister ? <section className={styles.detailCard}><div className={styles.contractActionHeader}><div><h3>Registrar abono</h3><p>Registre un nuevo movimiento contra el saldo pendiente.</p></div><Button className={styles.primaryAction} size="sm" type="button" onClick={() => setShowInstallmentForm((value) => !value)}><CircleDollarSign aria-hidden="true" />{showInstallmentForm ? 'Cancelar' : 'Registrar abono'}</Button></div>{showInstallmentForm && commercialObligation ? <ContractInstallmentForm contractId={contract.contractId} outstandingAmount={commercialObligation.outstandingAmount} onSuccess={handleInstallmentSuccess} /> : null}</section> : null}
          <section className={styles.detailCard}><div className={styles.contractActionHeader}><div><h3>Historial de pagos</h3><p>Movimientos persistentes vinculados a este contrato.</p></div><span className={styles.secondary}>{paymentsResult ? `${paymentsResult.total} movimiento(s)` : 'Cargando…'}</span></div>
            {paymentsResult?.items.length ? <div className={styles.contractPaymentHistory}>{paymentsResult.items.map((payment) => { const fiscalPresentation = fiscalDocumentPresentation(payment.fiscalDocument); const fiscalNumber = payment.fiscalDocument?.fiscalNumber ?? payment.fiscalDocument?.internalNumber; return <article className={styles.contractPaymentRow} key={payment.id}><div className={styles.contractPaymentHeader}><div><strong>{formatContractPaymentPurpose(payment.purpose)}</strong><span>{formatBusinessDate(payment.receivedAt)} · {payment.receiptNumber ?? 'Recibo no disponible'}</span></div><Badge className={styles.paymentStatusBadge} variant="outline">{formatContractPaymentStatus(payment.status)}</Badge></div><dl className={styles.contractPaymentFacts}><div><dt>Método</dt><dd>{formatFinancePaymentMethod(payment.paymentMethod)}</dd></div><div><dt>Monto</dt><dd>{formatFinanceMoney(payment.receivedAmount, payment.currencyCode)}</dd></div>{payment.externalReference ? <div><dt>Referencia</dt><dd>{payment.externalReference}</dd></div> : null}{payment.description ? <div><dt>Nota</dt><dd>{payment.description}</dd></div> : null}</dl>{payment.commercialAllocation ? <p className={styles.contractAllocation}>Aplicación comercial: {formatFinanceMoney(payment.commercialAllocation.amount, payment.currencyCode)} · {payment.commercialAllocation.status === 'ACTIVE' ? 'Activa' : 'Revertida'}{payment.commercialAllocation.reversedAt ? ` · Revertida ${formatBusinessDate(payment.commercialAllocation.reversedAt)}` : ''}{payment.commercialAllocation.reversalReason ? ` · ${payment.commercialAllocation.reversalReason}` : ''}</p> : null}<div className={styles.contractFiscalDocument}><div><span>Factura electrónica</span><Badge className={fiscalDocumentStatusClass(fiscalPresentation.kind)} variant="outline">{fiscalPresentation.label}</Badge>{fiscalNumber ? <small>{fiscalNumber}</small> : null}</div>{payment.fiscalDocument ? <Button asChild className={styles.secondaryAction} size="sm" variant="outline"><Link href={fiscalDocumentHref(payment.fiscalDocument)}>Ver factura</Link></Button> : null}</div><div className={styles.contractPaymentActions}>{payment.receiptAvailable ? <Button className={styles.secondaryAction} size="sm" type="button" variant="outline" disabled={receiptBusyId === payment.id} onClick={() => void downloadReceipt(payment.id)}><Download aria-hidden="true" />{receiptBusyId === payment.id ? 'Descargando…' : 'Descargar recibo'}</Button> : null}</div></article>; })}</div> : <p className={styles.paymentEmptyCompact}>No hay movimientos de pago registrados para este contrato.</p>}
            {paymentsResult && paymentsResult.totalPages > 1 ? <nav className={styles.candidatePagination}><Button className={styles.secondaryAction} disabled={paymentsResult.page <= 1} size="sm" type="button" variant="outline" onClick={() => setPaymentPage((value) => Math.max(1, value - 1))}>Anterior</Button><span>Página {paymentsResult.page} de {paymentsResult.totalPages}</span><Button className={styles.secondaryAction} disabled={paymentsResult.page >= paymentsResult.totalPages} size="sm" type="button" variant="outline" onClick={() => setPaymentPage((value) => Math.min(paymentsResult.totalPages, value + 1))}>Siguiente</Button></nav> : null}
          </section>
        </> : null}
      </div>
    </aside>
  </>;
}

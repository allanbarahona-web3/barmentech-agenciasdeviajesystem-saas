'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, CircleDollarSign, Download, Eye, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatContractPaymentPurpose, formatContractPaymentStatus } from '@/features/contracts-finance/contract-payment-labels';
import {
  buildContractInstallmentRequest,
  canRegisterContractInstallments,
  CONTRACT_OBLIGATION_STATUS_LABELS,
  createContractInstallmentDeduplicationKey,
  installmentFormError,
} from '@/features/contracts-finance/contract-installment';
import { getStoredSession } from '@/lib/auth-api';
import {
  downloadPaymentReceipt,
  FinanceApiError,
  formatFinanceMoney,
  getContractCommercialObligation,
  listContractObligationGroupContracts,
  listContractObligationGroups,
  listContractPayments,
  registerContractInstallment,
  type CommercialObligationStatus,
  type ContractObligationGroup,
  type ContractObligationGroupContractsPage,
  type ContractObligationGroupsPage,
  type ContractObligationPortfolioItem,
  type ContractPaymentsPage,
} from '@/lib/finance-api';
import {
  FINANCE_PAYMENT_METHOD_OPTIONS,
  formatFinancePaymentMethod,
  type FinancePaymentMethod,
} from '@/lib/finance-payment-methods';
import { formatBusinessDate } from '@/shared/regional';
import styles from './accounts-receivable.module.css';

const PAGE_SIZE = 20;
const CHILD_PAGE_SIZE = 10;
const PAYMENT_PAGE_SIZE = 10;

function statusClass(status: CommercialObligationStatus) {
  if (status === 'OPEN') return styles.openBadge;
  if (status === 'PARTIALLY_SETTLED') return styles.partialBadge;
  if (status === 'SETTLED') return styles.settledBadge;
  return styles.cancelledBadge;
}

function formatOptionalBusinessDate(value: string | null): string {
  return value ? formatBusinessDate(value) : '—';
}

function localDateTimeValue(): string {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function travelContextLabel(contract: ContractObligationPortfolioItem): string | null {
  const values = [
    contract.travelContext.destination,
    contract.travelContext.travelType,
    contract.startDate && contract.endDate
      ? `${formatBusinessDate(contract.startDate)} – ${formatBusinessDate(contract.endDate)}`
      : contract.startDate ? formatBusinessDate(contract.startDate) : null,
  ].filter((value): value is string => Boolean(value));
  return values.length ? values.join(' · ') : null;
}

function ContractFinanceDrawer({ contract, canWrite, onClose, onChanged }: {
  contract: ContractObligationPortfolioItem;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [obligationResult, setObligationResult] = useState<Awaited<ReturnType<typeof getContractCommercialObligation>> | null>(null);
  const [paymentsResult, setPaymentsResult] = useState<ContractPaymentsPage | null>(null);
  const [paymentPage, setPaymentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInstallmentForm, setShowInstallmentForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod | ''>('');
  const [receivedAt, setReceivedAt] = useState(localDateTimeValue);
  const [externalReference, setExternalReference] = useState('');
  const [description, setDescription] = useState('');
  const [registrationDeduplicationKey, setRegistrationDeduplicationKey] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [receiptBusyId, setReceiptBusyId] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [obligation, payments] = await Promise.all([
        getContractCommercialObligation(contract.contractId, signal),
        listContractPayments(contract.contractId, { page: paymentPage, pageSize: PAYMENT_PAGE_SIZE }, signal),
      ]);
      if (!signal?.aborted) {
        setObligationResult(obligation);
        setPaymentsResult(payments);
        if (payments.totalPages > 0 && paymentPage > payments.totalPages) setPaymentPage(payments.totalPages);
      }
    } catch (requestError) {
      if (!signal?.aborted) setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el detalle financiero del contrato.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [contract.contractId, paymentPage]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const commercialObligation = obligationResult?.commercialObligation;
  const effectiveStatus = commercialObligation?.status ?? contract.status;
  const effectiveOriginal = commercialObligation?.originalAmount ?? contract.originalAmount;
  const effectiveOutstanding = commercialObligation?.outstandingAmount ?? contract.outstandingAmount;
  const effectiveDueDate = commercialObligation?.dueDate ?? contract.dueDate;
  const effectiveSettledAt = commercialObligation?.settledAt ?? contract.settledAt;
  const canRegister = canWrite
    && canRegisterContractInstallments(getStoredSession()?.user.role)
    && obligationResult?.payable === true;

  const openInstallmentForm = () => {
    setAmount('');
    setPaymentMethod('');
    setReceivedAt(localDateTimeValue());
    setExternalReference('');
    setDescription('');
    setFormError(null);
    setRegistrationDeduplicationKey(createContractInstallmentDeduplicationKey());
    setShowInstallmentForm(true);
  };

  const submitInstallment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!commercialObligation || !registrationDeduplicationKey || !paymentMethod) return;
    const validationError = installmentFormError({
      amount,
      paymentMethod,
      receivedAt,
      outstandingAmount: commercialObligation.outstandingAmount,
    });
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await registerContractInstallment(contract.contractId, buildContractInstallmentRequest({
        registrationDeduplicationKey,
        amount,
        receivedAt,
        paymentMethod,
        externalReference,
        description,
      }));
      setNotice('Abono registrado correctamente. La información financiera fue actualizada.');
      setShowInstallmentForm(false);
      setRegistrationDeduplicationKey(null);
      await refresh();
      onChanged();
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

  const downloadReceipt = async (paymentId: string) => {
    setReceiptBusyId(paymentId);
    setError(null);
    try {
      const file = await downloadPaymentReceipt(paymentId);
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
      setReceiptBusyId(null);
    }
  };

  return <>
    <button className={styles.drawerBackdrop} type="button" aria-label="Cerrar detalle financiero" onClick={onClose} />
    <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="contract-finance-detail-title">
      <header className={styles.drawerHeader}><div><p>Contrato · Finanzas</p><h2 id="contract-finance-detail-title">Detalle financiero</h2></div><Button className={styles.closeButton} size="icon" variant="ghost" type="button" aria-label="Cerrar" onClick={onClose}><X aria-hidden="true" /></Button></header>
      <div className={styles.drawerBody}>
        {loading && !obligationResult ? <div className={styles.state}><LoadingSpinner message="Cargando detalle financiero…" /></div> : null}
        {error ? <div className={styles.inlineError} role="alert"><AlertCircle aria-hidden="true" /><span>{error}</span></div> : null}
        {!loading || obligationResult ? <>
          <section className={styles.detailCard}>
            <h3>{contract.contractNumber}</h3>
            <p className={styles.contractTravelLabel}>{contract.travelLabel ?? 'Viaje sin nombre registrado'}</p>
            {travelContextLabel(contract) ? <p className={styles.contractTravelContext}>{travelContextLabel(contract)}</p> : null}
          </section>
          <section className={styles.detailCard}>
            <h3>Estado financiero</h3>
            <dl className={styles.facts}>
              <div><dt>Estado</dt><dd><span className={styles.badgeGroup}><Badge className={statusClass(effectiveStatus)} variant="outline">{CONTRACT_OBLIGATION_STATUS_LABELS[effectiveStatus]}</Badge>{contract.isOverdue && <Badge className={styles.overdueBadge} variant="outline">Vencido</Badge>}</span></dd></div>
              <div><dt>Total comprometido</dt><dd>{formatFinanceMoney(effectiveOriginal, contract.currencyCode)}</dd></div>
              <div><dt>Pagado</dt><dd className={styles.availableAmount}>{formatFinanceMoney(contract.paidAmount, contract.currencyCode)}</dd></div>
              <div><dt>Saldo pendiente</dt><dd className={styles.pendingAmount}>{formatFinanceMoney(effectiveOutstanding, contract.currencyCode)}</dd></div>
              <div><dt>Moneda</dt><dd>{contract.currencyCode}</dd></div>
              <div><dt>Vencimiento</dt><dd>{formatOptionalBusinessDate(effectiveDueDate)}</dd></div>
              <div><dt>Liquidado</dt><dd>{formatOptionalBusinessDate(effectiveSettledAt)}</dd></div>
            </dl>
          </section>

          {notice ? <div className={styles.paymentSuccess} role="status"><CircleDollarSign aria-hidden="true" /><div><strong>Abono registrado</strong><p>{notice}</p></div></div> : null}

          {canRegister ? <section className={styles.detailCard}>
            <div className={styles.contractActionHeader}><div><h3>Registrar abono</h3><p>Registre un nuevo movimiento contra el saldo pendiente.</p></div><Button className={styles.primaryAction} size="sm" type="button" onClick={() => showInstallmentForm ? setShowInstallmentForm(false) : openInstallmentForm()}><CircleDollarSign aria-hidden="true" />{showInstallmentForm ? 'Cancelar' : 'Registrar abono'}</Button></div>
            {showInstallmentForm && commercialObligation ? <form className={styles.paymentForm} onSubmit={submitInstallment}>
              <div className={styles.paymentFormGrid}>
                <label>Monto<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
                <label>Método de pago<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as FinancePaymentMethod | '')} required><option value="">Seleccione una opción</option>{FINANCE_PAYMENT_METHOD_OPTIONS.map((method) => <option key={method.token} value={method.token}>{method.label}</option>)}</select></label>
                <label>Fecha de recepción<input type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} required /></label>
                <label>Referencia <span className={styles.optionalField}>(opcional)</span><input value={externalReference} onChange={(event) => setExternalReference(event.target.value)} /></label>
              </div>
              <label className={styles.paymentNotes}>Descripción / nota <span className={styles.optionalField}>(opcional)</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label>
              {formError ? <div className={styles.inlineError} role="alert"><AlertCircle aria-hidden="true" /><span>{formError}</span></div> : null}
              <div className={styles.paymentActions}><Button className={styles.primaryAction} type="submit" disabled={submitting}>{submitting ? 'Registrando…' : 'Confirmar abono'}</Button></div>
            </form> : null}
          </section> : null}

          <section className={styles.detailCard}>
            <div className={styles.contractActionHeader}><div><h3>Historial de pagos</h3><p>Movimientos persistentes vinculados a este contrato.</p></div><span className={styles.secondary}>{paymentsResult ? `${paymentsResult.total} movimiento(s)` : 'Cargando…'}</span></div>
            {paymentsResult?.items.length ? <div className={styles.contractPaymentHistory}>{paymentsResult.items.map((payment) => <article className={styles.contractPaymentRow} key={payment.id}>
              <div className={styles.contractPaymentHeader}><div><strong>{formatContractPaymentPurpose(payment.purpose)}</strong><span>{formatBusinessDate(payment.receivedAt)} · {payment.receiptNumber ?? 'Recibo no disponible'}</span></div><Badge className={styles.paymentStatusBadge} variant="outline">{formatContractPaymentStatus(payment.status)}</Badge></div>
              <dl className={styles.contractPaymentFacts}><div><dt>Método</dt><dd>{formatFinancePaymentMethod(payment.paymentMethod)}</dd></div><div><dt>Monto</dt><dd>{formatFinanceMoney(payment.receivedAmount, payment.currencyCode)}</dd></div>{payment.externalReference ? <div><dt>Referencia</dt><dd>{payment.externalReference}</dd></div> : null}{payment.description ? <div><dt>Nota</dt><dd>{payment.description}</dd></div> : null}</dl>
              {payment.commercialAllocation ? <p className={styles.contractAllocation}>Aplicación comercial: {formatFinanceMoney(payment.commercialAllocation.amount, payment.currencyCode)} · {payment.commercialAllocation.status === 'ACTIVE' ? 'Activa' : 'Revertida'}{payment.commercialAllocation.reversedAt ? ` · Revertida ${formatBusinessDate(payment.commercialAllocation.reversedAt)}` : ''}{payment.commercialAllocation.reversalReason ? ` · ${payment.commercialAllocation.reversalReason}` : ''}</p> : null}
              {payment.receiptAvailable ? <Button className={styles.secondaryAction} size="sm" type="button" variant="outline" disabled={receiptBusyId === payment.id} onClick={() => void downloadReceipt(payment.id)}><Download aria-hidden="true" />{receiptBusyId === payment.id ? 'Descargando…' : 'Descargar recibo'}</Button> : null}
            </article>)}</div> : <p className={styles.paymentEmptyCompact}>No hay movimientos de pago registrados para este contrato.</p>}
            {paymentsResult && paymentsResult.totalPages > 1 ? <nav className={styles.candidatePagination}><Button className={styles.secondaryAction} disabled={paymentsResult.page <= 1} size="sm" type="button" variant="outline" onClick={() => setPaymentPage((value) => Math.max(1, value - 1))}>Anterior</Button><span>Página {paymentsResult.page} de {paymentsResult.totalPages}</span><Button className={styles.secondaryAction} disabled={paymentsResult.page >= paymentsResult.totalPages} size="sm" type="button" variant="outline" onClick={() => setPaymentPage((value) => Math.min(paymentsResult.totalPages, value + 1))}>Siguiente</Button></nav> : null}
          </section>
        </> : null}
      </div>
    </aside>
  </>;
}

function GroupRows({ group, canWrite, reloadToken, onContractsChanged }: {
  group: ContractObligationGroup;
  canWrite: boolean;
  reloadToken: number;
  onContractsChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ContractObligationGroupContractsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
      return listContractObligationGroupContracts(group.groupKey, { page, pageSize: CHILD_PAGE_SIZE }, controller.signal)
        .then(setResult)
        .catch((requestError) => {
          if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar los contratos del grupo.');
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    });
    return () => controller.abort();
  }, [expanded, group.groupKey, page, reloadToken]);

  const selectedContract = result?.items.find((item) => item.contractId === selectedContractId) ?? null;
  const compactContext = `${group.counts.open + group.counts.partiallySettled} con saldo · ${group.counts.settled} pagado(s)${group.counts.overdue ? ` · ${group.counts.overdue} vencido(s)` : ''}`;

  return <Fragment>
    <TableRow className={expanded ? styles.expandedGroupRow : undefined}>
      <TableCell><button className={styles.expandButton} type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><ChevronRight className={expanded ? styles.expandIconOpen : undefined} aria-hidden="true" /><span className={styles.stack}><strong>{group.debtor.displayName}</strong><span className={styles.secondary}>{group.debtor.identificationNumber ?? group.customerId}</span></span></button></TableCell>
      <TableCell>{group.currencyCode}</TableCell>
      <TableCell className={styles.numeric}>{formatFinanceMoney(group.totalOriginalAmount, group.currencyCode)}</TableCell>
      <TableCell className={`${styles.numeric} ${styles.availableAmount}`}>{formatFinanceMoney(group.totalPaidAmount, group.currencyCode)}</TableCell>
      <TableCell className={`${styles.numeric} ${styles.pendingAmount}`}><strong>{formatFinanceMoney(group.totalOutstandingAmount, group.currencyCode)}</strong><span className={styles.tableSubtext}>{compactContext}</span></TableCell>
      <TableCell><div className={styles.rowActions}><Button className={styles.secondaryAction} size="sm" type="button" variant="outline" onClick={() => setExpanded((value) => !value)}><ChevronDown aria-hidden="true" />{expanded ? 'Ocultar' : 'Ver contratos'}</Button></div></TableCell>
    </TableRow>
    {expanded ? <TableRow className={styles.childContainerRow}><TableCell colSpan={6}><div className={styles.childPanel}>
      <div className={styles.childHeading}><div><h3>Contratos</h3><p>Compromisos comerciales agrupados por cliente y moneda.</p></div><span>{loading ? 'Cargando…' : `${result?.total ?? 0} contrato(s)`}</span></div>
      {error ? <div className={styles.inlineError} role="alert"><AlertCircle aria-hidden="true" /><span>{error}</span></div> : loading && !result ? <div className={styles.childLoading}>Cargando contratos…</div> : result?.items.length ? <div className={styles.childTableWrap}><Table className={styles.contractChildTable}><TableHeader><TableRow><TableHead>Contrato / viaje</TableHead><TableHead className={styles.numeric}>Total comprometido</TableHead><TableHead className={styles.numeric}>Pagado</TableHead><TableHead className={styles.numeric}>Saldo pendiente</TableHead><TableHead>Vencimiento</TableHead><TableHead>Estado</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{result.items.map((contract) => <TableRow key={contract.contractId}>
        <TableCell><div className={styles.stack}><span className={styles.reference}>{contract.contractNumber}</span><span className={styles.secondary}>{contract.travelLabel ?? 'Viaje sin nombre registrado'}</span>{travelContextLabel(contract) ? <span className={styles.tableSubtext}>{travelContextLabel(contract)}</span> : null}</div></TableCell>
        <TableCell className={styles.numeric}>{formatFinanceMoney(contract.originalAmount, contract.currencyCode)}</TableCell>
        <TableCell className={`${styles.numeric} ${styles.availableAmount}`}>{formatFinanceMoney(contract.paidAmount, contract.currencyCode)}</TableCell>
        <TableCell className={`${styles.numeric} ${styles.pendingAmount}`}>{formatFinanceMoney(contract.outstandingAmount, contract.currencyCode)}</TableCell>
        <TableCell>{formatOptionalBusinessDate(contract.dueDate)}</TableCell>
        <TableCell><span className={styles.badgeGroup}><Badge className={statusClass(contract.status)} variant="outline">{CONTRACT_OBLIGATION_STATUS_LABELS[contract.status]}</Badge>{contract.isOverdue ? <Badge className={styles.overdueBadge} variant="outline">Vencido</Badge> : null}</span></TableCell>
        <TableCell><div className={styles.rowActions}><Button className={styles.secondaryAction} size="sm" type="button" variant="outline" onClick={() => setSelectedContractId(contract.contractId)}><Eye aria-hidden="true" />Detalle financiero</Button>{canWrite && contract.status !== 'SETTLED' && contract.status !== 'CANCELLED' ? <Button className={styles.actionButton} size="sm" type="button" onClick={() => setSelectedContractId(contract.contractId)}><CircleDollarSign aria-hidden="true" />Registrar abono</Button> : null}</div></TableCell>
      </TableRow>)}</TableBody></Table></div> : <div className={styles.childLoading}>El grupo no contiene contratos disponibles.</div>}
      {result && result.totalPages > 1 ? <nav className={styles.candidatePagination}><Button className={styles.secondaryAction} disabled={result.page <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><span>Página {result.page} de {result.totalPages}</span><Button className={styles.secondaryAction} disabled={result.page >= result.totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(result.totalPages, value + 1))}>Siguiente</Button></nav> : null}
    </div></TableCell></TableRow> : null}
    {selectedContract ? <ContractFinanceDrawer key={selectedContract.contractId} contract={selectedContract} canWrite={canWrite} onClose={() => setSelectedContractId(null)} onChanged={onContractsChanged} /> : null}
  </Fragment>;
}

export function ContractObligationGroupsView({ canWrite, reloadToken, onContractsChanged }: {
  canWrite: boolean;
  reloadToken: number;
  onContractsChanged: () => void;
}) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ContractObligationGroupsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FinanceApiError | null>(null);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    void reloadToken;
    void retry;
    setLoading(true);
    setError(null);
    try {
      const response = await listContractObligationGroups({ page, pageSize: PAGE_SIZE }, signal);
      setResult(response);
      if (response.totalPages > 0 && page > response.totalPages) setPage(response.totalPages);
    } catch (requestError) {
      if (!signal.aborted) setError(requestError instanceof FinanceApiError ? requestError : new FinanceApiError('FINANCE_REQUEST_FAILED', 'No se pudieron cargar los grupos de contratos.'));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [page, reloadToken, retry]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const summary = useMemo(() => {
    if (!result || result.total === 0) return '0 grupos';
    const first = (result.page - 1) * result.pageSize + 1;
    const last = Math.min(result.page * result.pageSize, result.total);
    return `${first}–${last} de ${result.total} grupos`;
  }, [result]);

  return <section className={styles.tableCard}>
    <div className={styles.tableHeading}><div><h2>Contratos por cliente y moneda</h2><p>Los compromisos y saldos provienen del modelo financiero de contratos.</p></div><span>{loading ? 'Cargando…' : summary}</span></div>
    {error ? <div className={styles.state}><div><span className={styles.stateIcon}><AlertCircle aria-hidden="true" /></span><h3 className={styles.error}>No se pudieron cargar los contratos</h3><p>{error.message}</p><Button className={styles.secondaryAction} variant="outline" type="button" onClick={() => setRetry((value) => value + 1)}>Intentar nuevamente</Button></div></div> : !loading && (!result || result.items.length === 0) ? <div className={styles.state}><div><span className={styles.stateIcon}><AlertCircle aria-hidden="true" /></span><h3>No hay grupos de contratos</h3><p>Los contratos con obligación comercial aparecerán aquí.</p></div></div> : <Table className={styles.contractGroupTable}><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Moneda</TableHead><TableHead className={styles.numeric}>Total comprometido</TableHead><TableHead className={styles.numeric}>Pagado</TableHead><TableHead className={styles.numeric}>Saldo contratos</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{loading ? Array.from({ length: 5 }, (_, row) => <TableRow key={row}>{Array.from({ length: 6 }, (_, cell) => <TableCell key={cell}><span className={styles.skeleton} /></TableCell>)}</TableRow>) : result?.items.map((group) => <GroupRows key={group.groupKey} group={group} canWrite={canWrite} reloadToken={reloadToken} onContractsChanged={onContractsChanged} />)}</TableBody></Table>}
    {!loading && !error && result && result.totalPages > 1 ? <nav className={styles.pagination}><p>Página {result.page} de {result.totalPages} · {summary}</p><div className={styles.paginationActions}><Button className={styles.secondaryAction} disabled={result.page <= 1} variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><Button className={styles.secondaryAction} disabled={result.page >= result.totalPages} variant="outline" onClick={() => setPage((value) => Math.min(result.totalPages, value + 1))}>Siguiente</Button></div></nav> : null}
  </section>;
}

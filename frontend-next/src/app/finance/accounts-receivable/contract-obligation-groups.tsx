'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, CircleDollarSign, Eye, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { canRegisterContractInstallments, CONTRACT_OBLIGATION_STATUS_LABELS } from '@/features/contracts-finance/contract-installment';
import { ContractFinanceDrawer, ContractInstallmentForm } from '@/features/contracts-finance/contract-finance-drawer';
import { getStoredSession } from '@/lib/auth-api';
import {
  FinanceApiError,
  formatFinanceMoney,
  getContractCommercialObligation,
  listContractObligationGroupContracts,
  listContractObligationGroups,
  type CommercialObligationStatus,
  type ContractObligationGroup,
  type ContractObligationGroupContractsPage,
  type ContractObligationGroupsPage,
  type ContractObligationPortfolioItem,
} from '@/lib/finance-api';
import { formatBusinessDate } from '@/shared/regional';
import styles from './accounts-receivable.module.css';

const PAGE_SIZE = 20;
const CHILD_PAGE_SIZE = 10;

function statusClass(status: CommercialObligationStatus) {
  if (status === 'OPEN') return styles.openBadge;
  if (status === 'PARTIALLY_SETTLED') return styles.partialBadge;
  if (status === 'SETTLED') return styles.settledBadge;
  return styles.cancelledBadge;
}

function formatOptionalBusinessDate(value: string | null): string {
  return value ? formatBusinessDate(value) : '—';
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

function ContractInstallmentModal({ contract, canWrite, onClose, onCompleted }: {
  contract: ContractObligationPortfolioItem;
  canWrite: boolean;
  onClose: () => void;
  onCompleted: () => void | Promise<void>;
}) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof getContractCommercialObligation>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getContractCommercialObligation(contract.contractId, controller.signal)
      .then((response) => { if (!controller.signal.aborted) setResult(response); })
      .catch((requestError) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el saldo del contrato.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [contract.contractId]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const obligation = result?.commercialObligation;
  const canRegister = canWrite
    && canRegisterContractInstallments(getStoredSession()?.user.role)
    && result?.payable === true;

  return <>
    <button className={styles.paymentBackdrop} type="button" aria-label="Cerrar registro de abono" onClick={onClose} />
    <section className={styles.contractInstallmentModal} role="dialog" aria-modal="true" aria-labelledby="contract-installment-modal-title">
      <header className={styles.paymentModalHeader}><div><p>Contrato · Finanzas</p><h2 id="contract-installment-modal-title">Registrar abono</h2></div><Button className={styles.closeButton} size="icon" variant="ghost" type="button" aria-label="Cerrar" onClick={onClose}><X aria-hidden="true" /></Button></header>
      <div className={styles.paymentModalBody}>
        <section className={styles.contractInstallmentContext}><div><span>Contrato</span><strong>{contract.contractNumber}</strong></div><div><span>Viaje</span><strong>{contract.travelLabel ?? 'Viaje sin nombre registrado'}</strong></div><div><span>Moneda</span><strong>{contract.currencyCode}</strong></div><div><span>Saldo pendiente</span><strong className={styles.pendingAmount}>{formatFinanceMoney(obligation?.outstandingAmount ?? contract.outstandingAmount, contract.currencyCode)}</strong></div></section>
        {loading ? <div className={styles.childLoading}>Cargando saldo disponible…</div> : null}
        {error ? <div className={styles.inlineError} role="alert"><AlertCircle aria-hidden="true" /><span>{error}</span></div> : null}
        {!loading && !error && obligation && canRegister ? <ContractInstallmentForm contractId={contract.contractId} outstandingAmount={obligation.outstandingAmount} onSuccess={onCompleted} /> : null}
        {!loading && !error && (!obligation || !canRegister) ? <div className={styles.childLoading}>Este contrato ya no admite registrar abonos.</div> : null}
      </div>
    </section>
  </>;
}

function GroupRows({ group, canWrite, reloadToken, onOpenDetail, onRegisterInstallment, onStatement }: {
  group: ContractObligationGroup;
  canWrite: boolean;
  reloadToken: number;
  onOpenDetail: (contract: ContractObligationPortfolioItem) => void;
  onRegisterInstallment: (contract: ContractObligationPortfolioItem) => void;
  onStatement: (group: ContractObligationGroup) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ContractObligationGroupContractsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const compactContext = `${group.counts.open + group.counts.partiallySettled} con saldo · ${group.counts.settled} pagado(s)${group.counts.overdue ? ` · ${group.counts.overdue} vencido(s)` : ''}`;

  return <Fragment>
    <TableRow className={expanded ? styles.expandedGroupRow : undefined}>
      <TableCell><button className={styles.expandButton} type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><ChevronRight className={expanded ? styles.expandIconOpen : undefined} aria-hidden="true" /><span className={styles.stack}><strong>{group.debtor.displayName}</strong><span className={styles.secondary}>{group.debtor.identificationNumber ?? group.customerId}</span></span></button></TableCell>
      <TableCell>{group.currencyCode}</TableCell>
      <TableCell className={styles.numeric}>{formatFinanceMoney(group.totalOriginalAmount, group.currencyCode)}</TableCell>
      <TableCell className={`${styles.numeric} ${styles.availableAmount}`}>{formatFinanceMoney(group.totalPaidAmount, group.currencyCode)}</TableCell>
      <TableCell className={`${styles.numeric} ${styles.pendingAmount}`}><strong>{formatFinanceMoney(group.totalOutstandingAmount, group.currencyCode)}</strong><span className={styles.tableSubtext}>{compactContext}</span></TableCell>
      <TableCell><div className={styles.rowActions}><Button className={styles.secondaryAction} size="sm" type="button" variant="outline" onClick={() => setExpanded((value) => !value)}><ChevronDown aria-hidden="true" />{expanded ? 'Ocultar' : 'Ver contratos'}</Button><Button className={styles.secondaryAction} size="sm" type="button" variant="outline" onClick={() => onStatement(group)}>Estado de cuenta</Button></div></TableCell>
    </TableRow>
    {expanded ? <TableRow className={styles.childContainerRow}><TableCell colSpan={6}><div className={styles.childPanel}>
      <div className={styles.childHeading}><div><h3>Contratos</h3><p>Compromisos comerciales agrupados por cliente y moneda.</p></div><span>{loading ? 'Cargando…' : `${result?.total ?? 0} contrato(s)`}</span></div>
      {error ? <div className={styles.inlineError} role="alert"><AlertCircle aria-hidden="true" /><span>{error}</span></div> : loading && !result ? <div className={styles.childLoading}>Cargando contratos…</div> : result?.items.length ? <div className={styles.childTableWrap}><Table className={styles.contractChildTable}><TableHeader><TableRow><TableHead>Contrato / viaje</TableHead><TableHead className={styles.numeric}>Total contratado</TableHead><TableHead className={styles.numeric}>Pagado</TableHead><TableHead className={styles.numeric}>Saldo pendiente</TableHead><TableHead>Vencimiento</TableHead><TableHead>Estado</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{result.items.map((contract) => <TableRow key={contract.contractId}>
        <TableCell><div className={styles.stack}><span className={styles.reference}>{contract.contractNumber}</span><span className={styles.secondary}>{contract.travelLabel ?? 'Viaje sin nombre registrado'}</span>{travelContextLabel(contract) ? <span className={styles.tableSubtext}>{travelContextLabel(contract)}</span> : null}</div></TableCell>
        <TableCell className={styles.numeric}>{formatFinanceMoney(contract.originalAmount, contract.currencyCode)}</TableCell>
        <TableCell className={`${styles.numeric} ${styles.availableAmount}`}>{formatFinanceMoney(contract.paidAmount, contract.currencyCode)}</TableCell>
        <TableCell className={`${styles.numeric} ${styles.pendingAmount}`}>{formatFinanceMoney(contract.outstandingAmount, contract.currencyCode)}</TableCell>
        <TableCell>{formatOptionalBusinessDate(contract.dueDate)}</TableCell>
        <TableCell><span className={styles.badgeGroup}><Badge className={statusClass(contract.status)} variant="outline">{CONTRACT_OBLIGATION_STATUS_LABELS[contract.status]}</Badge>{contract.isOverdue ? <Badge className={styles.overdueBadge} variant="outline">Vencido</Badge> : null}</span></TableCell>
        <TableCell><div className={styles.rowActions}><Button className={styles.secondaryAction} size="sm" type="button" variant="outline" onClick={() => onOpenDetail(contract)}><Eye aria-hidden="true" />Detalle financiero</Button>{canWrite && contract.status !== 'SETTLED' && contract.status !== 'CANCELLED' ? <Button className={styles.actionButton} size="sm" type="button" onClick={() => onRegisterInstallment(contract)}><CircleDollarSign aria-hidden="true" />Registrar abono</Button> : null}</div></TableCell>
      </TableRow>)}</TableBody></Table></div> : <div className={styles.childLoading}>El grupo no contiene contratos disponibles.</div>}
      {result && result.totalPages > 1 ? <nav className={styles.candidatePagination}><Button className={styles.secondaryAction} disabled={result.page <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><span>Página {result.page} de {result.totalPages}</span><Button className={styles.secondaryAction} disabled={result.page >= result.totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(result.totalPages, value + 1))}>Siguiente</Button></nav> : null}
    </div></TableCell></TableRow> : null}
  </Fragment>;
}

export function ContractObligationGroupsView({ canWrite, reloadToken, onContractsChanged, onStatement }: {
  canWrite: boolean;
  reloadToken: number;
  onContractsChanged: () => void;
  onStatement: (group: ContractObligationGroup) => void;
}) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ContractObligationGroupsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FinanceApiError | null>(null);
  const [retry, setRetry] = useState(0);
  const [selectedDetailContract, setSelectedDetailContract] = useState<ContractObligationPortfolioItem | null>(null);
  const [selectedInstallmentContract, setSelectedInstallmentContract] = useState<ContractObligationPortfolioItem | null>(null);
  const [installmentNotice, setInstallmentNotice] = useState<string | null>(null);

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

  const handleInstallmentCompleted = async () => {
    setInstallmentNotice('Abono registrado correctamente. La información financiera fue actualizada.');
    setSelectedInstallmentContract(null);
    onContractsChanged();
  };

  return <>
    {installmentNotice ? <div className={styles.operationNotice} role="status">{installmentNotice}</div> : null}
    <section className={styles.tableCard}>
      <div className={styles.tableHeading}><div><h2>Contratos por cliente y moneda</h2><p>Los compromisos y saldos provienen del modelo financiero de contratos.</p></div><span>{loading ? 'Cargando…' : summary}</span></div>
      {error ? <div className={styles.state}><div><span className={styles.stateIcon}><AlertCircle aria-hidden="true" /></span><h3 className={styles.error}>No se pudieron cargar los contratos</h3><p>{error.message}</p><Button className={styles.secondaryAction} variant="outline" type="button" onClick={() => setRetry((value) => value + 1)}>Intentar nuevamente</Button></div></div> : !loading && (!result || result.items.length === 0) ? <div className={styles.state}><div><span className={styles.stateIcon}><AlertCircle aria-hidden="true" /></span><h3>No hay grupos de contratos</h3><p>Los contratos con obligación comercial aparecerán aquí.</p></div></div> : <Table className={styles.contractGroupTable}><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Moneda</TableHead><TableHead className={styles.numeric}>Total contratado</TableHead><TableHead className={styles.numeric}>Pagado</TableHead><TableHead className={styles.numeric}>Saldo contratos</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{loading ? Array.from({ length: 5 }, (_, row) => <TableRow key={row}>{Array.from({ length: 6 }, (_, cell) => <TableCell key={cell}><span className={styles.skeleton} /></TableCell>)}</TableRow>) : result?.items.map((group) => <GroupRows key={group.groupKey} group={group} canWrite={canWrite} reloadToken={reloadToken} onOpenDetail={setSelectedDetailContract} onRegisterInstallment={setSelectedInstallmentContract} onStatement={onStatement} />)}</TableBody></Table>}
      {!loading && !error && result && result.totalPages > 1 ? <nav className={styles.pagination}><p>Página {result.page} de {result.totalPages} · {summary}</p><div className={styles.paginationActions}><Button className={styles.secondaryAction} disabled={result.page <= 1} variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><Button className={styles.secondaryAction} disabled={result.page >= result.totalPages} variant="outline" onClick={() => setPage((value) => Math.min(result.totalPages, value + 1))}>Siguiente</Button></div></nav> : null}
    </section>
    {selectedDetailContract ? <ContractFinanceDrawer key={selectedDetailContract.contractId} contract={selectedDetailContract} canWrite={canWrite} onClose={() => setSelectedDetailContract(null)} onChanged={onContractsChanged} /> : null}
    {selectedInstallmentContract ? <ContractInstallmentModal key={selectedInstallmentContract.contractId} contract={selectedInstallmentContract} canWrite={canWrite} onClose={() => setSelectedInstallmentContract(null)} onCompleted={handleInstallmentCompleted} /> : null}
  </>;
}

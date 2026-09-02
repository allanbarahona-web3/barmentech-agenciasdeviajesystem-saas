'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, WalletCards, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getHomeRouteForRole, getStoredSession } from '@/lib/auth-api';
import { formatFinanceMoney, getAccountReceivable, listAccountReceivables, type AccountReceivableDetail, type AccountReceivableGroup, type AccountReceivableStatus } from '@/lib/finance-api';
import { formatBusinessDate } from '@/shared/regional';
import styles from './accounts-receivable.module.css';
import { PaymentFlow } from './payment-flow';
import { PaymentsView, type PaymentCustomerFilter } from './payments-view';
import { ReceivableGroupsView } from './receivable-groups';
import { CustomerFundsFlow } from './customer-funds-flow';
import { CustomerAccountStatementModal } from './customer-account-statement';

const READ_ROLES = new Set(['ADMIN', 'FACTURACION_COBROS', 'CONTADOR']);
const WRITE_ROLES = new Set(['ADMIN', 'FACTURACION_COBROS']);
const STATUS_LABELS: Record<AccountReceivableStatus, string> = { OPEN: 'Abierta', PARTIALLY_SETTLED: 'Abonada', SETTLED: 'Cancelada', CANCELLED: 'Anulada' };

function statusClass(status: AccountReceivableStatus) {
  if (status === 'OPEN') return styles.openBadge;
  if (status === 'PARTIALLY_SETTLED') return styles.partialBadge;
  if (status === 'SETTLED') return styles.settledBadge;
  return styles.cancelledBadge;
}

function ReceivableDrawer({ id, canWrite, onClose, onRegisterPayment, onApplyBalance }: { id: string; canWrite: boolean; onClose: () => void; onRegisterPayment: (detail: AccountReceivableDetail) => void; onApplyBalance: (detail: AccountReceivableDetail) => void }) {
  const [detail, setDetail] = useState<AccountReceivableDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setLoading(true); setError(null);
      return getAccountReceivable(id, controller.signal).then(setDetail).catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar la cuenta por cobrar.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    });
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return <>
    <button className={styles.drawerBackdrop} type="button" aria-label="Cerrar detalle" onClick={onClose} />
    <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="receivable-detail-title">
      <header className={styles.drawerHeader}><div><p>Cuenta por cobrar</p><h2 id="receivable-detail-title">Detalle de la deuda</h2></div><Button className={styles.closeButton} size="icon" variant="ghost" type="button" aria-label="Cerrar" onClick={onClose}><X aria-hidden="true" /></Button></header>
      <div className={styles.drawerBody}>{loading ? <div className={styles.state}><LoadingSpinner message="Cargando cuenta por cobrar…" /></div> : error || !detail ? <div className={styles.state}><div><AlertCircle aria-hidden="true" /><h3>No se pudo cargar el detalle</h3><p>{error ?? 'La cuenta por cobrar no está disponible.'}</p></div></div> : <>
        <section className={styles.detailCard}><h3>Estado financiero</h3><dl className={styles.facts}><div><dt>Estado</dt><dd><span className={styles.badgeGroup}><Badge className={statusClass(detail.status)} variant="outline">{STATUS_LABELS[detail.status]}</Badge>{detail.isOverdue === true && <Badge className={styles.overdueBadge} variant="outline">Vencida</Badge>}</span></dd></div><div><dt>Monto original</dt><dd>{formatFinanceMoney(detail.originalAmount, detail.currencyCode)}</dd></div><div><dt>Saldo pendiente</dt><dd className={styles.pendingAmount}>{formatFinanceMoney(detail.outstandingAmount, detail.currencyCode)}</dd></div><div><dt>Fecha de vencimiento</dt><dd>{formatBusinessDate(detail.dueDate)}</dd></div><div><dt>Fecha de reconocimiento</dt><dd>{formatBusinessDate(detail.recognizedAt)}</dd></div><div><dt>Fecha de liquidación</dt><dd>{detail.settledAt ? formatBusinessDate(detail.settledAt) : '—'}</dd></div></dl></section>
        <section className={styles.detailCard}><h3>Factura y origen</h3><dl className={styles.facts}><div><dt>Referencia fiscal</dt><dd>{detail.sourceNumber ?? 'No disponible'}</dd></div><div><dt>BillingDocument</dt><dd>{detail.sourceId}</dd></div><div><dt>Tipo de documento</dt><dd>{detail.sourceDocumentType ?? 'No disponible'}</dd></div><div><dt>Tipo de origen</dt><dd>{detail.sourceType}</dd></div></dl></section>
        <section className={styles.detailCard}><h3>Deudor</h3><dl className={styles.facts}><div><dt>Nombre</dt><dd>{detail.debtorDisplayName}</dd></div><div><dt>Identificación</dt><dd>{detail.debtorIdentificationNumber ?? 'No disponible'}</dd></div></dl></section>
        <section className={styles.detailCard}><h3>Aplicaciones registradas</h3>{detail.allocations.length === 0 ? <p className={styles.secondary}>No hay aplicaciones de pago registradas.</p> : <div className={styles.allocationList}>{detail.allocations.map((allocation) => <article className={styles.allocation} key={allocation.id}><div className={styles.allocationHeader}><strong>{formatFinanceMoney(allocation.amount, detail.currencyCode)}</strong><Badge className={allocation.status === 'ACTIVE' ? styles.activeBadge : styles.reversedBadge} variant="outline">{allocation.status === 'ACTIVE' ? 'Activa' : 'Revertida'}</Badge></div><p>{allocation.paymentReceiptNumber ?? 'Recibo no disponible'} · Aplicado: {formatBusinessDate(allocation.allocatedAt)}{allocation.appliedBy ? ` · ${allocation.appliedBy.name}` : ''}</p>{allocation.reversal && <p>Reversión: {allocation.reversal.reason} · {formatBusinessDate(allocation.reversal.reversedAt)}{allocation.reversal.reversedBy ? ` · ${allocation.reversal.reversedBy.name}` : ''}</p>}</article>)}</div>}</section>
        {canWrite && <section className={styles.futureAction}>{detail.status === 'SETTLED' || detail.status === 'CANCELLED' || !detail.customerId || !detail.hasUnallocatedPayments ? <><p>Registre un nuevo pago / abono para esta cuenta. El saldo disponible se habilita cuando el cliente tiene fondos recibidos sin aplicar.</p><p>Saldo pendiente: <strong className={styles.pendingAmount}>{formatFinanceMoney(detail.outstandingAmount, detail.currencyCode)}</strong></p><Button className={styles.primaryAction} type="button" onClick={() => onRegisterPayment(detail)}><WalletCards aria-hidden="true" />Registrar pago / abono</Button></> : <><p>El cliente tiene saldo disponible. Aplique el saldo a esta o varias cuentas sin elegir recibos.</p><div className={styles.paymentActions}><Button className={styles.secondaryAction} variant="outline" type="button" onClick={() => onRegisterPayment(detail)}><WalletCards aria-hidden="true" />Registrar nuevo abono</Button><Button className={styles.primaryAction} type="button" onClick={() => onApplyBalance(detail)}>Aplicar saldo disponible</Button></div></>}</section>}
      </>}</div>
    </aside>
  </>;
}

function ActionModal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <><button className={styles.paymentBackdrop} type="button" aria-label="Cerrar" onClick={onClose} /><section className={styles.decisionModal} role="dialog" aria-modal="true" aria-labelledby="finance-action-title"><header className={styles.paymentModalHeader}><div><p>Finanzas · Cuentas por cobrar</p><h2 id="finance-action-title">{title}</h2></div><Button className={styles.closeButton} size="icon" variant="ghost" type="button" aria-label="Cerrar" onClick={onClose}><X aria-hidden="true" /></Button></header><div className={styles.paymentModalBody}>{children}</div></section></>;
}

export default function AccountsReceivablePage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [view, setView] = useState<'receivables' | 'payments'>('receivables');
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [registrationReceivable, setRegistrationReceivable] = useState<AccountReceivableDetail | null>(null);
  const [registrationCustomer, setRegistrationCustomer] = useState<AccountReceivableGroup | null>(null);
  const [openingRegistration, setOpeningRegistration] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationNotice, setOperationNotice] = useState<string | null>(null);
  const [paymentCustomer, setPaymentCustomer] = useState<PaymentCustomerFilter | null>(null);
  const [statementGroup, setStatementGroup] = useState<AccountReceivableGroup | null>(null);
  const [customerFundsReceivable, setCustomerFundsReceivable] = useState<AccountReceivableDetail | null>(null);
  const [guardedReceivable, setGuardedReceivable] = useState<AccountReceivableDetail | null>(null);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user?.id) { router.replace('/'); return; }
    const role = String(session.user.role ?? '').toUpperCase();
    if (!READ_ROLES.has(role)) { router.replace(getHomeRouteForRole(role)); return; }
    setCanWrite(WRITE_ROLES.has(role)); setAuthorized(true);
  }, [router]);

  const startRegistration = useCallback((detail: AccountReceivableDetail) => {
    if (detail.status === 'SETTLED' || detail.status === 'CANCELLED') { setGuardedReceivable(detail); return; }
    setRegistrationReceivable(detail);
  }, []);

  async function openRegistration(id: string) {
    setOpeningRegistration(true); setOperationError(null);
    try { startRegistration(await getAccountReceivable(id)); }
    catch (requestError) { setOperationError(requestError instanceof Error ? requestError.message : 'No se pudo abrir el registro del pago.'); }
    finally { setOpeningRegistration(false); }
  }

  async function openCustomerFunds(id: string) {
    setOpeningRegistration(true); setOperationError(null);
    try { setCustomerFundsReceivable(await getAccountReceivable(id)); }
    catch (requestError) { setOperationError(requestError instanceof Error ? requestError.message : 'No se pudo abrir la cuenta para aplicar saldo.'); }
    finally { setOpeningRegistration(false); }
  }

  async function openGroupCustomerFunds(group: AccountReceivableGroup) {
    if (!group.customerId) { setOperationError('El cliente no está disponible para aplicar este saldo.'); return; }
    setOpeningRegistration(true); setOperationError(null);
    try {
      const response = await listAccountReceivables({ customerId: group.customerId, currency: group.currencyCode, page: 1, pageSize: 100 });
      const firstEligible = response.accountReceivables.find((account) => account.status === 'OPEN' || account.status === 'PARTIALLY_SETTLED');
      if (!firstEligible) throw new Error('No hay facturas pendientes elegibles para aplicar el saldo.');
      setCustomerFundsReceivable(await getAccountReceivable(firstEligible.id));
    } catch (requestError) { setOperationError(requestError instanceof Error ? requestError.message : 'No se pudo abrir el saldo del cliente.'); }
    finally { setOpeningRegistration(false); }
  }

  if (!authorized) return <main className="app-shell"><div className={styles.state}><LoadingSpinner message="Validando acceso…" /></div></main>;
  return <main className="app-shell"><div className={styles.page}>
    <header className={styles.header}><p className={styles.eyebrow}>Finanzas</p><h1 className={styles.title}>Cuentas por cobrar</h1><p className={styles.subtitle}>Consulte la cartera agrupada y recupere pagos pendientes de aplicar.</p></header>
    <nav className={styles.viewTabs} aria-label="Espacios de Finanzas"><button className={view === 'receivables' ? styles.viewTabActive : styles.viewTab} type="button" onClick={() => setView('receivables')}>Cartera por cliente</button><button className={view === 'payments' ? styles.viewTabActive : styles.viewTab} type="button" onClick={() => setView('payments')}>Pagos</button></nav>
    {operationError && <div className={styles.inlineError} role="alert"><AlertCircle aria-hidden="true" /><span>{operationError}</span></div>}
    {operationNotice && <div className={styles.operationNotice} role="status">{operationNotice}</div>}
    {openingRegistration && <div className={styles.operationNotice}>Abriendo la cuenta seleccionada…</div>}
    {view === 'receivables' ? <ReceivableGroupsView canWrite={canWrite} reloadToken={reload} onOpenDetail={setSelectedId} onRegisterPayment={(id) => void openRegistration(id)} onRegisterCustomerPayment={setRegistrationCustomer} onApplyBalance={(id) => void openCustomerFunds(id)} onApplyGroupBalance={(group) => void openGroupCustomerFunds(group)} onViewPayments={(customer) => { setPaymentCustomer(customer); setView('payments'); }} onStatement={setStatementGroup} /> : <PaymentsView reloadToken={reload} customerFilter={paymentCustomer} onClearCustomer={() => setPaymentCustomer(null)} canWrite={canWrite} onPaymentChanged={() => setReload((value) => value + 1)} />}
  </div>
  {selectedId && <ReceivableDrawer key={selectedId} id={selectedId} canWrite={canWrite} onClose={() => setSelectedId(null)} onRegisterPayment={startRegistration} onApplyBalance={setCustomerFundsReceivable} />}
  {registrationReceivable && <PaymentFlow receivable={registrationReceivable} onClose={() => setRegistrationReceivable(null)} onAllocated={() => setReload((value) => value + 1)} onCompleted={setOperationNotice} />}
  {registrationCustomer?.customerId && <PaymentFlow customer={{ id: registrationCustomer.customerId, name: registrationCustomer.debtor.displayName, currency: registrationCustomer.currencyCode, identificationType: registrationCustomer.debtor.identificationType, identificationNumber: registrationCustomer.debtor.identificationNumber }} onClose={() => setRegistrationCustomer(null)} onAllocated={() => setReload((value) => value + 1)} onCompleted={setOperationNotice} />}
  {customerFundsReceivable && <CustomerFundsFlow receivable={customerFundsReceivable} onClose={() => setCustomerFundsReceivable(null)} onCommitted={() => setReload((value) => value + 1)} />}
  {statementGroup && <CustomerAccountStatementModal group={statementGroup} canSend={canWrite} onClose={() => setStatementGroup(null)} />}
  {guardedReceivable && <ActionModal title="Cuenta por cobrar no disponible" onClose={() => setGuardedReceivable(null)}><p className={styles.decisionCopy}>Esta cuenta por cobrar ya está saldada. Seleccione otra cuenta por cobrar para registrar o aplicar un abono.</p><section className={styles.detailCard}><dl className={styles.facts}><div><dt>Saldo pendiente</dt><dd className={styles.pendingAmount}>{formatFinanceMoney(guardedReceivable.outstandingAmount, guardedReceivable.currencyCode)}</dd></div></dl></section><div className={styles.paymentActions}><Button className={styles.primaryAction} type="button" onClick={() => setGuardedReceivable(null)}>Entendido</Button></div></ActionModal>}
  </main>;
}

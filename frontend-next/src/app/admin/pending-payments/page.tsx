"use client";

export const dynamic = "force-dynamic";

import AttachmentViewer, { type Attachment } from "@/components/attachment-viewer";
import { LoadingModal } from "@/components/loading-modal";
import { DataTableShell } from "@/components/patterns/data-table-shell";
import { FormField } from "@/components/patterns/form-field";
import { PageHeader } from "@/components/patterns/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatFinancePaymentMethod } from "@/lib/finance-payment-methods";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconBadge } from "@/components/ui/icon-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getStoredSession, getStoredToken } from "@/lib/auth-api";
import { canReviewContractReservations, createContractReservationActionGate, normalizeRejectionReason, pendingReservationViewState } from "@/lib/contract-reservation-review";
import {
  approveContractReservationPayment,
  formatFinanceMoney,
  getContractReservationEvidence,
  getCustomerPaymentSettlementPreview,
  getInvoicePendingPaymentReviewDetail,
  getReportedInvoicePaymentEvidence,
  listPendingContractReservationPayments,
  precheckInvoicePendingPaymentApproval,
  rejectContractReservationPayment,
  type ContractReservationPayment,
  type InvoicePendingPaymentReview,
  type PendingPaymentReviewItem,
} from "@/lib/finance-api";
import { formatBusinessDate } from "@/shared/regional";
import { useTenantDateTimeFormatter } from "@/shared/regional/tenant-regional-provider";
import { Check, CircleAlert, CircleDollarSign, Paperclip, Plane, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type ViewerSession = {
  paymentId: string;
  customerId: string | null;
  reviewKind: "CONTRACT" | "INVOICES";
  attachments: Attachment[];
  initialIndex: number;
};

function isInvoicePayment(payment: PendingPaymentReviewItem): payment is InvoicePendingPaymentReview {
  return payment.reviewKind === "INVOICES";
}

const MONEY_DECIMAL_PLACES = 5;

function decimalToMinorUnits(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,5}))?$/.exec(value);
  if (!match) return null;
  return BigInt(match[1]) * BigInt(10 ** MONEY_DECIMAL_PLACES) + BigInt((match[2] ?? "").padEnd(MONEY_DECIMAL_PLACES, "0"));
}

function minorUnitsToDecimal(value: bigint): string {
  const scale = BigInt(10 ** MONEY_DECIMAL_PLACES);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(MONEY_DECIMAL_PLACES, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function sumMoney(values: string[]): string {
  const total = values.reduce<bigint>((sum, value) => sum + (decimalToMinorUnits(value) ?? BigInt(0)), BigInt(0));
  return minorUnitsToDecimal(total);
}

function isTargetStale(target: InvoicePendingPaymentReview["targets"][number]): boolean {
  const intended = decimalToMinorUnits(target.intendedAmount);
  const outstanding = target.currentOutstandingAmount ? decimalToMinorUnits(target.currentOutstandingAmount) : null;
  return intended === null || outstanding === null || intended > outstanding || target.currentStatus === "CANCELLED" || target.currentStatus === "SETTLED";
}

function invoiceApplicationCurrency(payment: InvoicePendingPaymentReview): string | null {
  const currencies = new Set(payment.targets.map((target) => target.currentCurrencyCode).filter((currency): currency is string => Boolean(currency)));
  return currencies.size === 1 ? [...currencies][0]! : null;
}

function InvoiceReviewDetails({
  payment,
  settlementPreview,
  onOpenEvidence,
}: {
  payment: InvoicePendingPaymentReview;
  settlementPreview: Awaited<ReturnType<typeof getCustomerPaymentSettlementPreview>> | null;
  onOpenEvidence: (index: number) => void;
}) {
  const applicationCurrencyCode = invoiceApplicationCurrency(payment);
  const proposedTotal = sumMoney(payment.targets.map((target) => target.intendedAmount));
  const settlementAmount = settlementPreview?.status === "AVAILABLE" && settlementPreview.settlementCurrencyCode === applicationCurrencyCode
    ? settlementPreview.settlementAmount
    : null;
  const settlementUnits = settlementAmount ? decimalToMinorUnits(settlementAmount) : null;
  const proposalUnits = decimalToMinorUnits(proposedTotal);
  const remainder = settlementUnits !== null && proposalUnits !== null && settlementUnits >= proposalUnits
    ? minorUnitsToDecimal(settlementUnits - proposalUnits)
    : null;
  const evidence = payment.evidence ?? [];

  return <div className="grid gap-3 text-sm">
    <p>Confirma que revisaste la información bancaria, los comprobantes y la propuesta de aplicación para <strong>{payment.customer.fullName}</strong>.</p>
    <div className="grid gap-1 rounded-md border border-border bg-muted/30 p-3 text-xs">
      <span>Monto recibido: <strong>{formatFinanceMoney(payment.receivedAmount, payment.currencyCode)}</strong></span>
      <span>Moneda de aplicación: <strong>{applicationCurrencyCode ?? "Pendiente de validar"}</strong></span>
      <span>Total propuesto: <strong>{applicationCurrencyCode ? formatFinanceMoney(proposedTotal, applicationCurrencyCode) : "Pendiente de validar"}</strong></span>
      <span>Saldo de aplicación sin asignar: <strong>{remainder !== null && applicationCurrencyCode ? formatFinanceMoney(remainder, applicationCurrencyCode) : "Pendiente de confirmación en Finance"}</strong></span>
    </div>
    <div className="grid gap-1 text-xs">
      <strong>Comprobantes</strong>
      {evidence.length ? evidence.map((item, index) => <Button key={item.id} type="button" variant="link" size="sm" className="w-fit px-0" onClick={() => onOpenEvidence(index)}><Paperclip aria-hidden="true" />{item.originalFileName}</Button>) : <span className="text-muted-foreground">Sin comprobantes identificables</span>}
    </div>
  </div>;
}

export default function PendingPaymentsPage() {
  const router = useRouter();
  const formatTenantDateTime = useTenantDateTimeFormatter();
  const [accessAllowed, setAccessAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PendingPaymentReviewItem[]>([]);
  const [statusText, setStatusText] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const actionGate = useRef(createContractReservationActionGate());
  const [approvePayment, setApprovePayment] = useState<PendingPaymentReviewItem | null>(null);
  const [invoiceSettlementPreview, setInvoiceSettlementPreview] = useState<Awaited<ReturnType<typeof getCustomerPaymentSettlementPreview>> | null>(null);
  const [rejectModalPaymentId, setRejectModalPaymentId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [viewerSession, setViewerSession] = useState<ViewerSession | null>(null);
  const [loadingModalOpen, setLoadingModalOpen] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<"loading" | "success" | "error">("loading");
  const [loadingModalMessage, setLoadingModalMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setStatusText("");
    try {
      const result = await listPendingContractReservationPayments(100);
      setPayments(result.payments);
    } catch (error) {
      setPayments([]);
      setStatusText(error instanceof Error ? error.message : "No se pudieron cargar los pagos pendientes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const session = getStoredSession();
    const allowed = Boolean(getStoredToken()) && canReviewContractReservations(session?.user?.role);
    setAccessAllowed(allowed);
    if (!allowed) {
      router.replace("/");
      return;
    }
    void load();
  }, [load, router]);

  const beginAction = (key: string, message: string): boolean => {
    if (!actionGate.current.begin()) return false;
    setActionBusy(key);
    setLoadingModalMessage(message);
    setLoadingModalState("loading");
    setLoadingModalOpen(true);
    return true;
  };

  const finishAction = () => {
    actionGate.current.end();
    setActionBusy("");
  };

  const openInvoiceApproval = async (payment: InvoicePendingPaymentReview) => {
    if (!beginAction(`detail:${payment.id}`, "Cargando revisión del pago de facturas...")) return;
    try {
      const detail = await getInvoicePendingPaymentReviewDetail(payment.id);
      const settlementCurrencyCode = invoiceApplicationCurrency(detail);
      let settlementPreview: Awaited<ReturnType<typeof getCustomerPaymentSettlementPreview>> | null = null;
      if (detail.customerId && settlementCurrencyCode) {
        try {
          settlementPreview = await getCustomerPaymentSettlementPreview(detail.customerId, {
            receivedCurrencyCode: detail.currencyCode as "CRC" | "USD",
            settlementCurrencyCode: settlementCurrencyCode as "CRC" | "USD",
            receivedAmount: detail.receivedAmount,
          });
        } catch {
          settlementPreview = null;
        }
      }
      setInvoiceSettlementPreview(settlementPreview);
      setApprovePayment(detail);
      setLoadingModalOpen(false);
    } catch (error) {
      setLoadingModalState("error");
      setLoadingModalMessage(error instanceof Error ? error.message : "No se pudo cargar la revisión del pago de facturas.");
    } finally {
      finishAction();
    }
  };

  const onApprove = async () => {
    if (!approvePayment || !beginAction(`approve:${approvePayment.id}`, isInvoicePayment(approvePayment) ? "Validando y aprobando pago de facturas..." : "Aprobando pago de reserva...")) return;
    const payment = approvePayment;
    const paymentId = approvePayment.id;
    try {
      if (isInvoicePayment(payment)) {
        await precheckInvoicePendingPaymentApproval(paymentId);
      }
      setApprovePayment(null);
      await approveContractReservationPayment(paymentId);
      setLoadingModalState("success");
      setLoadingModalMessage(isInvoicePayment(payment) ? "Pago de facturas aprobado exitosamente." : "Pago de reserva aprobado exitosamente.");
      await load();
    } catch (error) {
      setLoadingModalState("error");
      setLoadingModalMessage(error instanceof Error ? error.message : "No se pudo aprobar el pago de reserva.");
    } finally {
      finishAction();
    }
  };

  const onReject = async () => {
    let reason: string;
    try {
      reason = normalizeRejectionReason(rejectReason);
    } catch (error) {
      setRejectError(error instanceof Error ? error.message : "Debes proporcionar un motivo de rechazo.");
      return;
    }
    const payment = payments.find((item) => item.id === rejectModalPaymentId);
    const paymentLabel = payment && isInvoicePayment(payment) ? "pago de facturas" : "pago de reserva";
    if (!rejectModalPaymentId || !beginAction(`reject:${rejectModalPaymentId}`, `Rechazando ${paymentLabel}...`)) return;
    const paymentId = rejectModalPaymentId;
    try {
      await rejectContractReservationPayment(paymentId, reason);
      setLoadingModalState("success");
      setLoadingModalMessage(`${paymentLabel === "pago de facturas" ? "Pago de facturas" : "Pago de reserva"} rechazado exitosamente.`);
      setRejectModalPaymentId("");
      setRejectReason("");
      setRejectError("");
      await load();
    } catch (error) {
      setLoadingModalOpen(false);
      setRejectError(error instanceof Error ? error.message : `No se pudo rechazar el ${paymentLabel}.`);
    } finally {
      finishAction();
    }
  };

  const openEvidence = async (payment: ContractReservationPayment, initialIndex: number) => {
    const key = `evidence:${payment.id}`;
    if (!beginAction(key, "Cargando comprobantes...")) return;
    try {
      const selectedEvidence = payment.evidence[initialIndex];
      if (!selectedEvidence) throw new Error("No se encontró el comprobante seleccionado.");

      const selectedAccess = await getContractReservationEvidence(payment.id, selectedEvidence.id);
      setViewerSession({
        paymentId: payment.id,
        customerId: payment.customerId,
        reviewKind: "CONTRACT",
        attachments: payment.evidence.map((item) => ({
          id: item.id,
          originalFileName: item.originalFileName,
          mimeType: item.mimeType,
          ...(item.id === selectedEvidence.id ? { url: selectedAccess.url } : {}),
        })),
        initialIndex,
      });
      setLoadingModalOpen(false);
    } catch (error) {
      setLoadingModalState("error");
      setLoadingModalMessage(error instanceof Error ? error.message : "No se pudo abrir el comprobante.");
    } finally {
      finishAction();
    }
  };

  const openInvoiceEvidence = async (payment: InvoicePendingPaymentReview, initialIndex: number) => {
    const key = `evidence:${payment.id}`;
    if (!beginAction(key, "Cargando comprobantes...")) return;
    try {
      const detail = await getInvoicePendingPaymentReviewDetail(payment.id);
      const evidence = detail.evidence ?? [];
      const selectedEvidence = evidence[initialIndex];
      if (!selectedEvidence || !detail.customerId) throw new Error("Sin comprobantes identificables.");
      const selectedAccess = await getReportedInvoicePaymentEvidence(detail.customerId, detail.id, selectedEvidence.id);
      setViewerSession({
        paymentId: detail.id,
        customerId: detail.customerId,
        reviewKind: "INVOICES",
        attachments: evidence.map((item) => ({
          id: item.id,
          originalFileName: item.originalFileName,
          mimeType: item.mimeType,
          ...(item.id === selectedEvidence.id ? { url: selectedAccess.url } : {}),
        })) ?? [],
        initialIndex,
      });
      setLoadingModalOpen(false);
    } catch (error) {
      setLoadingModalState("error");
      setLoadingModalMessage(error instanceof Error ? error.message : "No se pudo abrir el comprobante.");
    } finally {
      finishAction();
    }
  };

  const resolveEvidenceUrl = useCallback(async (attachment: Attachment, signal: AbortSignal) => {
    if (!viewerSession) throw new Error("No hay comprobante seleccionado.");
    if (viewerSession.reviewKind === "INVOICES") {
      if (!viewerSession.customerId) throw new Error("No se pudo identificar el cliente del comprobante.");
      const evidence = await getReportedInvoicePaymentEvidence(viewerSession.customerId, viewerSession.paymentId, attachment.id, signal);
      return evidence.url;
    }
    const evidence = await getContractReservationEvidence(viewerSession.paymentId, attachment.id, signal);
    return evidence.url;
  }, [viewerSession]);

  const closeRejectDialog = () => {
    if (actionBusy) return;
    setRejectModalPaymentId("");
    setRejectReason("");
    setRejectError("");
  };

  if (accessAllowed !== true) {
    return (
      <main className="app-shell">
        <section className="rounded-xl border border-border bg-card p-5 shadow-ui-xs">
          <PageHeader title="Pagos pendientes" description="Validando acceso..." />
        </section>
      </main>
    );
  }

  const viewState = pendingReservationViewState({ loading, error: statusText, count: payments.length });

  return (
    <main className="app-shell space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <IconBadge tone="warning"><CircleDollarSign aria-hidden="true" /></IconBadge>
            Pagos pendientes
          </span>
        }
        description="Revisa y valida los pagos pendientes de verificación."
        meta={
          !loading ? <Badge variant="warning">{payments.length} pendiente{payments.length === 1 ? "" : "s"}</Badge> : null
        }
      />

      <DataTableShell
        toolbar={<div><h2 className="text-base font-semibold tracking-tight">Pagos por verificar</h2><p className="mt-1 text-sm text-muted-foreground">Valida la información reportada, los comprobantes y la referencia antes de tomar una decisión.</p></div>}
        state={viewState === "loading" ? <span>Cargando pagos pendientes...</span> : viewState === "error" ? <Alert variant="destructive" className="text-left"><AlertTitle>No se pudieron cargar los pagos</AlertTitle><AlertDescription>{statusText}</AlertDescription></Alert> : viewState === "empty" ? <div className="mx-auto max-w-sm"><IconBadge tone="success" className="mb-3 size-10 [&_svg]:size-5"><Check aria-hidden="true" /></IconBadge><h3 className="text-base font-semibold text-foreground">¡Todo al día!</h3><p className="mt-1">No hay pagos pendientes de revisión.</p></div> : undefined}
      >
        <Table className="min-w-[1180px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[10%]">Fecha reportada</TableHead>
              <TableHead className="w-[17%]">Cliente</TableHead>
              <TableHead className="w-[24%]">Contrato / viaje / facturas</TableHead>
              <TableHead className="w-[11%]">Monto</TableHead>
              <TableHead className="w-[17%]">Referencia / descripción</TableHead>
              <TableHead className="w-[10%]">Evidencias</TableHead>
              <TableHead className="w-[7%]">Estado</TableHead>
              <TableHead className="w-[8%]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
                {payments.map((payment) => {
                  if (isInvoicePayment(payment)) {
                    const proposalTotal = sumMoney(payment.targets.map((target) => target.intendedAmount));
                    const applicationCurrencyCode = invoiceApplicationCurrency(payment);
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="text-muted-foreground">{formatTenantDateTime(payment.receivedAt)}</TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{payment.customer.fullName}</div>
                          {payment.customer.idNumber ? <div className="mt-1 text-xs text-muted-foreground">{payment.customer.idNumber}</div> : null}
                          {payment.customer.email ? <div className="truncate text-xs text-muted-foreground">{payment.customer.email}</div> : null}
                          {payment.customer.phone ? <div className="text-xs text-muted-foreground">{payment.customer.phone}</div> : null}
                        </TableCell>
                        <TableCell>
                          <div className="grid gap-2">
                            <Badge variant="secondary" className="w-fit">Pago de facturas</Badge>
                            <div className="grid gap-1 text-xs text-muted-foreground">
                              {payment.targets.map((target) => {
                                    const stale = isTargetStale(target);
                                const reference = target.fiscalNumber ?? target.reference ?? "Factura sin referencia";
                                return <div key={target.accountReceivableId} className={stale ? "rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive" : "rounded-md border border-border p-2"}>
                                  <div className="font-medium text-foreground">{reference}</div>
                                  {target.issuedAt ? <div>Emitida: {formatBusinessDate(target.issuedAt)}</div> : null}
                                  <div>Solicitado: {formatFinanceMoney(target.intendedAmount, target.currentCurrencyCode ?? applicationCurrencyCode ?? payment.currencyCode)}</div>
                                  <div>Saldo actual: {target.currentOutstandingAmount === null ? "No disponible" : formatFinanceMoney(target.currentOutstandingAmount, target.currentCurrencyCode ?? applicationCurrencyCode ?? payment.currencyCode)}</div>
                                  {stale ? <div className="mt-1 font-medium">Esta factura ya no tiene saldo suficiente para aplicar el monto solicitado.</div> : null}
                                </div>;
                              })}
                            </div>
                            <div className="grid gap-1 text-xs text-muted-foreground">
                              <span>Monto recibido: {formatFinanceMoney(payment.receivedAmount, payment.currencyCode)}</span>
                              <span>Moneda de aplicación: {applicationCurrencyCode ?? "Pendiente de validar"}</span>
                              <span>Total propuesto: {applicationCurrencyCode ? formatFinanceMoney(proposalTotal, applicationCurrencyCode) : "Pendiente de validar"}</span>
                              <span>Saldo de aplicación: abra la revisión para validarlo con Finance.</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold whitespace-nowrap">{formatFinanceMoney(payment.receivedAmount, payment.currencyCode)}</TableCell>
                        <TableCell>
                          <div className="grid gap-1 text-sm">
                            <span>Referencia: {payment.externalReference || "No indicada"}</span>
                            <span className="text-xs text-muted-foreground">Método: {formatFinancePaymentMethod(payment.paymentMethod)}</span>
                                {payment.description ? <span className="text-xs text-muted-foreground">{payment.description}</span> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button type="button" variant="link" size="sm" className="max-w-full justify-start px-0 text-left" disabled={actionBusy === `evidence:${payment.id}`} onClick={() => void openInvoiceEvidence(payment, 0)}>
                            <Paperclip aria-hidden="true" /> <span className="truncate">Ver comprobantes</span>
                          </Button>
                        </TableCell>
                        <TableCell><Badge variant="warning" className="whitespace-nowrap">Pendiente</Badge></TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-2">
                            <Button type="button" size="sm" onClick={() => void openInvoiceApproval(payment)} disabled={Boolean(actionBusy)}><Check aria-hidden="true" /> Aprobar</Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => { setRejectModalPaymentId(payment.id); setRejectReason(""); setRejectError(""); }} disabled={Boolean(actionBusy)}><X aria-hidden="true" /> Rechazar</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  const contract = payment.contract;
                  const trip = contract.travelPackage ?? contract.internalTrip;
                  return (
                    <TableRow key={payment.id}>
                      <TableCell className="text-muted-foreground">{formatTenantDateTime(payment.receivedAt)}</TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">{contract.client.fullName}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{contract.client.idNumber}</div>
                        <div className="truncate text-xs text-muted-foreground">{contract.client.email}</div>
                        {contract.client.phone ? <div className="text-xs text-muted-foreground">{contract.client.phone}</div> : null}
                      </TableCell>
                      <TableCell>
                        <div className="grid gap-1">
                          <strong>{contract.contractNumber}</strong>
                          <span className="text-xs text-muted-foreground">{contract.destination}</span>
                          {trip ? <><span className="flex items-center gap-1 text-xs text-muted-foreground"><Plane aria-hidden="true" className="size-3" /> {trip.name}</span><span className="text-xs text-muted-foreground">{formatBusinessDate(trip.departureDate)} → {formatBusinessDate(trip.returnDate)}</span></> : null}
                          <span className="text-xs text-muted-foreground">Contrato: {contract.status}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold whitespace-nowrap">{formatFinanceMoney(payment.receivedAmount, payment.currencyCode)}</TableCell>
                      <TableCell>
                        <div className="grid gap-1 text-sm">
                          <span>Referencia: {payment.externalReference || "No indicada"}</span>
                          <span className="text-xs text-muted-foreground">Método: {formatFinancePaymentMethod(payment.paymentMethod)}</span>
                          {payment.description ? <span className="text-xs text-muted-foreground">{payment.description}</span> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {payment.evidence.length ? payment.evidence.map((item, index) => (
                          <Button key={item.id} type="button" variant="link" size="sm" className="max-w-full justify-start px-0 text-left" disabled={actionBusy === `evidence:${payment.id}`} onClick={() => void openEvidence(payment, index)}>
                            <Paperclip aria-hidden="true" /> <span className="truncate">{item.originalFileName}</span>
                          </Button>
                        )) : <span className="text-xs text-muted-foreground">Sin comprobantes identificables</span>}
                      </TableCell>
                      <TableCell><Badge variant="warning" className="whitespace-nowrap">Pendiente</Badge></TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <Button type="button" size="sm" onClick={() => setApprovePayment(payment)} disabled={Boolean(actionBusy)}><Check aria-hidden="true" /> Aprobar</Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => { setRejectModalPaymentId(payment.id); setRejectReason(""); setRejectError(""); }} disabled={Boolean(actionBusy)}><X aria-hidden="true" /> Rechazar</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </DataTableShell>

      <ConfirmDialog
        open={Boolean(approvePayment)}
        onOpenChange={(open) => { if (!open && !actionBusy) setApprovePayment(null); }}
        title="Aprobar pago"
        description={approvePayment
          ? isInvoicePayment(approvePayment)
            ? "Confirma que revisaste la información bancaria, la propuesta de aplicación y los comprobantes."
            : <>Confirma que revisaste la información bancaria y los comprobantes de <strong>{approvePayment.contract.contractNumber}</strong>{` para ${approvePayment.contract.client.fullName}`}.</>
          : null}
        content={approvePayment && isInvoicePayment(approvePayment)
          ? <InvoiceReviewDetails payment={approvePayment} settlementPreview={invoiceSettlementPreview} onOpenEvidence={(index) => void openInvoiceEvidence(approvePayment, index)} />
          : null}
        cancelLabel="Cancelar"
        confirmLabel="Aprobar pago"
        pendingLabel="Aprobando..."
        isPending={actionBusy.startsWith("approve:")}
        onConfirm={() => void onApprove()}
      />

      <Dialog open={Boolean(rejectModalPaymentId)} onOpenChange={(open) => { if (!open) closeRejectDialog(); }}>
        <DialogContent showCloseButton={!actionBusy}>
          <DialogHeader>
            <DialogTitle>Rechazar pago</DialogTitle>
            <DialogDescription>Indica el motivo para que el pago pueda ser revisado nuevamente.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-3">
            {rejectError ? <Alert variant="destructive"><CircleAlert aria-hidden="true" className="absolute top-3 left-4 size-4" /><AlertTitle className="ml-6">No se pudo rechazar el pago</AlertTitle><AlertDescription className="ml-6">{rejectError}</AlertDescription></Alert> : null}
            <FormField label="Razón del rechazo" htmlFor="pending-payment-rejection-reason" required>
              <Textarea id="pending-payment-rejection-reason" rows={5} maxLength={500} value={rejectReason} onChange={(event) => { setRejectReason(event.target.value); setRejectError(""); }} placeholder="Describe por qué el pago no coincide con la verificación bancaria" disabled={Boolean(actionBusy)} />
            </FormField>
            <p className="text-right text-xs text-muted-foreground">{rejectReason.length}/500</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeRejectDialog} disabled={Boolean(actionBusy)}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={() => void onReject()} disabled={Boolean(actionBusy) || !rejectReason.trim()}>{actionBusy.startsWith("reject:") ? "Procesando..." : "Rechazar pago"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewerSession ? <AttachmentViewer attachments={viewerSession.attachments} initialIndex={viewerSession.initialIndex} resolveAttachmentUrl={resolveEvidenceUrl} onClose={() => setViewerSession(null)} /> : null}
      <LoadingModal isOpen={loadingModalOpen} state={loadingModalState} loadingMessage={loadingModalMessage} successMessage={loadingModalMessage} errorMessage={loadingModalMessage} onClose={() => setLoadingModalOpen(false)} autoCloseDelay={1800} />
    </main>
  );
}

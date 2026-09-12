"use client";

export const dynamic = "force-dynamic";

import AttachmentViewer, { type Attachment } from "@/components/attachment-viewer";
import { LoadingModal } from "@/components/loading-modal";
import { DataTableShell } from "@/components/patterns/data-table-shell";
import { FormField } from "@/components/patterns/form-field";
import { PageHeader } from "@/components/patterns/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  listPendingContractReservationPayments,
  rejectContractReservationPayment,
  type ContractReservationPayment,
} from "@/lib/finance-api";
import { formatBusinessDate, formatBusinessDateTime } from "@/shared/regional";
import { Check, CircleAlert, CircleDollarSign, Paperclip, Plane, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type ViewerSession = {
  paymentId: string;
  attachments: Attachment[];
  initialIndex: number;
};

export default function PendingPaymentsPage() {
  const router = useRouter();
  const [accessAllowed, setAccessAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<ContractReservationPayment[]>([]);
  const [statusText, setStatusText] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const actionGate = useRef(createContractReservationActionGate());
  const [approvePayment, setApprovePayment] = useState<ContractReservationPayment | null>(null);
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
      setStatusText(error instanceof Error ? error.message : "No se pudieron cargar los pagos de reserva pendientes.");
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

  const onApprove = async () => {
    if (!approvePayment || !beginAction(`approve:${approvePayment.id}`, "Aprobando pago de reserva...")) return;
    const paymentId = approvePayment.id;
    setApprovePayment(null);
    try {
      await approveContractReservationPayment(paymentId);
      setLoadingModalState("success");
      setLoadingModalMessage("Pago de reserva aprobado exitosamente.");
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
    if (!rejectModalPaymentId || !beginAction(`reject:${rejectModalPaymentId}`, "Rechazando pago de reserva...")) return;
    const paymentId = rejectModalPaymentId;
    try {
      await rejectContractReservationPayment(paymentId, reason);
      setLoadingModalState("success");
      setLoadingModalMessage("Pago de reserva rechazado exitosamente.");
      setRejectModalPaymentId("");
      setRejectReason("");
      setRejectError("");
      await load();
    } catch (error) {
      setLoadingModalOpen(false);
      setRejectError(error instanceof Error ? error.message : "No se pudo rechazar el pago de reserva.");
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

  const resolveEvidenceUrl = useCallback(async (attachment: Attachment, signal: AbortSignal) => {
    if (!viewerSession) throw new Error("No hay comprobante seleccionado.");
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
        description="Revisa y valida los pagos de reservación pendientes de verificación."
        meta={
          !loading ? <Badge variant="warning">{payments.length} pendiente{payments.length === 1 ? "" : "s"}</Badge> : null
        }
      />

      <DataTableShell
        toolbar={<div><h2 className="text-base font-semibold tracking-tight">Pagos por verificar</h2><p className="mt-1 text-sm text-muted-foreground">Valida la información reportada, los comprobantes y la referencia antes de tomar una decisión.</p></div>}
        state={viewState === "loading" ? <span>Cargando pagos de reserva pendientes...</span> : viewState === "error" ? <Alert variant="destructive" className="text-left"><AlertTitle>No se pudieron cargar los pagos</AlertTitle><AlertDescription>{statusText}</AlertDescription></Alert> : viewState === "empty" ? <div className="mx-auto max-w-sm"><IconBadge tone="success" className="mb-3 size-10 [&_svg]:size-5"><Check aria-hidden="true" /></IconBadge><h3 className="text-base font-semibold text-foreground">¡Todo al día!</h3><p className="mt-1">No hay pagos de reserva pendientes de revisión.</p></div> : undefined}
      >
        <Table className="min-w-[1180px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[10%]">Fecha reportada</TableHead>
              <TableHead className="w-[17%]">Cliente</TableHead>
              <TableHead className="w-[20%]">Contrato / viaje</TableHead>
              <TableHead className="w-[11%]">Monto</TableHead>
              <TableHead className="w-[17%]">Referencia / descripción</TableHead>
              <TableHead className="w-[10%]">Evidencias</TableHead>
              <TableHead className="w-[7%]">Estado</TableHead>
              <TableHead className="w-[8%]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
                {payments.map((payment) => {
                  const contract = payment.contract;
                  const trip = contract.travelPackage ?? contract.internalTrip;
                  return (
                    <TableRow key={payment.id}>
                      <TableCell className="text-muted-foreground">{formatBusinessDateTime(payment.receivedAt)}</TableCell>
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
                          <span className="text-xs text-muted-foreground">Método: {payment.paymentMethod}</span>
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
        description={<>Confirma que revisaste la información bancaria y los comprobantes de <strong>{approvePayment?.contract.contractNumber}</strong>{approvePayment ? ` para ${approvePayment.contract.client.fullName}` : ""}.</>}
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

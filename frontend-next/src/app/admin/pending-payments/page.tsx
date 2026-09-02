"use client";

export const dynamic = "force-dynamic";

import AttachmentViewer from "@/components/attachment-viewer";
import { ConfirmModal } from "@/components/confirm-modal";
import { LoadingModal } from "@/components/loading-modal";
import { getStoredSession, getStoredToken } from "@/lib/auth-api";
import { canReviewContractReservations, createContractReservationActionGate, normalizeRejectionReason, pendingReservationViewState, toViewerAttachments } from "@/lib/contract-reservation-review";
import {
  approveContractReservationPayment,
  formatFinanceMoney,
  getContractReservationEvidence,
  listPendingContractReservationPayments,
  rejectContractReservationPayment,
  type ContractReservationPayment,
} from "@/lib/finance-api";
import { formatBusinessDate } from "@/shared/regional";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("es-CR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

type ViewerAttachment = { id: string; originalFileName: string; url: string; mimeType: string };

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
  const [viewerAttachments, setViewerAttachments] = useState<ViewerAttachment[] | null>(null);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
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
      setStatusText(error instanceof Error ? error.message : "Debes proporcionar un motivo de rechazo.");
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
      await load();
    } catch (error) {
      setLoadingModalState("error");
      setLoadingModalMessage(error instanceof Error ? error.message : "No se pudo rechazar el pago de reserva.");
    } finally {
      finishAction();
    }
  };

  const openEvidence = async (payment: ContractReservationPayment, initialIndex: number) => {
    const key = `evidence:${payment.id}`;
    if (!beginAction(key, "Cargando comprobantes...")) return;
    try {
      const evidence = await Promise.all(payment.evidence.map((item) => getContractReservationEvidence(payment.id, item.id)));
      setViewerAttachments(toViewerAttachments(evidence));
      setViewerInitialIndex(initialIndex);
      setLoadingModalOpen(false);
    } catch (error) {
      setLoadingModalState("error");
      setLoadingModalMessage(error instanceof Error ? error.message : "No se pudo abrir el comprobante.");
    } finally {
      finishAction();
    }
  };

  if (accessAllowed !== true) {
    return <main className="app-shell"><section className="card contracts-card"><h1>💰 Pagos Pendientes de Verificación</h1><p className="m-0 text-[#4b6790] text-sm">Validando acceso...</p></section></main>;
  }

  const viewState = pendingReservationViewState({ loading, error: statusText, count: payments.length });

  return (
    <main className="app-shell">
      <section className="card contracts-card">
        <h1>💰 Pagos Pendientes de Verificación</h1>
        <p className="m-0 text-[#4b6790] text-sm">Revisa los pagos de reserva reportados y su evidencia antes de aprobarlos o rechazarlos.</p>

        {statusText ? <p className="status-line">{statusText}</p> : null}
        {viewState === "loading" ? (
          <p className="m-0 text-[#4b6790] text-sm">Cargando pagos de reserva pendientes...</p>
        ) : viewState === "empty" ? (
          <div className="empty-state" style={{ padding: "40px 20px", textAlign: "center" }}>
            <div className="empty-state-icon" style={{ fontSize: "48px", marginBottom: "12px" }}>✅</div>
            <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>¡Todo al día!</h3>
            <p className="m-0 text-[#4b6790] text-sm">No hay pagos de reserva pendientes de revisión.</p>
          </div>
        ) : viewState === "ready" ? (
          <div className="history-table-wrap" style={{ marginTop: "16px" }}>
            <table className="history-table">
              <thead><tr><th>Fecha reporte</th><th>Cliente</th><th>Contrato y viaje</th><th>Monto</th><th>Información del pago</th><th>Comprobantes</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {payments.map((payment) => {
                  const contract = payment.contract;
                  const trip = contract.travelPackage ?? contract.internalTrip;
                  return (
                    <tr key={payment.id}>
                      <td>{formatDateTime(payment.receivedAt)}</td>
                      <td>
                        <div className="history-col-name">{contract.client.fullName}</div>
                        <div className="history-col-muted">{contract.client.idNumber}</div>
                        <div className="history-col-muted">{contract.client.email}</div>
                        {contract.client.phone ? <div className="history-col-muted">{contract.client.phone}</div> : null}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                          <strong>{contract.contractNumber}</strong>
                          <span className="history-col-muted">{contract.destination}</span>
                          {trip ? <><span style={{ color: "#4b6790", fontSize: "0.85rem" }}>✈️ {trip.name}</span><span className="history-col-muted">📅 {formatBusinessDate(trip.departureDate)} → {formatBusinessDate(trip.returnDate)}</span></> : null}
                          <span className="history-col-muted">Contrato: {contract.status}</span>
                        </div>
                      </td>
                      <td><strong>{formatFinanceMoney(payment.receivedAmount, payment.currencyCode)}</strong></td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span>Referencia: {payment.externalReference || "No indicada"}</span>
                          <span className="history-col-muted">Método: {payment.paymentMethod}</span>
                          {payment.description ? <span className="history-col-muted">{payment.description}</span> : null}
                        </div>
                      </td>
                      <td>
                        {payment.evidence.length ? payment.evidence.map((item, index) => (
                          <button key={item.id} type="button" disabled={actionBusy === `evidence:${payment.id}`} onClick={() => void openEvidence(payment, index)} style={{ display: "flex", border: 0, padding: "2px 0", background: "transparent", color: "#0066cc", cursor: "pointer", textAlign: "left", textDecoration: "underline" }}>
                            📎 {item.originalFileName}
                          </button>
                        )) : <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>Sin comprobantes identificables</span>}
                      </td>
                      <td><span className="contract-status status-review">PENDIENTE DE VERIFICACIÓN</span></td>
                      <td>
                        <div className="history-actions">
                          <button type="button" className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => setApprovePayment(payment)} disabled={Boolean(actionBusy)}>✓ Aprobar</button>
                          <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => { setRejectModalPaymentId(payment.id); setRejectReason(""); setStatusText(""); }} disabled={Boolean(actionBusy)}>✗ Rechazar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <ConfirmModal isOpen={Boolean(approvePayment)} title="Aprobar pago de reserva" message={<>Confirma que revisaste la información bancaria y los comprobantes de <strong>{approvePayment?.contract.contractNumber}</strong>.</>} confirmText="Aprobar pago" isLoading={actionBusy.startsWith("approve:")} onCancel={() => setApprovePayment(null)} onConfirm={() => void onApprove()} />

      {rejectModalPaymentId ? (
        <section className="viewer-modal" onClick={(event) => { if (event.target === event.currentTarget && !actionBusy) setRejectModalPaymentId(""); }}>
          <div className="viewer-panel reject-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="viewer-head"><h2>Rechazar Pago</h2><button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold" onClick={() => setRejectModalPaymentId("")} disabled={Boolean(actionBusy)}>Cerrar</button></div>
            <div className="viewer-body">
              <label className="reject-modal-label">Motivo del rechazo<textarea rows={5} maxLength={500} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Describe por qué el pago no coincide con la verificación bancaria" /></label>
              <div className="history-col-muted" style={{ textAlign: "right" }}>{rejectReason.length}/500</div>
              <div className="actions" style={{ marginTop: "12px" }}><button type="button" className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => void onReject()} disabled={Boolean(actionBusy) || !rejectReason.trim()}>{actionBusy.startsWith("reject:") ? "Procesando..." : "Confirmar rechazo"}</button></div>
            </div>
          </div>
        </section>
      ) : null}

      {viewerAttachments ? <AttachmentViewer attachments={viewerAttachments} initialIndex={viewerInitialIndex} onClose={() => setViewerAttachments(null)} /> : null}
      <LoadingModal isOpen={loadingModalOpen} state={loadingModalState} loadingMessage={loadingModalMessage} successMessage={loadingModalMessage} errorMessage={loadingModalMessage} onClose={() => setLoadingModalOpen(false)} autoCloseDelay={1800} />
    </main>
  );
}

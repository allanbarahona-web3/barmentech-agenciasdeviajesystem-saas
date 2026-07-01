"use client";

export const dynamic = 'force-dynamic';

import { getStoredSession, getStoredToken } from "@/lib/auth-api";
import {
  getBillingAdminReports,
  verifyBillingPayment,
  rejectBillingPayment,
  type BillingAdminReportData,
} from "@/lib/billing-api";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AttachmentViewer from "@/components/attachment-viewer";
import { LoadingModal } from "@/components/loading-modal";

const formatMoney = (value: number): string => `USD ${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

const formatDateTime = (value: string): string => {
  try {
    const date = new Date(value);
    return date.toLocaleString("es-CR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "-";
  }
};

type ViewerAttachment = {
  id: string;
  originalFileName: string;
  url: string;
  mimeType: string;
};

const formatDate = (value: string): string => {
  try {
    const date = new Date(value);
    return date.toLocaleDateString("es-CR", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "-";
  }
};

export default function PendingPaymentsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BillingAdminReportData | null>(null);
  const [actionBusy, setActionBusy] = useState("");
  const [rejectModalPaymentId, setRejectModalPaymentId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [statusText, setStatusText] = useState("");
  const [viewerAttachments, setViewerAttachments] = useState<ViewerAttachment[] | null>(null);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);

  // Estados para LoadingModal
  const [loadingModalOpen, setLoadingModalOpen] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<"loading" | "success" | "error">("loading");
  const [loadingModalMessage, setLoadingModalMessage] = useState("");
  const [loadingModalSuccessMsg, setLoadingModalSuccessMsg] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const result = await getBillingAdminReports({
        paymentStatus: "ABONO_REPORTADO,ABONO_EN_REVISION",
        limitPayments: 100,
      });
      setData(result);
    } catch (fetchError) {
      setStatusText(fetchError instanceof Error ? fetchError.message : "No se pudo cargar los pagos pendientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    
    const token = getStoredToken();
    const session = getStoredSession();
    const role = String(session?.user?.role || "").toUpperCase();
    const isAuthorized = ["ADMIN", "FACTURACION_COBROS"].includes(role);
    
    if (!token || !isAuthorized) {
      router.replace("/");
      return;
    }
    
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const onVerify = async (paymentId: string) => {
    setActionBusy(`verify:${paymentId}`);
    
    // Abrir modal de loading
    setLoadingModalMessage("Verificando pago...");
    setLoadingModalState("loading");
    setLoadingModalOpen(true);
    
    try {
      await verifyBillingPayment(paymentId);
      
      // Cambiar a estado de éxito
      setLoadingModalState("success");
      setLoadingModalSuccessMsg("✅ Pago verificado exitosamente");
      
      await load();
    } catch (actionError) {
      // Cambiar a estado de error
      setLoadingModalState("error");
      setLoadingModalSuccessMsg(actionError instanceof Error ? actionError.message : "No se pudo verificar el pago.");
    } finally {
      setActionBusy("");
    }
  };

  const onReject = async () => {
    if (!rejectModalPaymentId || !rejectReason.trim()) {
      setStatusText("❌ Debes proporcionar un motivo de rechazo.");
      return;
    }

    setActionBusy(`reject:${rejectModalPaymentId}`);
    
    // Abrir modal de loading
    setLoadingModalMessage("Rechazando pago...");
    setLoadingModalState("loading");
    setLoadingModalOpen(true);
    
    try {
      await rejectBillingPayment(rejectModalPaymentId, rejectReason);
      
      // Cambiar a estado de éxito
      setLoadingModalState("success");
      setLoadingModalSuccessMsg("✅ Pago rechazado exitosamente");
      
      setRejectModalPaymentId("");
      setRejectReason("");
      await load();
    } catch (actionError) {
      // Cambiar a estado de error
      setLoadingModalState("error");
      setLoadingModalSuccessMsg(actionError instanceof Error ? actionError.message : "No se pudo rechazar el pago.");
    } finally {
      setActionBusy("");
    }
  };

  // Mostrar loader hasta que el componente esté montado en el cliente
  if (!mounted) {
    return (
      <main className="app-shell">
        <section className="card contracts-card">
          <h1>💰 Pagos Pendientes de Verificación</h1>
          <p className="m-0 text-[#4b6790] text-sm">Cargando...</p>
        </section>
      </main>
    );
  }

  const pendingPayments = data?.payments.filter((p) => ["ABONO_REPORTADO", "ABONO_EN_REVISION"].includes(p.status)) || [];

  return (
    <main className="app-shell">
      <section className="card contracts-card">
        <h1>💰 Pagos Pendientes de Verificación</h1>
        <p className="m-0 text-[#4b6790] text-sm">Revisa y aprueba los pagos reportados por los agentes.</p>

        {statusText ? <p className="status-line">{statusText}</p> : null}

        {loading ? (
          <p className="m-0 text-[#4b6790] text-sm">Cargando pagos pendientes...</p>
        ) : pendingPayments.length === 0 ? (
          <div className="empty-state" style={{ padding: "40px 20px", textAlign: "center" }}>
            <div className="empty-state-icon" style={{ fontSize: "48px", marginBottom: "12px" }}>✅</div>
            <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>¡Todo al día!</h3>
            <p className="m-0 text-[#4b6790] text-sm" style={{ margin: 0 }}>No hay pagos pendientes de verificación.</p>
          </div>
        ) : (
          <div className="history-table-wrap" style={{ marginTop: "16px" }}>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Fecha Reporte</th>
                  <th>Cliente</th>
                  <th>Contrato</th>
                  <th>Monto</th>
                  <th>Referencia</th>
                  <th>Pagador</th>
                  <th>Comprobantes</th>
                  <th>Reportado por</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pendingPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatDateTime(payment.reportedAt)}</td>
                    <td>
                      <div className="history-col-name">{payment.client.fullName}</div>
                      <div className="history-col-muted">{payment.client.email}</div>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <strong style={{ fontSize: "0.95rem" }}>{payment.invoice.contractNumber}</strong>
                        
                        {payment.travel && payment.travel.name ? (
                          <div style={{ fontSize: "0.85rem", color: "#4b6790", lineHeight: "1.4" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <span>✈️</span>
                              <span style={{ fontWeight: 500 }}>{payment.travel.name}</span>
                            </div>
                            {payment.travel.departureDate && payment.travel.returnDate ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                                <span>📅</span>
                                <span>{formatDate(payment.travel.departureDate)} → {formatDate(payment.travel.returnDate)}</span>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        
                        <span style={{ fontSize: "0.85rem", color: "#666" }}>
                          {payment.type === "RESERVATION" ? "🔖 Reserva" : payment.type === "INSTALLMENT" ? "💰 Cuota" : payment.type}
                        </span>
                      </div>
                    </td>
                    <td>
                      <strong>{formatMoney(payment.amount)}</strong>
                    </td>
                    <td>{payment.bankReference || "-"}</td>
                    <td>{payment.payerName || "-"}</td>
                    <td>
                      {payment.attachments && payment.attachments.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {payment.attachments.map((att, idx) => (
                            <button
                              key={att.id}
                              onClick={() => {
                                setViewerAttachments(payment.attachments || []);
                                setViewerInitialIndex(idx);
                              }}
                              style={{ 
                                fontSize: "0.85rem", 
                                color: "#0066cc",
                                background: "transparent",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                                textDecoration: "underline",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                textAlign: "left"
                              }}
                            >
                              📎 {att.originalFileName}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: "#999", fontSize: "0.85rem" }}>Sin adjuntos</span>
                      )}
                    </td>
                    <td>{payment.createdByName}</td>
                    <td>
                      <span
                        className={`contract-status ${
                          payment.status === "ABONO_REPORTADO" ? "status-pending" : payment.status === "ABONO_EN_REVISION" ? "status-review" : "status-signed"
                        }`}
                      >
                        {payment.status}
                      </span>
                    </td>
                    <td>
                      <div className="history-actions">
                        <button
                          type="button"
                          className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                          onClick={() => void onVerify(payment.id)}
                          disabled={actionBusy === `verify:${payment.id}`}
                          style={{ marginRight: "8px" }}
                        >
                          {actionBusy === `verify:${payment.id}` ? "..." : "✓ Aprobar"}
                        </button>
                        <button
                          type="button"
                          className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                          onClick={() => {
                            setRejectModalPaymentId(payment.id);
                            setRejectReason("");
                          }}
                          disabled={actionBusy === `reject:${payment.id}`}
                        >
                          ✗ Rechazar
                        </button>
                        <button
                          type="button"
                          className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                          onClick={() => router.push(`/billing/${payment.contractId}`)}
                          style={{ marginLeft: "8px" }}
                        >
                          Ver cuenta
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal de Rechazo */}
      {rejectModalPaymentId ? (
        <section
          className="viewer-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setRejectModalPaymentId("");
            }
          }}
        >
          <div className="viewer-panel reject-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="viewer-head">
              <h2>Rechazar Pago</h2>
              <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0" onClick={() => setRejectModalPaymentId("")}>
                Cerrar
              </button>
            </div>

            <div className="viewer-body">
              <label className="reject-modal-label">
                Motivo del rechazo
                <textarea
                  rows={5}
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder="Describe por qué el pago no coincide con la verificación bancaria"
                />
              </label>

              <div className="actions" style={{ marginTop: "12px" }}>
                <button type="button" className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg" onClick={() => void onReject()} disabled={actionBusy.startsWith("reject:")}>
                  {actionBusy.startsWith("reject:") ? "Procesando..." : "Confirmar rechazo"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Visor de Attachments con Zoom */}
      {viewerAttachments && (
        <AttachmentViewer
          attachments={viewerAttachments}
          initialIndex={viewerInitialIndex}
          onClose={() => setViewerAttachments(null)}
        />
      )}

      {/* Loading Modal Animado */}
      <LoadingModal
        isOpen={loadingModalOpen}
        state={loadingModalState}
        loadingMessage={loadingModalMessage}
        successMessage={loadingModalSuccessMsg}
        errorMessage={loadingModalSuccessMsg}
        onClose={() => setLoadingModalOpen(false)}
        autoCloseDelay={1800}
      />
    </main>
  );
}

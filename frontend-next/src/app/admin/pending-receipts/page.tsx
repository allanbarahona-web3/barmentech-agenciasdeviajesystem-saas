"use client";

export const dynamic = 'force-dynamic';

import { getStoredSession, getStoredToken } from "@/lib/auth-api";
import { approveAndSendBillingReceipt } from "@/lib/billing-api";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const formatMoney = (value: number): string => `USD ${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

const formatDateTime = (value: string): string => {
  try {
    const date = new Date(value);
    return date.toLocaleString("es-CR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "-";
  }
};

type PendingReceipt = {
  receiptId: string;
  receiptNumber: string;
  contractId: string;
  contractNumber: string;
  amount: number;
  issuedAt: string;
  clientName: string;
  clientEmail: string;
  paymentId: string;
  paymentDate: string;
};

export default function PendingReceiptsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState<PendingReceipt[]>([]);
  const [actionBusy, setActionBusy] = useState("");
  const [emailModalReceipt, setEmailModalReceipt] = useState<PendingReceipt | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [statusText, setStatusText] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [mounted, setMounted] = useState(false);

  const loadPendingReceipts = async () => {
    setLoading(true);
    setStatusText("");
    try {
      // Usar admin/reports con filtro de status específico para recibos pendientes
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001"}/billing/admin/reports?paymentStatus=ABONO_VERIFICADO&limitPayments=200`,
        {
          headers: {
            Authorization: `Bearer ${getStoredToken()}`,
          },
        }
      );
      
      if (!response.ok) throw new Error("No se pudo cargar los recibos pendientes");
      
      const data = await response.json();
      const payments = Array.isArray(data.payments) ? data.payments : [];
      
      // Filtrar solo los pagos con recibos pendientes de envío
      const pendingReceipts: PendingReceipt[] = payments
        .filter(
          (payment: any) =>
            payment.status === "ABONO_VERIFICADO" &&
            payment.receipt?.status === "RECIBO_PENDIENTE_VERIFICACION"
        )
        .map((payment: any) => ({
          receiptId: payment.receipt.id,
          receiptNumber: payment.receipt.receiptNumber,
          contractId: payment.invoice.contractId,
          contractNumber: payment.invoice.contractNumber,
          amount: payment.amount,
          issuedAt: payment.receipt.issuedAt,
          clientName: payment.client.fullName,
          clientEmail: payment.client.email,
          paymentId: payment.id,
          paymentDate: payment.reportedAt,
        }));
      
      setReceipts(pendingReceipts);
    } catch (fetchError) {
      setStatusText(fetchError instanceof Error ? fetchError.message : "No se pudo cargar los recibos pendientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    const token = getStoredToken();
    const role = String(getStoredSession()?.user?.role || "").toUpperCase();
    const authorized = ["ADMIN", "FACTURACION_COBROS"].includes(role);
    setIsAuthorized(authorized);
    
    if (!token || !authorized) {
      router.replace("/");
      return;
    }
    void loadPendingReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const openEmailModal = (receipt: PendingReceipt) => {
    setEmailModalReceipt(receipt);
    setEmailTo(receipt.clientEmail);
    setEmailCc("");
  };

  const onApproveAndSend = async () => {
    if (!emailModalReceipt) return;

    const targetEmail = emailTo.trim() || emailModalReceipt.clientEmail;
    
    setActionBusy(`send:${emailModalReceipt.receiptId}`);
    setStatusText("");
    try {
      await approveAndSendBillingReceipt(emailModalReceipt.receiptId, targetEmail, emailCc.trim() || undefined);
      setStatusText("✅ Recibo aprobado y enviado exitosamente");
      setEmailModalReceipt(null);
      await loadPendingReceipts();
    } catch (actionError) {
      setStatusText(actionError instanceof Error ? actionError.message : "No se pudo enviar el recibo.");
    } finally {
      setActionBusy("");
    }
  };

  if (!mounted || !isAuthorized) {
    return null;
  }

  return (
    <main className="app-shell">
      <section className="card contracts-card">
        <h1>🧾 Recibos Pendientes de Envío</h1>
        <p className="m-0 text-[#4b6790] text-sm">Revisa y envía los recibos de pagos ya verificados.</p>

        {statusText ? <p className="status-line">{statusText}</p> : null}

        {loading ? (
          <p className="m-0 text-[#4b6790] text-sm">Cargando recibos pendientes...</p>
        ) : receipts.length === 0 ? (
          <div className="empty-state" style={{ padding: "40px 20px", textAlign: "center" }}>
            <div className="empty-state-icon" style={{ fontSize: "48px", marginBottom: "12px" }}>✅</div>
            <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>¡Todo al día!</h3>
            <p className="m-0 text-[#4b6790] text-sm" style={{ margin: 0 }}>No hay recibos pendientes de envío.</p>
          </div>
        ) : (
          <div className="history-table-wrap" style={{ marginTop: "16px" }}>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Recibo</th>
                  <th>Contrato</th>
                  <th>Cliente</th>
                  <th>Monto</th>
                  <th>Fecha Pago</th>
                  <th>Fecha Emisión</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => (
                  <tr key={receipt.receiptId}>
                    <td>
                      <strong>{receipt.receiptNumber}</strong>
                    </td>
                    <td>{receipt.contractNumber}</td>
                    <td>
                      <div className="history-col-name">{receipt.clientName}</div>
                      <div className="history-col-muted">{receipt.clientEmail}</div>
                    </td>
                    <td>
                      <strong style={{ color: "#10b981" }}>{formatMoney(receipt.amount)}</strong>
                    </td>
                    <td>{formatDateTime(receipt.paymentDate)}</td>
                    <td>{formatDateTime(receipt.issuedAt)}</td>
                    <td>
                      <div className="history-actions">
                        <button
                          type="button"
                          className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                          onClick={() => openEmailModal(receipt)}
                          disabled={actionBusy === `send:${receipt.receiptId}`}
                          style={{ marginRight: "8px" }}
                        >
                          📧 Aprobar y Enviar
                        </button>
                        <button
                          type="button"
                          className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                          onClick={() => router.push(`/billing/${receipt.contractId}`)}
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

      {/* Modal de Email */}
      {emailModalReceipt ? (
        <section
          className="viewer-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setEmailModalReceipt(null);
            }
          }}
        >
          <div className="viewer-panel reject-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="viewer-head">
              <h2>Aprobar y Enviar Recibo</h2>
              <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none" onClick={() => setEmailModalReceipt(null)}>
                Cerrar
              </button>
            </div>

            <div className="viewer-body">
              <p className="m-0 text-[#4b6790] text-sm" style={{ marginBottom: "16px" }}>
                <strong>Recibo:</strong> {emailModalReceipt.receiptNumber}<br />
                <strong>Monto:</strong> {formatMoney(emailModalReceipt.amount)}<br />
                <strong>Cliente:</strong> {emailModalReceipt.clientName}
              </p>

              <label className="reject-modal-label">
                Enviar a (email)
                <input
                  type="email"
                  value={emailTo}
                  onChange={(event) => setEmailTo(event.target.value)}
                  placeholder="cliente@ejemplo.com"
                />
              </label>

              <label className="reject-modal-label" style={{ marginTop: "12px" }}>
                CC opcional
                <input
                  type="email"
                  value={emailCc}
                  onChange={(event) => setEmailCc(event.target.value)}
                  placeholder="copia@ejemplo.com"
                />
              </label>

              <div className="actions" style={{ marginTop: "16px" }}>
                <button
                  type="button"
                  className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                  onClick={() => void onApproveAndSend()}
                  disabled={actionBusy.startsWith("send:")}
                >
                  {actionBusy.startsWith("send:") ? "Enviando..." : "Aprobar y Enviar Recibo"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

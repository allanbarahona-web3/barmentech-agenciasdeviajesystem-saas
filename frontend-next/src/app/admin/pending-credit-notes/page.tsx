"use client";

import { getStoredSession, getStoredToken } from "@/lib/auth-api";
import {
  listBillingPendingCreditNotes,
  approveBillingCreditNote,
  rejectBillingCreditNote,
  type BillingPendingCreditNoteItem,
} from "@/lib/billing-api";
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

export default function PendingCreditNotesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [creditNotes, setCreditNotes] = useState<BillingPendingCreditNoteItem[]>([]);
  const [actionBusy, setActionBusy] = useState("");
  const [approveModalCreditNote, setApproveModalCreditNote] = useState<BillingPendingCreditNoteItem | null>(null);
  const [approveNotes, setApproveNotes] = useState("");
  const [rejectModalCreditNote, setRejectModalCreditNote] = useState<BillingPendingCreditNoteItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [statusText, setStatusText] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [mounted, setMounted] = useState(false);

  const load = async () => {
    setLoading(true);
    setStatusText("");
    try {
      const data = await listBillingPendingCreditNotes();
      setCreditNotes(data);
    } catch (fetchError) {
      setStatusText(fetchError instanceof Error ? fetchError.message : "No se pudo cargar las notas de crédito pendientes.");
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
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const openApproveModal = (creditNote: BillingPendingCreditNoteItem) => {
    setApproveModalCreditNote(creditNote);
    setApproveNotes("");
  };

  const openRejectModal = (creditNote: BillingPendingCreditNoteItem) => {
    setRejectModalCreditNote(creditNote);
    setRejectReason("");
  };

  const onApprove = async () => {
    if (!approveModalCreditNote) return;

    setActionBusy(`approve:${approveModalCreditNote.id}`);
    setStatusText("");
    try {
      await approveBillingCreditNote(approveModalCreditNote.id, approveNotes.trim() || undefined);
      setStatusText("✅ Nota de crédito aprobada y aplicada exitosamente");
      setApproveModalCreditNote(null);
      await load();
    } catch (actionError) {
      setStatusText(actionError instanceof Error ? actionError.message : "No se pudo aprobar la nota de crédito.");
    } finally {
      setActionBusy("");
    }
  };

  const onReject = async () => {
    if (!rejectModalCreditNote || !rejectReason.trim()) {
      setStatusText("❌ Debes proporcionar un motivo de rechazo.");
      return;
    }

    setActionBusy(`reject:${rejectModalCreditNote.id}`);
    setStatusText("");
    try {
      await rejectBillingCreditNote(rejectModalCreditNote.id, rejectReason);
      setStatusText("✅ Nota de crédito rechazada");
      setRejectModalCreditNote(null);
      await load();
    } catch (actionError) {
      setStatusText(actionError instanceof Error ? actionError.message : "No se pudo rechazar la nota de crédito.");
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
        <h1>📝 Notas de Crédito Pendientes de Aprobación</h1>
        <p className="m-0 text-[#4b6790] text-sm">Revisa y aprueba las notas de crédito solicitadas por los agentes.</p>

        {statusText ? <p className="status-line">{statusText}</p> : null}

        {loading ? (
          <p className="m-0 text-[#4b6790] text-sm">Cargando notas de crédito pendientes...</p>
        ) : creditNotes.length === 0 ? (
          <div className="empty-state" style={{ padding: "40px 20px", textAlign: "center" }}>
            <div className="empty-state-icon" style={{ fontSize: "48px", marginBottom: "12px" }}>✅</div>
            <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>¡Todo al día!</h3>
            <p className="m-0 text-[#4b6790] text-sm" style={{ margin: 0 }}>No hay notas de crédito pendientes de aprobación.</p>
          </div>
        ) : (
          <div className="history-table-wrap" style={{ marginTop: "16px" }}>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Contrato</th>
                  <th>Cliente</th>
                  <th>Monto</th>
                  <th>Motivo</th>
                  <th>Solicitado por</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {creditNotes.map((note) => (
                  <tr key={note.id}>
                    <td>
                      <strong>{note.creditNoteNumber}</strong>
                    </td>
                    <td>{note.contractNumber}</td>
                    <td>
                      <div className="history-col-name">{note.client.fullName}</div>
                      <div className="history-col-muted">{note.client.email}</div>
                      <div className="history-col-muted">{note.client.idNumber}</div>
                    </td>
                    <td>
                      <strong style={{ color: "#f59e0b" }}>{formatMoney(note.amount)}</strong>
                    </td>
                    <td>
                      <div style={{ maxWidth: "300px", whiteSpace: "normal" }}>{note.reason}</div>
                    </td>
                    <td>{note.requestedBy.name}</td>
                    <td>{formatDateTime(note.issuedAt)}</td>
                    <td>
                      <div className="history-actions">
                        <button
                          type="button"
                          className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                          onClick={() => openApproveModal(note)}
                          disabled={actionBusy === `approve:${note.id}`}
                          style={{ marginRight: "8px" }}
                        >
                          {actionBusy === `approve:${note.id}` ? "..." : "✓ Aprobar"}
                        </button>
                        <button
                          type="button"
                          className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                          onClick={() => openRejectModal(note)}
                          disabled={actionBusy === `reject:${note.id}`}
                          style={{ marginRight: "8px" }}
                        >
                          ✗ Rechazar
                        </button>
                        <button
                          type="button"
                          className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                          onClick={() => router.push(`/billing/${note.contractId}`)}
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

      {/* Modal de Aprobación */}
      {approveModalCreditNote ? (
        <section
          className="viewer-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setApproveModalCreditNote(null);
            }
          }}
        >
          <div className="viewer-panel reject-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="viewer-head">
              <h2>Aprobar Nota de Crédito</h2>
              <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none" onClick={() => setApproveModalCreditNote(null)}>
                Cerrar
              </button>
            </div>

            <div className="viewer-body">
              <p className="m-0 text-[#4b6790] text-sm" style={{ marginBottom: "16px" }}>
                <strong>Número:</strong> {approveModalCreditNote.creditNoteNumber}<br />
                <strong>Monto:</strong> {formatMoney(approveModalCreditNote.amount)}<br />
                <strong>Cliente:</strong> {approveModalCreditNote.client.fullName}<br />
                <strong>Motivo:</strong> {approveModalCreditNote.reason}
              </p>

              <label className="reject-modal-label">
                Notas de aprobación (opcional)
                <textarea
                  rows={4}
                  value={approveNotes}
                  onChange={(event) => setApproveNotes(event.target.value)}
                  placeholder="Agregar notas o comentarios sobre esta aprobación..."
                />
              </label>

              <div className="actions" style={{ marginTop: "16px" }}>
                <button
                  type="button"
                  className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                  onClick={() => void onApprove()}
                  disabled={actionBusy.startsWith("approve:")}
                >
                  {actionBusy.startsWith("approve:") ? "Procesando..." : "Confirmar Aprobación"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Modal de Rechazo */}
      {rejectModalCreditNote ? (
        <section
          className="viewer-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setRejectModalCreditNote(null);
            }
          }}
        >
          <div className="viewer-panel reject-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="viewer-head">
              <h2>Rechazar Nota de Crédito</h2>
              <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none" onClick={() => setRejectModalCreditNote(null)}>
                Cerrar
              </button>
            </div>

            <div className="viewer-body">
              <p className="m-0 text-[#4b6790] text-sm" style={{ marginBottom: "16px" }}>
                <strong>Número:</strong> {rejectModalCreditNote.creditNoteNumber}<br />
                <strong>Monto:</strong> {formatMoney(rejectModalCreditNote.amount)}<br />
                <strong>Cliente:</strong> {rejectModalCreditNote.client.fullName}
              </p>

              <label className="reject-modal-label">
                Motivo del rechazo *
                <textarea
                  rows={5}
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder="Describe por qué se rechaza esta nota de crédito"
                />
              </label>

              <div className="actions" style={{ marginTop: "16px" }}>
                <button
                  type="button"
                  className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                  onClick={() => void onReject()}
                  disabled={actionBusy.startsWith("reject:")}
                >
                  {actionBusy.startsWith("reject:") ? "Procesando..." : "Confirmar Rechazo"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

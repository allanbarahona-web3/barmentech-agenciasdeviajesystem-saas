"use client";

export const dynamic = 'force-dynamic';

import { getHomeRouteForRole, getStoredSession, getStoredToken } from "@/lib/auth-api";
import {
  getBillingAccountStatementPdfUrl,
  getBillingContractAccount,
  getBillingCreditNotePdfUrl,
  getBillingInvoicePdfUrl,
  getBillingReceiptPdfUrl,
  sendBillingCreditNoteEmail,
  sendBillingAccountStatementEmail,
  type BillingAccount,
} from "@/lib/billing-api";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, Suspense } from "react";
import { formatBusinessDate } from "@/shared/regional";

type DocumentEmailType = "CREDIT_NOTE";

const INVOICE_STATUS_LABELS: Record<string, string> = {
  FACTURA_EMITIDA: "Emitida",
  FACTURA_PARCIAL: "Parcial",
  FACTURA_PAGADA: "Pagada",
  FACTURA_VENCIDA: "Vencida",
  FACTURA_ANULADA: "Anulada",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  ABONO_REPORTADO: "En revision",
  ABONO_EN_REVISION: "En revision",
  ABONO_VERIFICADO: "Aprobado",
  ABONO_RECHAZADO: "Rechazado",
};

const CREDIT_NOTE_STATUS_LABELS: Record<string, string> = {
  NC_PENDIENTE_APROBACION: "En revision",
  NC_APLICADA: "Aprobada",
  NC_RECHAZADA: "Rechazada",
};

const labelStatus = (value?: string | null, labels?: Record<string, string>): string => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "-";
  return labels?.[raw] || raw;
};

const paymentTypeLabel = (value?: string | null): string => {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "RESERVATION") return "Reserva";
  if (raw === "INSTALLMENT") return "Abono";
  if (raw === "OTHER") return "Otro";
  return raw || "-";
};

const formatMoney = (value: number) => `USD ${Number.isFinite(value) ? value.toFixed(2) : "0.00"}`;

const formatDateTime = (value?: string | null): string => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-CR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusBadgeClassName = (value?: string | null): string => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "status-pending";
  if (raw.includes("RECHAZ") || raw.includes("ANULAD")) return "status-rejected";
  if (raw.includes("VERIFIC") || raw.includes("APLICAD") || raw.includes("PAGADA") || raw.includes("APROB")) {
    return "status-signed";
  }
  if (raw.includes("VENCIDA")) return "status-overdue";
  return "status-pending";
};

const getInvoiceStatusColor = (status?: string | null): string => {
  const raw = String(status || "").trim().toUpperCase();
  if (raw.includes("PAGADA")) return "#10b981"; // verde
  if (raw.includes("VENCIDA")) return "#ef4444"; // rojo
  if (raw.includes("PARCIAL")) return "#f97316"; // naranja
  if (raw.includes("ANULADA")) return "#6b7280"; // gris
  if (raw.includes("EMITIDA")) return "#3b82f6"; // azul
  return "#000000"; // negro por defecto
};

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getContractSourceBadge = (source?: string | null): { label: string; color: string; bgColor: string } | null => {
  const normalized = String(source || "").trim().toUpperCase();
  
  if (normalized === "MIGRATION") {
    return { label: "MG", color: "#047857", bgColor: "#d1fae5" }; // Verde oscuro/claro
  }
  if (normalized === "SCHEDULED_TRIP") {
    return { label: "VD", color: "#1d4ed8", bgColor: "#dbeafe" }; // Azul oscuro/claro
  }
  if (normalized === "CUSTOM_TRIP") {
    return { label: "PS", color: "#7c2d12", bgColor: "#fed7aa" }; // Marrón/naranja
  }
  if (normalized === "QUOTE") {
    return { label: "CT", color: "#581c87", bgColor: "#f3e8ff" }; // Púrpura oscuro/claro
  }
  
  return null;
};

function BillingContractAccountContent() {
  const router = useRouter();
  const params = useParams<{ contractId: string }>();
  const contractId = String(params?.contractId || "").trim();

  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState("");
  const [error, setError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [statementModalOpen, setStatementModalOpen] = useState(false);
  const [statementEmailTo, setStatementEmailTo] = useState("");
  const [statementEmailCc, setStatementEmailCc] = useState("");
  const [showStatementEmailForm, setShowStatementEmailForm] = useState(false);
  const [statementEmailSuccess, setStatementEmailSuccess] = useState("");
  const [statementEmailError, setStatementEmailError] = useState("");
  const [documentEmailModal, setDocumentEmailModal] = useState<{
    type: DocumentEmailType;
    id: string;
    number: string;
    mode: "SEND" | "RESEND";
  } | null>(null);
  const [documentEmailTo, setDocumentEmailTo] = useState("");
  const [documentEmailCc, setDocumentEmailCc] = useState("");
  const [documentEmailError, setDocumentEmailError] = useState("");
  const [documentEmailSuccess, setDocumentEmailSuccess] = useState("");

  const role = String(getStoredSession()?.user?.role || "").toUpperCase();
  const isAdmin = role === "ADMIN" || role === "FACTURACION_COBROS";
  const canOperate = role !== "CONTADOR";

  const load = async () => {
    if (!contractId) return;
    setLoading(true);
    setError("");
    try {
      const result = await getBillingContractAccount(contractId);
      setAccount(result);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar estado de cuenta.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/");
      return;
    }
    const role = String(getStoredSession()?.user?.role || "").toUpperCase();
    if (["CONTADOR", "FACTURACION_COBROS"].includes(role)) {
      router.replace(getHomeRouteForRole(role));
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, contractId]);

  // Auto-refresh cada 30 segundos para agentes
  useEffect(() => {
    // Solo auto-refresh si no es admin (para agentes que esperan aprobación)
    if (isAdmin) return;

    const intervalId = setInterval(() => {
      // Solo refrescar si:
      // 1. La página está visible
      // 2. No hay modales abiertos
      // 3. No está cargando actualmente
      const isPageVisible = document.visibilityState === "visible";
      const hasOpenModals = Boolean(documentEmailModal) || statementModalOpen;
      
      if (isPageVisible && !hasOpenModals && !loading) {
        void load();
      }
    }, 30000); // 30 segundos

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, documentEmailModal, statementModalOpen, loading]);

  // Helper: Detecta si un pago fue aprobado recientemente (últimos 5 minutos)
  const isRecentlyApproved = (verifiedAt?: string | null, status?: string | null): boolean => {
    if (status !== "ABONO_VERIFICADO" || !verifiedAt) return false;
    const verified = new Date(verifiedAt);
    const now = new Date();
    const diffMinutes = (now.getTime() - verified.getTime()) / (1000 * 60);
    return diffMinutes <= 5;
  };

  const timelineRows = useMemo(() => {
    if (!account) return [] as Array<{
      id: string;
      at: string;
      movement: string;
      amount: number;
      actor: string;
      status: string;
      balanceBefore: number;
      balanceAfter: number;
      verifiedAt?: string | null;
    }>;

    const rows = [] as Array<{
      id: string;
      at: string;
      movement: string;
      amount: number;
      actor: string;
      status: string;
      effectAmount: number;
      verifiedAt?: string | null;
    }>;

    rows.push({
      id: `invoice-${account.invoice.id}`,
      at: account.invoice.issuedAt,
      movement: `Estado de cuenta ${account.invoice.invoiceNumber}`,
      amount: account.invoice.amounts.total,
      actor: "Sistema",
      status: account.invoice.status,
      effectAmount: 0,
      verifiedAt: null,
    });

    account.payments.forEach((payment) => {
      const verifiedEffect = payment.status === "ABONO_VERIFICADO" ? payment.amount : 0;
      const label = payment.type === "RESERVATION" ? "Pago de reserva" : payment.type === "INSTALLMENT" ? "Abono" : "Pago";

      rows.push({
        id: `payment-${payment.id}`,
        at: payment.reportedAt,
        movement: label,
        amount: payment.amount,
        actor: payment.createdByName || payment.verifiedByName || "-",
        status: payment.status,
        effectAmount: verifiedEffect,
        verifiedAt: payment.verifiedAt,
      });
    });

    account.creditNotes.forEach((note) => {
      const appliedEffect = note.status === "NC_APLICADA" ? note.amount : 0;
      rows.push({
        id: `credit-note-${note.id}`,
        at: note.appliedAt || note.issuedAt,
        movement: `Nota de credito ${note.creditNoteNumber}`,
        amount: note.amount,
        actor: note.appliedByName || note.issuedByName || "-",
        status: note.status,
        effectAmount: appliedEffect,
        verifiedAt: null,
      });
    });

    rows.sort((a, b) => {
      const aTime = new Date(a.at).getTime();
      const bTime = new Date(b.at).getTime();
      return aTime - bTime;
    });

    let runningBalance = account.invoice.amounts.grossInvoiced || account.invoice.amounts.total;

    return rows.map((row) => {
      const before = runningBalance;
      runningBalance = Math.max(0, runningBalance - row.effectAmount);
      return {
        id: row.id,
        at: row.at,
        movement: row.movement,
        amount: row.amount,
        actor: row.actor,
        status: row.status,
        balanceBefore: before,
        balanceAfter: runningBalance,
        verifiedAt: row.verifiedAt,
      };
    }).reverse();
  }, [account]);

  const openDocumentEmailModal = (input: {
    type: DocumentEmailType;
    id: string;
    number: string;
    mode: "SEND" | "RESEND";
  }) => {
    setDocumentEmailModal(input);
    setDocumentEmailTo(String(account?.client?.email || "").trim());
    setDocumentEmailCc("");
    setDocumentEmailError("");
    setDocumentEmailSuccess("");
  };

  const closeDocumentEmailModal = () => {
    if (actionBusy === "document:email") return;
    setDocumentEmailModal(null);
    setDocumentEmailError("");
    setDocumentEmailSuccess("");
  };

  const onSendDocumentEmail = async () => {
    if (!canOperate) return;
    if (!documentEmailModal) return;
    const toEmail = String(documentEmailTo || "").trim();
    if (!toEmail) {
      setDocumentEmailError("Debes indicar el correo del titular.");
      setDocumentEmailSuccess("");
      return;
    }

    setActionBusy("document:email");
    setDocumentEmailError("");
    setDocumentEmailSuccess("");
    try {
      const result = await sendBillingCreditNoteEmail(documentEmailModal.id, toEmail, documentEmailCc);
      const ccText = result.ccEmail ? ` (CC: ${result.ccEmail})` : "";
      setDocumentEmailSuccess(`Nota de credito ${result.creditNoteNumber} enviada a ${result.sentToEmail}${ccText}.`);
      setStatusText(`Nota de credito ${result.creditNoteNumber} enviada a ${result.sentToEmail}${ccText}.`);

      await load();
      window.setTimeout(() => {
        setDocumentEmailModal(null);
        setDocumentEmailError("");
        setDocumentEmailSuccess("");
      }, 1200);
    } catch (actionError) {
      setDocumentEmailError(actionError instanceof Error ? actionError.message : "No se pudo enviar el correo.");
    } finally {
      setActionBusy("");
    }
  };

  const onOpenInvoicePdf = async () => {
    if (!contractId) return;
    setActionBusy("invoice:pdf");
    try {
      const result = await getBillingInvoicePdfUrl(contractId);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (actionError) {
      setStatusText(actionError instanceof Error ? actionError.message : "No se pudo abrir el documento del contrato.");
    } finally {
      setActionBusy("");
    }
  };

  const onOpenReceiptPdf = async (receiptId: string) => {
    setActionBusy(`receipt-pdf:${receiptId}`);
    try {
      const result = await getBillingReceiptPdfUrl(receiptId);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (actionError) {
      setStatusText(actionError instanceof Error ? actionError.message : "No se pudo abrir el recibo PDF.");
    } finally {
      setActionBusy("");
    }
  };

  const onOpenCreditNotePdf = async (creditNoteId: string) => {
    setActionBusy(`credit-note:pdf:${creditNoteId}`);
    try {
      const result = await getBillingCreditNotePdfUrl(creditNoteId);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (actionError) {
      setStatusText(actionError instanceof Error ? actionError.message : "No se pudo abrir la nota de credito PDF.");
    } finally {
      setActionBusy("");
    }
  };

  const onShareCreditNoteWhatsApp = async (creditNoteId: string) => {
    setActionBusy(`credit-note:wa:${creditNoteId}`);
    try {
      const result = await getBillingCreditNotePdfUrl(creditNoteId);
      const text = [
        `Nota de credito - Contrato ${account?.invoice.contractNumber || "-"}`,
        `Cliente: ${account?.client.fullName || "-"}`,
        `Documento: ${result.url}`,
      ].join("\n");
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      setStatusText("Nota de credito preparada para compartir por WhatsApp.");
    } catch (actionError) {
      setStatusText(actionError instanceof Error ? actionError.message : "No se pudo compartir la nota de credito.");
    } finally {
      setActionBusy("");
    }
  };

  const openStatement = () => {
    setStatementEmailTo(String(account?.client?.email || "").trim());
    setStatementEmailCc("");
    setShowStatementEmailForm(false);
    setStatementEmailSuccess("");
    setStatementEmailError("");
    setStatementModalOpen(true);
  };

  const closeStatementModal = () => {
    if (actionBusy === "statement:pdf" || actionBusy === "statement:wa") {
      return;
    }
    setStatementModalOpen(false);
  };

  const onSendStatementEmail = async () => {
    if (!canOperate) return;
    if (!contractId || !account) return;
    const toEmail = String(statementEmailTo || "").trim();
    if (!toEmail) {
      setStatementEmailError("Debes indicar el correo del titular.");
      setStatementEmailSuccess("");
      return;
    }

    setActionBusy("statement:email");
    setStatementEmailError("");
    setStatementEmailSuccess("");
    try {
      const result = await sendBillingAccountStatementEmail(contractId, toEmail, statementEmailCc);
      const ccText = result.ccEmail ? ` (CC: ${result.ccEmail})` : "";
      setStatementEmailSuccess(`Correo enviado exitosamente a ${result.sentToEmail}${ccText}.`);
      setStatusText(`Estado de cuenta enviado a ${result.sentToEmail}${ccText}.`);
      setShowStatementEmailForm(false);
      window.setTimeout(() => {
        setStatementModalOpen(false);
        setStatementEmailError("");
        setStatementEmailSuccess("");
      }, 1200);
    } catch (err) {
      setStatementEmailError(err instanceof Error ? err.message : "No se pudo enviar el estado de cuenta por correo.");
    } finally {
      setActionBusy("");
    }
  };

  const buildStatementPrintHtml = (): string => {
    if (!account) return "";

    const rows = timelineRows
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(formatDateTime(row.at))}</td>
            <td>${escapeHtml(row.movement)}</td>
            <td>${escapeHtml(formatMoney(row.amount))}</td>
            <td>${escapeHtml(formatMoney(row.balanceBefore))}</td>
            <td>${escapeHtml(formatMoney(row.balanceAfter))}</td>
            <td>${escapeHtml(row.actor || "-")}</td>
            <td>${escapeHtml(labelStatus(row.status, { ...INVOICE_STATUS_LABELS, ...PAYMENT_STATUS_LABELS, ...CREDIT_NOTE_STATUS_LABELS }))}</td>
          </tr>`,
      )
      .join("");

    return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>Estado de cuenta ${escapeHtml(account.invoice.contractNumber)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #10223e; }
      h1 { margin: 0 0 10px; font-size: 22px; }
      p { margin: 4px 0; }
      .meta { margin-bottom: 14px; }
      .kpi { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px; }
      .kpi div { border: 1px solid #d8e1ec; border-radius: 8px; padding: 8px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #d8e1ec; padding: 7px; text-align: left; vertical-align: top; }
      th { background: #f7fafc; }
      @media print { body { margin: 10mm; } }
    </style>
  </head>
  <body>
    <h1>Estado de cuenta</h1>
    <div class="meta">
      <p><strong>Cliente:</strong> ${escapeHtml(account.client.fullName)}</p>
      <p><strong>Contrato:</strong> ${escapeHtml(account.invoice.contractNumber)}</p>
      <p><strong>Estado:</strong> ${escapeHtml(labelStatus(account.invoice.status, INVOICE_STATUS_LABELS))}</p>
      <p><strong>Actualizado:</strong> ${escapeHtml(formatDateTime(account.invoice.issuedAt))}</p>
    </div>
    <div class="kpi">
      <div><strong>Total contratado</strong><br/>${escapeHtml(formatMoney(account.invoice.amounts.total))}</div>
      <div><strong>Total verificado</strong><br/>${escapeHtml(formatMoney(account.invoice.amounts.verified))}</div>
      <div><strong>Total en revision bancaria</strong><br/>${escapeHtml(formatMoney(account.invoice.amounts.pending))}</div>
      <div><strong>Saldo por cobrar</strong><br/>${escapeHtml(formatMoney(account.invoice.amounts.balance))}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Fecha/Hora</th>
          <th>Movimiento</th>
          <th>Monto</th>
          <th>Saldo anterior</th>
          <th>Saldo actual</th>
          <th>Usuario</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`;
  };

  const onDownloadStatementPdf = () => {
    if (!account) return;
    setActionBusy("statement:pdf");
    void (async () => {
      try {
        const result = await getBillingAccountStatementPdfUrl(contractId);
        window.open(result.url, "_blank", "noopener,noreferrer");
        setStatusText("Estado de cuenta generado en PDF.");
      } catch (err) {
        setStatusText(err instanceof Error ? err.message : "No se pudo generar el PDF del estado de cuenta.");
      } finally {
        setActionBusy("");
      }
    })();
  };

  const onShareStatementWhatsApp = async () => {
    if (!account) return;
    setActionBusy("statement:wa");
    try {
      let invoiceUrl = "";
      try {
        const invoice = await getBillingInvoicePdfUrl(contractId);
        invoiceUrl = String(invoice.url || "").trim();
      } catch {
        invoiceUrl = "";
      }

      const text = [
        `Estado de cuenta - Contrato ${account.invoice.contractNumber}`,
        `Cliente: ${account.client.fullName}`,
        `Saldo actual: ${formatMoney(account.invoice.amounts.balance)}`,
        invoiceUrl ? `Documento PDF: ${invoiceUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(waUrl, "_blank", "noopener,noreferrer");
      setStatusText("Estado de cuenta preparado para compartir por WhatsApp.");
    } catch (err) {
      setStatusText(err instanceof Error ? err.message : "No se pudo compartir por WhatsApp.");
    } finally {
      setActionBusy("");
    }
  };

  return (
    <main className="app-shell">
      <section className="card contracts-card billing-dashboard">
        <div className="flex items-center gap-4 mb-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl px-4 py-2.5 bg-emerald-600 text-white border border-emerald-700 font-semibold transition-all duration-150 hover:bg-emerald-700 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 flex items-center gap-2"
            title="Regresar a estados de cuenta"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Regresar
          </button>
          <h1 style={{ margin: 0 }}>Estado de cuenta del contrato</h1>
        </div>

        {loading ? <p className="m-0 text-[#4b6790] text-sm">Cargando...</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        
        {statusText ? (
          <div 
            className="status-line" 
            style={{
              backgroundColor: statusText.includes('✅') ? '#d1fae5' : '#fef3c7',
              border: statusText.includes('✅') ? '2px solid #10b981' : '2px solid #f59e0b',
              color: statusText.includes('✅') ? '#065f46' : statusText.includes('❌') ? '#dc2626' : '#78350f',
              padding: '16px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '15px',
              marginBottom: '20px',
              textAlign: 'center'
            }}
          >
            {statusText}
          </div>
        ) : null}

        {account ? (
          <>
            <section className="billing-hero">
              <div className="billing-hero-grid">
                <article className="billing-kpi">
                  <span>Nombre</span>
                  <strong>{account.client.fullName}</strong>
                </article>
                <article className="billing-kpi">
                  <span>Correo</span>
                  <strong>{account.client.email || "-"}</strong>
                </article>
                <article className="billing-kpi">
                  <span>Cedula</span>
                  <strong>{account.client.idNumber}</strong>
                </article>
                <article className="billing-kpi">
                  <span>Contrato</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong>{account.invoice.contractNumber}</strong>
                    {(() => {
                      const badge = getContractSourceBadge(account.invoice.source);
                      if (!badge) return null;
                      return (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            backgroundColor: badge.bgColor,
                            color: badge.color,
                            border: `1px solid ${badge.color}`,
                            letterSpacing: '0.5px',
                          }}
                          title={badge.label === 'VD' ? 'Viaje Disponible' : badge.label === 'MG' ? 'Migrado' : badge.label === 'PS' ? 'Personalizado' : 'Cotización'}
                        >
                          {badge.label}
                        </span>
                      );
                    })()}
                  </div>
                </article>
                <article className="billing-kpi">
                  <span>Monto del contrato</span>
                  <strong style={{ color: '#10b981' }}>{formatMoney(account.invoice.amounts.total)}</strong>
                </article>
                <article className="billing-kpi">
                  <span>Estado de cuenta</span>
                  <strong style={{ color: getInvoiceStatusColor(account.invoice.status) }}>
                    {labelStatus(account.invoice.status, INVOICE_STATUS_LABELS)}
                  </strong>
                </article>
                <article className="billing-kpi">
                  <span>Saldo actual</span>
                  <strong style={{ color: '#ef4444' }}>{formatMoney(account.invoice.amounts.balance)}</strong>
                </article>
                {account.invoice.paymentReference ? (
                  <article className="billing-kpi" style={{ background: '#fef3c7', border: '2px solid #f59e0b', borderRadius: '8px', padding: '12px' }}>
                    <span style={{ color: '#78350f', fontWeight: 600, textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' }}>
                      ⚠️ Código de Pago
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      <strong style={{ fontFamily: 'Monaco, Consolas, monospace', fontSize: '18px', color: '#92400e', letterSpacing: '2px' }}>
                        {account.invoice.paymentReference}
                      </strong>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(account.invoice.paymentReference || '');
                          setStatusText(`Código ${account.invoice.paymentReference} copiado al portapapeles.`);
                        }}
                        className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                        title="Copiar código de pago"
                      >
                        📋
                      </button>
                    </div>
                  </article>
                ) : null}
                {account.invoice.travel && account.invoice.travel.name ? (
                  <article className="billing-kpi" style={{ background: '#e0f2fe', border: '2px solid #0284c7', borderRadius: '8px', padding: '12px' }}>
                    <span style={{ color: '#0c4a6e', fontWeight: 600, textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' }}>
                      ✈️ Viaje
                    </span>
                    <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <strong style={{ fontSize: '15px', color: '#0c4a6e', lineHeight: '1.3' }}>
                        {account.invoice.travel.name}
                      </strong>
                      {account.invoice.travel.departureDate && account.invoice.travel.returnDate ? (
                        <span style={{ fontSize: '13px', color: '#075985', fontWeight: 500 }}>
                          {formatBusinessDate(account.invoice.travel.departureDate)} → {formatBusinessDate(account.invoice.travel.returnDate)}
                        </span>
                      ) : null}
                    </div>
                  </article>
                ) : null}
              </div>
            </section>

            {account.invoice.isOverdue ? (
              <p className="form-error" style={{ marginTop: 10 }}>
                Alerta: cuenta vencida hace {account.invoice.overdueDays || 0} dia(s).
              </p>
            ) : null}

            <section className="billing-actions-row">
              <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0" onClick={openStatement}>
                Estado de cuenta
              </button>
              <button
                type="button"
                className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                onClick={() => void onOpenInvoicePdf()}
                disabled={actionBusy === "invoice:pdf"}
              >
                {actionBusy === "invoice:pdf" ? "Abriendo..." : "Abrir documento del contrato"}
              </button>
            </section>

            <section className="billing-summary-grid">
              <article className="billing-summary-card">
                <h3>Totales</h3>
                <p>Total del contrato: <strong>{formatMoney(account.invoice.amounts.total)}</strong></p>
                <p>Total verificado: <strong>{formatMoney(account.invoice.amounts.verified)}</strong></p>
                <p>Total en revision: <strong>{formatMoney(account.invoice.amounts.pending)}</strong></p>
                <p>Saldo por cobrar: <strong>{formatMoney(account.invoice.amounts.balance)}</strong></p>
              </article>
              <article className="billing-summary-card">
                <h3>Control de reserva</h3>
                <p>Comprobante precargado: <strong>{(account.reservationProofCandidates || []).length} archivo(s)</strong></p>
                <p>Regla: <strong>solo una reserva por contrato</strong></p>
                <p>Aprobacion bancaria: <strong>manual (admin)</strong></p>
              </article>
              <article className="billing-summary-card">
                <h3>Consulta histórica</h3>
                <p>Este espacio conserva pagos, recibos, comprobantes y movimientos históricos del contrato.</p>
              </article>
            </section>

            <section id="account-timeline" className="history-table-wrap" style={{ marginTop: 14 }}>
              <h2>Estado de cuenta (timeline)</h2>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Fecha/Hora</th>
                    <th>Movimiento</th>
                    <th>Monto</th>
                    <th>Saldo anterior</th>
                    <th>Saldo actual</th>
                    <th>Usuario</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {timelineRows.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <p className="history-empty">Sin movimientos.</p>
                      </td>
                    </tr>
                  ) : null}

                  {timelineRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.at)}</td>
                      <td>{row.movement}</td>
                      <td>{formatMoney(row.amount)}</td>
                      <td>{formatMoney(row.balanceBefore)}</td>
                      <td>{formatMoney(row.balanceAfter)}</td>
                      <td>{row.actor || "-"}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span className={`contract-status ${statusBadgeClassName(row.status)}`}>
                            {labelStatus(row.status, { ...INVOICE_STATUS_LABELS, ...PAYMENT_STATUS_LABELS, ...CREDIT_NOTE_STATUS_LABELS })}
                          </span>
                          {isRecentlyApproved(row.verifiedAt, row.status) && (
                            <span className="new-badge">✨ NUEVO</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="history-table-wrap" style={{ marginTop: 14 }}>
              <h2>Pagos y aprobaciones</h2>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Fecha comprobante</th>
                    <th>Tipo</th>
                    <th>Monto</th>
                    <th>Estado pago</th>
                    <th>Recibo</th>
                    <th>Comprobantes</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {account.payments.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <p className="history-empty">No hay abonos registrados.</p>
                      </td>
                    </tr>
                  ) : null}

                  {account.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{formatDateTime(payment.reportedAt)}</td>
                      <td>{formatBusinessDate(payment.voucherDate || "")}</td>
                      <td>{paymentTypeLabel(payment.type)}</td>
                      <td>{formatMoney(payment.amount)}</td>
                      <td>
                        <span className={`contract-status ${payment.status === "ABONO_VERIFICADO" ? "status-signed" : "status-pending"}`}>
                          {labelStatus(payment.status, PAYMENT_STATUS_LABELS)}
                        </span>
                      </td>
                      <td>
                        {payment.receipt?.receiptNumber || "-"} ({labelStatus(payment.receipt?.status, { RECIBO_PENDIENTE_VERIFICACION: "Pendiente", RECIBO_APROBADO_ENVIADO: "Aprobado y enviado", RECIBO_ANULADO: "Anulado" })})
                        {payment.receipt?.status === "RECIBO_APROBADO_ENVIADO" ? (
                          <div className="history-col-muted">
                            Correo enviado: {payment.receipt.sentToEmail || account.client.email || "-"}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {payment.attachments.length > 0 ? (
                          <div className="history-actions">
                            {payment.attachments.map((file) => (
                              <a key={file.id} href={file.url} target="_blank" rel="noopener noreferrer" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none">
                                Ver {file.originalFileName}
                              </a>
                            ))}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <div className="history-actions">
                          {payment.receipt ? (
                            <button
                              type="button"
                              className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                              onClick={() => void onOpenReceiptPdf(payment.receipt!.id)}
                              disabled={actionBusy === `receipt-pdf:${payment.receipt.id}`}
                            >
                              {actionBusy === `receipt-pdf:${payment.receipt.id}` ? "..." : "PDF recibo"}
                            </button>
                          ) : null}

                          {!payment.receipt ? <span className="history-col-muted">Sin recibo histórico.</span> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="history-table-wrap" style={{ marginTop: 14 }}>
              <h2>Notas de credito</h2>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Numero</th>
                    <th>Fecha</th>
                    <th>Monto</th>
                    <th>Estado</th>
                    <th>Motivo</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {account.creditNotes.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <p className="history-empty">Sin notas de credito.</p>
                      </td>
                    </tr>
                  ) : null}

                  {account.creditNotes.map((note) => (
                    <tr key={note.id}>
                      <td>{note.creditNoteNumber}</td>
                      <td>{formatDateTime(note.issuedAt)}</td>
                      <td>{formatMoney(note.amount)}</td>
                      <td>
                        <span className={`contract-status ${note.status === "NC_APLICADA" ? "status-signed" : "status-pending"}`}>
                          {labelStatus(note.status, CREDIT_NOTE_STATUS_LABELS)}
                        </span>
                      </td>
                      <td>{note.reason}</td>
                      <td>
                        <div className="history-actions">
                          {note.status === "NC_APLICADA" ? (
                            <>
                              <button
                                type="button"
                                className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                                onClick={() => void onOpenCreditNotePdf(note.id)}
                                disabled={actionBusy === `credit-note:pdf:${note.id}`}
                              >
                                {actionBusy === `credit-note:pdf:${note.id}` ? "..." : "PDF"}
                              </button>
                              <button
                                type="button"
                                className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                                onClick={() => void onShareCreditNoteWhatsApp(note.id)}
                                disabled={actionBusy === `credit-note:wa:${note.id}`}
                              >
                                {actionBusy === `credit-note:wa:${note.id}` ? "..." : "Compartir WhatsApp"}
                              </button>
                              {isAdmin ? (
                                <button
                                  type="button"
                                  className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                                  onClick={() =>
                                    openDocumentEmailModal({
                                      type: "CREDIT_NOTE",
                                      id: note.id,
                                      number: note.creditNoteNumber,
                                      mode: "SEND",
                                    })
                                  }
                                  disabled={actionBusy === "document:email"}
                                >
                                  Enviar por correo
                                </button>
                              ) : canOperate ? (
                                <button
                                  type="button"
                                  className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                                  onClick={() =>
                                    openDocumentEmailModal({
                                      type: "CREDIT_NOTE",
                                      id: note.id,
                                      number: note.creditNoteNumber,
                                      mode: "RESEND",
                                    })
                                  }
                                  disabled={actionBusy === "document:email"}
                                >
                                  Reenviar por correo
                                </button>
                              ) : null}
                            </>
                          ) : (
                            <span className="history-col-muted">En espera de aprobacion admin</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        ) : null}
      </section>

      {statementModalOpen ? (
        <section
          className="viewer-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeStatementModal();
            }
          }}
        >
          <div className="viewer-panel billing-statement-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="viewer-head">
              <h2>Estado de cuenta</h2>
              <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none" onClick={closeStatementModal}>Cerrar</button>
            </div>

            {account ? (
              <div className="viewer-body">
                <div className="billing-statement-top">
                  <article className="billing-summary-card">
                    <h3>Resumen</h3>
                    <p>Cliente: <strong>{account.client.fullName}</strong></p>
                    <p>Contrato: <strong>{account.invoice.contractNumber}</strong></p>
                    <p>Estado: <strong>{labelStatus(account.invoice.status, INVOICE_STATUS_LABELS)}</strong></p>
                  </article>
                  <article className="billing-summary-card">
                    <h3>Montos</h3>
                    <p>Total contratado: <strong>{formatMoney(account.invoice.amounts.total)}</strong></p>
                    <p>Total verificado: <strong>{formatMoney(account.invoice.amounts.verified)}</strong></p>
                    <p>Total en revision bancaria: <strong>{formatMoney(account.invoice.amounts.pending)}</strong></p>
                    <p>Saldo por cobrar: <strong>{formatMoney(account.invoice.amounts.balance)}</strong></p>
                  </article>
                </div>

                <div className="actions" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                    onClick={onDownloadStatementPdf}
                    disabled={actionBusy === "statement:pdf"}
                  >
                    {actionBusy === "statement:pdf" ? "Generando..." : "Generar PDF"}
                  </button>
                  {canOperate ? <button
                    type="button"
                    className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                    onClick={() => void onShareStatementWhatsApp()}
                    disabled={actionBusy === "statement:wa"}
                  >
                    {actionBusy === "statement:wa" ? "Preparando..." : "Compartir por WhatsApp"}
                  </button> : null}
                  {canOperate ? <button
                    type="button"
                    className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                    onClick={() => setShowStatementEmailForm((prev) => !prev)}
                    disabled={actionBusy === "statement:email"}
                  >
                    {showStatementEmailForm ? "Ocultar correo" : "Enviar por correo"}
                  </button> : null}
                </div>

                {statementEmailSuccess ? <p className="form-success">{statementEmailSuccess}</p> : null}
                {statementEmailError ? <p className="form-error">{statementEmailError}</p> : null}

                {canOperate && showStatementEmailForm ? (
                  <div className="billing-summary-card" style={{ marginTop: 10 }}>
                    <h3>Enviar estado de cuenta</h3>
                    <label className="reject-modal-label">
                      Correo titular
                      <input
                        type="email"
                        value={statementEmailTo}
                        onChange={(event) => setStatementEmailTo(event.target.value)}
                        placeholder="titular@correo.com"
                      />
                    </label>
                    <label className="reject-modal-label">
                      CC opcional
                      <input
                        type="email"
                        value={statementEmailCc}
                        onChange={(event) => setStatementEmailCc(event.target.value)}
                        placeholder="otro@correo.com"
                      />
                    </label>
                    <div className="actions">
                      <button
                        type="button"
                        className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                        onClick={() => void onSendStatementEmail()}
                        disabled={actionBusy === "statement:email"}
                      >
                        {actionBusy === "statement:email" ? "Enviando..." : "Enviar estado de cuenta"}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="history-table-wrap" style={{ marginTop: 12 }}>
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Fecha/Hora</th>
                        <th>Movimiento</th>
                        <th>Monto</th>
                        <th>Saldo anterior</th>
                        <th>Saldo actual</th>
                        <th>Usuario</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timelineRows.length === 0 ? (
                        <tr>
                          <td colSpan={7}>
                            <p className="history-empty">Sin movimientos.</p>
                          </td>
                        </tr>
                      ) : null}

                      {timelineRows.map((row) => (
                        <tr key={`statement-${row.id}`}>
                          <td>{formatDateTime(row.at)}</td>
                          <td>{row.movement.replace(/^Factura\s+/i, "Contrato ")}</td>
                          <td>{formatMoney(row.amount)}</td>
                          <td>{formatMoney(row.balanceBefore)}</td>
                          <td>{formatMoney(row.balanceAfter)}</td>
                          <td>{row.actor || "-"}</td>
                          <td>{labelStatus(row.status, { ...INVOICE_STATUS_LABELS, ...PAYMENT_STATUS_LABELS, ...CREDIT_NOTE_STATUS_LABELS })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {canOperate && documentEmailModal ? (
        <section
          className="viewer-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeDocumentEmailModal();
            }
          }}
        >
          <div className="viewer-panel reject-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="viewer-head">
              <h2>
                {documentEmailModal.mode === "RESEND" ? "Reenviar por correo" : "Enviar por correo"}
              </h2>
              <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none" onClick={closeDocumentEmailModal}>Cerrar</button>
            </div>

            <div className="viewer-body">
              <p className="m-0 text-[#4b6790] text-sm">
                Documento: <strong>Nota de credito</strong> · Numero: <strong>{documentEmailModal.number}</strong>
              </p>

              {documentEmailSuccess ? <p className="form-success">{documentEmailSuccess}</p> : null}
              {documentEmailError ? <p className="form-error">{documentEmailError}</p> : null}

              <label className="reject-modal-label">
                Correo titular
                <input
                  type="email"
                  value={documentEmailTo}
                  onChange={(event) => setDocumentEmailTo(event.target.value)}
                  placeholder="titular@correo.com"
                />
              </label>

              <label className="reject-modal-label">
                CC opcional
                <input
                  type="email"
                  value={documentEmailCc}
                  onChange={(event) => setDocumentEmailCc(event.target.value)}
                  placeholder="otro@correo.com"
                />
              </label>

              <div className="actions">
                <button
                  type="button"
                  className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                  onClick={() => void onSendDocumentEmail()}
                  disabled={actionBusy === "document:email"}
                >
                  {actionBusy === "document:email" ? "Enviando..." : documentEmailModal.mode === "RESEND" ? "Reenviar" : "Enviar"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

    </main>
  );
}

export default function BillingContractAccountPage() {
  return (
    <Suspense fallback={
      <main className="app-shell">
        <section className="card">
          <p>Cargando estado de cuenta...</p>
        </section>
      </main>
    }>
      <BillingContractAccountContent />
    </Suspense>
  );
}

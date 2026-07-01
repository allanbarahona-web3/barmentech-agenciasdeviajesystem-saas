"use client";

export const dynamic = 'force-dynamic';

import { getStoredSession, getStoredToken, getTenantConfig } from "@/lib/auth-api";
import {
  approveAndSendBillingReceipt,
  bootstrapBillingContract,
  createBillingCreditNote,
  getBillingAccountStatementPdfUrl,
  getBillingContractAccount,
  getBillingCreditNotePdfUrl,
  getBillingInvoicePdfUrl,
  getBillingReceiptPdfUrl,
  rejectBillingPayment,
  reportBillingPayment,
  sendBillingCreditNoteEmail,
  sendBillingAccountStatementEmail,
  verifyBillingPayment,
  type BillingAccount,
} from "@/lib/billing-api";
import { ReceiptProcessor } from "@/components/receipt-processor";
import { LoadingModal } from "@/components/loading-modal";
import type { ExtractedPaymentData } from "@/lib/payment-verification-api";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, Suspense } from "react";

type BillingModalMode = "RESERVATION" | "INSTALLMENT" | "CREDIT_NOTE" | "NONE";
type DocumentEmailType = "RECEIPT" | "CREDIT_NOTE";

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

const PAYMENT_METHOD_OPTIONS = [
  "TRANSFERENCIA_BANCARIA",
  "EFECTIVO",
  "SINPE_MOVIL",
  "TARJETA",
] as const;

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

const formatDate = (value?: string | null): string => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-CR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const formatVoucherDate = (value?: string | null): string => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
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
  const searchParams = useSearchParams();
  const params = useParams<{ contractId: string }>();
  const contractId = String(params?.contractId || "").trim();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [error, setError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [criticalAlert, setCriticalAlert] = useState<{ title: string; message: string; details?: string } | null>(null);
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [tenantDisplayName, setTenantDisplayName] = useState("la empresa");

  const [modalMode, setModalMode] = useState<BillingModalMode>("NONE");

  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [payerName, setPayerName] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [originBank, setOriginBank] = useState("");
  const [destinationBank, setDestinationBank] = useState("");
  const [destinationAccount, setDestinationAccount] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_METHOD_OPTIONS[0]);
  const [attachments, setAttachments] = useState<File[]>([]);

  const [creditNoteReason, setCreditNoteReason] = useState("");
  const [creditNoteAmount, setCreditNoteAmount] = useState("");

  const [rejectModalPaymentId, setRejectModalPaymentId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
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

  // Estados para LoadingModal
  const [loadingModalOpen, setLoadingModalOpen] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<"loading" | "success" | "error">("loading");
  const [loadingModalMessage, setLoadingModalMessage] = useState("");
  const [loadingModalSuccessMsg, setLoadingModalSuccessMsg] = useState("");

  const role = String(getStoredSession()?.user?.role || "").toUpperCase();
  const isAdmin = role === "ADMIN" || role === "FACTURACION_COBROS";

  const load = async () => {
    if (!contractId) return;
    setLoading(true);
    setError("");
    try {
      await bootstrapBillingContract(contractId);
      const result = await getBillingContractAccount(contractId);
      setAccount(result);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar estado de cuenta.");
    } finally {
      setLoading(false);
    }
  };

  const loadTenantDisplayName = async () => {
    try {
      const config = await getTenantConfig();
      const tenantName = String(config?.name || "").trim();
      if (tenantName) {
        setTenantDisplayName(tenantName);
      }
    } catch {
      // Keep fallback label when tenant config is unavailable.
    }
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/");
      return;
    }
    void loadTenantDisplayName();
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, contractId]);

  // Auto-abrir modal de reserva si se llegó desde el formulario de creación de contrato
  useEffect(() => {
    const autoModal = searchParams?.get("autoModal");
    if (autoModal === "RESERVATION" && !loading && account) {
      setModalMode("RESERVATION");
      // Limpiar el query param para que no vuelva a abrir el modal al refrescar
      const url = new URL(window.location.href);
      url.searchParams.delete("autoModal");
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, account]);

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
      const hasOpenModals = modalMode !== "NONE" || loadingModalOpen || statementModalOpen;
      
      if (isPageVisible && !hasOpenModals && !loading) {
        void load();
      }
    }, 30000); // 30 segundos

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, modalMode, loadingModalOpen, statementModalOpen, loading]);

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

  const resetPaymentForm = () => {
    setAmount("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setBankReference("");
    setPayerName("");
    setPaymentReference("");
    setOriginBank("");
    setDestinationBank("");
    setDestinationAccount("");
    setNotes("");
    setPaymentMethod(PAYMENT_METHOD_OPTIONS[0]);
    setAttachments([]);
    console.log("🔄 Formulario de pago reseteado");
  };

  const handleReceiptDataExtracted = (data: ExtractedPaymentData) => {
    // Pre-llenar campos del formulario con datos extraídos del comprobante
    if (data.amount) {
      // Redondear a 2 decimales
      setAmount(data.amount.toFixed(2));
    }
    
    if (data.date) {
      // Convertir fecha ISO a formato YYYY-MM-DD
      const dateOnly = data.date.split('T')[0];
      setPaymentDate(dateOnly);
    }
    
    if (data.reference) {
      setBankReference(data.reference);
    }
    
    if (data.payerName) {
      setPayerName(data.payerName);
    }
    
    if (data.paymentCode) {
      setPaymentReference(data.paymentCode.toUpperCase());
    }
    
    if (data.originBank) {
      setOriginBank(data.originBank);
    }
    
    if (data.destinationBank) {
      setDestinationBank(data.destinationBank);
    }
    
    if (data.destinationAccount) {
      setDestinationAccount(data.destinationAccount);
    }
    
    if (data.notes) {
      setNotes(data.notes);
    }

    // Mostrar mensaje de éxito con información de conversión si aplica
    let successMessage = "✅ Datos extraídos exitosamente";
    if (data.conversionApplied && data.originalAmount && data.originalCurrency && data.usedExchangeRate) {
      successMessage += ` | 💱 Conversión automática: ₡${data.originalAmount.toFixed(2)} → $${data.amount?.toFixed(2)} (TC: ₡${data.usedExchangeRate.toFixed(2)})`;
    }
    setStatusText(successMessage);
    setTimeout(() => setStatusText(""), 6000);
  };

  const openInstallmentModal = () => {
    resetPaymentForm();
    setAmount(String(Number(account?.invoice?.amounts?.balance || 0).toFixed(2)));
    setModalMode("INSTALLMENT");
  };

  const setInstallmentToFullBalance = () => {
    setAmount(String(Number(account?.invoice?.amounts?.balance || 0).toFixed(2)));
  };

  const closeMainModal = () => {
    setModalMode("NONE");
  };

  const onReportPayment = async (type: "RESERVATION" | "INSTALLMENT") => {
    if (!contractId || !amount.trim()) {
      setStatusText("Debes ingresar monto para continuar.");
      return;
    }

    const amountValue = Number.parseFloat(String(amount || "").replace(",", "."));
    const currentBalance = Number(account?.invoice?.amounts?.balance || 0);
    if (Number.isFinite(amountValue) && amountValue > currentBalance) {
      setStatusText("El abono no puede ser mayor al saldo pendiente del contrato.");
      return;
    }

    // Validar código de pago si fue proporcionado
    const trimmedPaymentRef = paymentReference.trim().toUpperCase();
    const expectedPaymentRef = String(account?.invoice?.paymentReference || "").trim().toUpperCase();
    
    if (trimmedPaymentRef) {
      // Validar que sea alfanumérico mixto (al menos 1 letra Y 1 número)
      const hasLetter = /[A-Z]/.test(trimmedPaymentRef);
      const hasNumber = /[0-9]/.test(trimmedPaymentRef);
      
      if (!hasLetter || !hasNumber) {
        setStatusText(`❌ El código de pago debe contener al menos 1 letra y 1 número (Ej: A3B7K9). Recibido: "${trimmedPaymentRef}"`);
        return;
      }
      
      if (trimmedPaymentRef.length !== 6) {
        setStatusText(`❌ El código de pago debe tener exactamente 6 caracteres. Recibido: "${trimmedPaymentRef}" (${trimmedPaymentRef.length} caracteres)`);
        return;
      }
      
      if (expectedPaymentRef && trimmedPaymentRef !== expectedPaymentRef) {
        setStatusText(`❌ El código de pago "${trimmedPaymentRef}" no coincide con el esperado "${expectedPaymentRef}". Verifica e intenta nuevamente.`);
        return;
      }
    }

    setSaving(true);
    setStatusText("");
    
    // Abrir modal de loading
    setLoadingModalMessage("Guardando abono...");
    setLoadingModalState("loading");
    setLoadingModalOpen(true);

    try {
      const methodLabel = paymentMethod
        .split("_")
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join(" ");
      const composedNotes = [
        `Metodo de pago: ${methodLabel}`,
        String(notes || "").trim(),
      ]
        .filter(Boolean)
        .join("\n");

      const result = await reportBillingPayment({
        contractId,
        type,
        amount,
        paymentDate,
        bankReference,
        payerName,
        originBank: originBank.trim() || undefined,
        destinationBank: destinationBank.trim() || undefined,
        destinationAccount: destinationAccount.trim() || undefined,
        paymentReference: paymentReference.trim() || undefined,
        notes: composedNotes,
        attachments,
      });

      // Cambiar a estado de éxito
      setLoadingModalState("success");
      setLoadingModalSuccessMsg(`✅ Abono registrado | Recibo: ${result.receiptNumber} | Monto: $${amount}`);
      
      // Cerrar modal de formulario y recargar datos
      closeMainModal();
      resetPaymentForm();
      await load();
      
    } catch (reportError) {
      const errorMsg = reportError instanceof Error ? reportError.message : "No se pudo registrar el pago.";
      
      // Cambiar a estado de error
      setLoadingModalState("error");
      setLoadingModalSuccessMsg(errorMsg);
      
      // Detectar errores críticos y mostrarlos en modal rojo adicional
      if (errorMsg.toLowerCase().includes("duplicado") || 
          errorMsg.toLowerCase().includes("ya existe")) {
        setCriticalAlert({
          title: "⚠️ Pago Duplicado Detectado",
          message: "Ya existe un pago con la misma información en el sistema.",
          details: errorMsg
        });
      } else if (errorMsg.toLowerCase().includes("cuenta destino no registrada") || 
                 errorMsg.toLowerCase().includes("cuenta destino inactiva")) {
        setCriticalAlert({
          title: "🚨 Pago Rechazado - Cuenta No Registrada",
          message: `La cuenta destino no está registrada en el sistema de ${tenantDisplayName}.`,
          details: errorMsg
        });
      } else {
        // Otros errores mostrar en statusText
        setStatusText(`❌ ${errorMsg}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const onVerify = async (paymentId: string) => {
    setActionBusy(`verify:${paymentId}`);
    try {
      await verifyBillingPayment(paymentId);
      setStatusText("Abono aprobado por banco.");
      await load();
    } catch (actionError) {
      setStatusText(actionError instanceof Error ? actionError.message : "No se pudo verificar el abono.");
    } finally {
      setActionBusy("");
    }
  };

  const onReject = async () => {
    const paymentId = String(rejectModalPaymentId || "").trim();
    const reason = String(rejectReason || "").trim();
    if (!paymentId) return;
    if (!reason) {
      setStatusText("Debes indicar el motivo del rechazo.");
      return;
    }

    setActionBusy(`reject:${paymentId}`);
    try {
      await rejectBillingPayment(paymentId, reason);
      setStatusText("Abono rechazado y recibo anulado.");
      setRejectModalPaymentId("");
      setRejectReason("");
      await load();
    } catch (actionError) {
      setStatusText(actionError instanceof Error ? actionError.message : "No se pudo rechazar el abono.");
    } finally {
      setActionBusy("");
    }
  };

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
      if (documentEmailModal.type === "RECEIPT") {
        const result = await approveAndSendBillingReceipt(documentEmailModal.id, toEmail, documentEmailCc);
        const ccText = result.ccEmail ? ` (CC: ${result.ccEmail})` : "";
        setDocumentEmailSuccess(`Recibo ${result.receiptNumber} enviado a ${result.sentToEmail}${ccText}.`);
        setStatusText(`Recibo ${result.receiptNumber} enviado a ${result.sentToEmail}${ccText}.`);
      } else {
        const result = await sendBillingCreditNoteEmail(documentEmailModal.id, toEmail, documentEmailCc);
        const ccText = result.ccEmail ? ` (CC: ${result.ccEmail})` : "";
        setDocumentEmailSuccess(`Nota de credito ${result.creditNoteNumber} enviada a ${result.sentToEmail}${ccText}.`);
        setStatusText(`Nota de credito ${result.creditNoteNumber} enviada a ${result.sentToEmail}${ccText}.`);
      }

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

  const onShareReceiptWhatsApp = async (receiptId: string) => {
    setActionBusy(`receipt-wa:${receiptId}`);
    try {
      const result = await getBillingReceiptPdfUrl(receiptId);
      const text = [
        `Recibo de contrato ${account?.invoice.contractNumber || "-"}`,
        `Cliente: ${account?.client.fullName || "-"}`,
        `Documento: ${result.url}`,
      ].join("\n");
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      setStatusText("Recibo preparado para compartir por WhatsApp.");
    } catch (actionError) {
      setStatusText(actionError instanceof Error ? actionError.message : "No se pudo compartir el recibo.");
    } finally {
      setActionBusy("");
    }
  };

  const onCreateCreditNote = async () => {
    if (!contractId || !creditNoteReason.trim() || !creditNoteAmount.trim()) {
      setStatusText("Debes indicar motivo y monto para la nota de credito.");
      return;
    }

    const amountValue = Number.parseFloat(String(creditNoteAmount || "").replace(",", "."));
    const currentBalance = Number(account?.invoice?.amounts?.balance || 0);
    if (Number.isFinite(amountValue) && amountValue > currentBalance) {
      setStatusText("La nota de credito no puede ser mayor al saldo pendiente del contrato.");
      return;
    }

    setActionBusy("credit-note:create");
    try {
      const result = await createBillingCreditNote({
        contractId,
        reason: creditNoteReason,
        amount: creditNoteAmount,
      });
      setStatusText(`Exito: nota de credito enviada a aprobacion: ${result.creditNoteNumber}`);
      setCreditNoteReason("");
      setCreditNoteAmount("");
      closeMainModal();
      await load();
    } catch (actionError) {
      setStatusText(actionError instanceof Error ? actionError.message : "No se pudo emitir la nota de credito.");
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
                          {formatDate(account.invoice.travel.departureDate)} → {formatDate(account.invoice.travel.returnDate)}
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
              <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0" onClick={openInstallmentModal}>
                Generar abono
              </button>
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
              <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0" onClick={() => setModalMode("CREDIT_NOTE")}>
                Generar nota de credito
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
                <h3>Flujo operativo</h3>
                <p>1) Agente registra abono o solicita nota de credito.</p>
                <p>2) Admin revisa y define estado: <strong>Aprobado</strong> o <strong>Rechazado</strong>.</p>
                <p>3) Cuando queda <strong>Aprobado</strong>, se habilitan PDF, WhatsApp y correo.</p>
                <p>4) En rol Agente, correo se usa como <strong>reenvio</strong> solo despues del primer envio de Admin.</p>
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
                      <td>{formatVoucherDate(payment.voucherDate)}</td>
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
                          {isAdmin && (payment.status === "ABONO_REPORTADO" || payment.status === "ABONO_EN_REVISION") ? (
                            <button
                              type="button"
                              className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                              onClick={() => void onVerify(payment.id)}
                              disabled={actionBusy === `verify:${payment.id}`}
                            >
                              {actionBusy === `verify:${payment.id}` ? "..." : "Aprobar banco (manual)"}
                            </button>
                          ) : null}

                          {isAdmin && (payment.status === "ABONO_REPORTADO" || payment.status === "ABONO_EN_REVISION") ? (
                            <button
                              type="button"
                              className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                              onClick={() => {
                                setRejectModalPaymentId(payment.id);
                                setRejectReason("");
                              }}
                              disabled={actionBusy === `reject:${payment.id}`}
                            >
                              {actionBusy === `reject:${payment.id}` ? "..." : "Rechazar"}
                            </button>
                          ) : null}

                          {isAdmin && payment.status === "ABONO_VERIFICADO" && payment.receipt && payment.receipt.status !== "RECIBO_ANULADO" ? (
                            <button
                              type="button"
                              className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                              onClick={() =>
                                openDocumentEmailModal({
                                  type: "RECEIPT",
                                  id: payment.receipt!.id,
                                  number: payment.receipt!.receiptNumber,
                                  mode: payment.receipt?.status === "RECIBO_APROBADO_ENVIADO" ? "RESEND" : "SEND",
                                })
                              }
                              disabled={actionBusy === "document:email"}
                            >
                              {payment.receipt?.status === "RECIBO_APROBADO_ENVIADO" ? "Reenviar por correo" : "Enviar por correo"}
                            </button>
                          ) : null}

                          {!isAdmin && payment.status === "ABONO_VERIFICADO" && payment.receipt?.status === "RECIBO_APROBADO_ENVIADO" ? (
                            <button
                              type="button"
                              className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                              onClick={() =>
                                openDocumentEmailModal({
                                  type: "RECEIPT",
                                  id: payment.receipt!.id,
                                  number: payment.receipt!.receiptNumber,
                                  mode: "RESEND",
                                })
                              }
                              disabled={actionBusy === "document:email"}
                            >
                              Reenviar por correo
                            </button>
                          ) : null}

                          {payment.receipt && payment.status === "ABONO_VERIFICADO" ? (
                            <button
                              type="button"
                              className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                              onClick={() => void onOpenReceiptPdf(payment.receipt!.id)}
                              disabled={actionBusy === `receipt-pdf:${payment.receipt.id}`}
                            >
                              {actionBusy === `receipt-pdf:${payment.receipt.id}` ? "..." : "PDF recibo"}
                            </button>
                          ) : null}

                          {payment.receipt && payment.status === "ABONO_VERIFICADO" ? (
                            <button
                              type="button"
                              className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                              onClick={() => void onShareReceiptWhatsApp(payment.receipt!.id)}
                              disabled={actionBusy === `receipt-wa:${payment.receipt.id}`}
                            >
                              {actionBusy === `receipt-wa:${payment.receipt.id}` ? "..." : "Compartir WhatsApp"}
                            </button>
                          ) : null}

                          {!isAdmin && payment.status !== "ABONO_VERIFICADO" ? (
                            <span className="history-col-muted">En espera de aprobacion admin</span>
                          ) : null}

                          {!isAdmin && payment.status === "ABONO_VERIFICADO" && payment.receipt?.status !== "RECIBO_APROBADO_ENVIADO" ? (
                            <span className="history-col-muted">Recibo aprobado. Pendiente de envio por admin.</span>
                          ) : null}
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
                              ) : (
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
                              )}
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
                  <button
                    type="button"
                    className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                    onClick={() => void onShareStatementWhatsApp()}
                    disabled={actionBusy === "statement:wa"}
                  >
                    {actionBusy === "statement:wa" ? "Preparando..." : "Compartir por WhatsApp"}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                    onClick={() => setShowStatementEmailForm((prev) => !prev)}
                    disabled={actionBusy === "statement:email"}
                  >
                    {showStatementEmailForm ? "Ocultar correo" : "Enviar por correo"}
                  </button>
                </div>

                {statementEmailSuccess ? <p className="form-success">{statementEmailSuccess}</p> : null}
                {statementEmailError ? <p className="form-error">{statementEmailError}</p> : null}

                {showStatementEmailForm ? (
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

      {documentEmailModal ? (
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
                Documento: <strong>{documentEmailModal.type === "RECEIPT" ? "Recibo" : "Nota de credito"}</strong> · Numero: <strong>{documentEmailModal.number}</strong>
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

      {modalMode !== "NONE" ? (
        <section
          className="viewer-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeMainModal();
            }
          }}
        >
          <div className="viewer-panel reject-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="viewer-head">
              <h2>
                {modalMode === "INSTALLMENT" ? "Registrar abono" : null}
                {modalMode === "CREDIT_NOTE" ? "Generar nota de credito" : null}
              </h2>
              <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none" onClick={closeMainModal}>Cerrar</button>
            </div>

            <div className="viewer-body">
              {modalMode === "INSTALLMENT" ? (
                <div className="payment-modal-layout">
                  {/* Columna izquierda: Procesador de comprobantes */}
                  <div className="payment-modal-receipt">
                    <ReceiptProcessor 
                      onDataExtracted={handleReceiptDataExtracted}
                      onFileSelected={(file) => {
                        // Guardar el archivo en el estado de attachments
                        setAttachments([file]);
                        console.log("📎 Archivo adjunto agregado:", file.name, "("+file.size+" bytes)");
                      }}
                      onError={(error) => {
                        // Detectar error de cuenta destino no registrada
                        const errorMsg = String(error || "").toLowerCase();
                        if (errorMsg.includes("cuenta destino no registrada") || errorMsg.includes("cuenta destino inactiva")) {
                          setCriticalAlert({
                            title: "🚨 Pago Rechazado - Cuenta No Registrada",
                            message: `La cuenta destino detectada en el comprobante NO está registrada en el sistema de ${tenantDisplayName}.`,
                            details: error
                          });
                        } else {
                          setStatusText(`❌ ${error}`);
                        }
                      }}
                    />
                  </div>

                  {/* Columna derecha: Información y formulario */}
                  <div className="payment-modal-form">
                    <p className="m-0 text-[#4b6790] text-[0.8rem] leading-tight">
                      Contrato: <strong>{account?.invoice.contractNumber || "-"}</strong> · Saldo: <strong>{formatMoney(account?.invoice.amounts.balance || 0)}</strong>
                    </p>

                    <p className="m-0 text-[#64748b] text-[0.75rem] mb-3 leading-tight">
                      El sistema guarda fecha/hora y usuario responsable automáticamente.
                    </p>

                    <div className="contracts-grid">
                      <label>
                        <span style={{ 
                        color: amount.trim() ? '#10b981' : '#dc2626',
                        fontWeight: '600',
                        transition: 'color 0.3s ease'
                      }}>
                        Monto
                      </span>
                      {modalMode === "INSTALLMENT" ? (
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                          <input value={amount} onChange={(event) => setAmount(event.target.value)} />
                          <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none" onClick={setInstallmentToFullBalance}>
                            Saldo total
                          </button>
                        </div>
                      ) : (
                        <input value={amount} onChange={(event) => setAmount(event.target.value)} />
                      )}
                    </label>

                    <label>
                      <span style={{ 
                        color: paymentMethod.trim() ? '#10b981' : '#dc2626',
                        fontWeight: '600',
                        transition: 'color 0.3s ease'
                      }}>
                        Metodo de pago
                      </span>
                      <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                        {PAYMENT_METHOD_OPTIONS.map((method) => (
                          <option key={method} value={method}>
                            {method === "TRANSFERENCIA_BANCARIA" ? "Transferencia Bancaria" : null}
                            {method === "EFECTIVO" ? "Efectivo" : null}
                            {method === "SINPE_MOVIL" ? "Sinpe Movil" : null}
                            {method === "TARJETA" ? "Tarjeta" : null}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span style={{ 
                        color: paymentDate.trim() ? '#10b981' : '#dc2626',
                        fontWeight: '600',
                        transition: 'color 0.3s ease'
                      }}>
                        Fecha del comprobante
                      </span>
                      <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
                    </label>

                    <label>
                      <span style={{ 
                        color: bankReference.trim() ? '#10b981' : '#dc2626',
                        fontWeight: '600',
                        transition: 'color 0.3s ease'
                      }}>
                        Referencia bancaria
                      </span>
                      <input value={bankReference} onChange={(event) => setBankReference(event.target.value)} />
                    </label>

                    <label>
                      <span style={{ 
                        color: payerName.trim() ? '#10b981' : '#dc2626',
                        fontWeight: '600',
                        transition: 'color 0.3s ease'
                      }}>
                        Nombre del pagador
                      </span>
                      <input value={payerName} onChange={(event) => setPayerName(event.target.value)} />
                    </label>

                    <label>
                      <span style={{ 
                        color: paymentReference.trim() ? '#10b981' : '#94a3b8',
                        fontWeight: '600',
                        transition: 'color 0.3s ease'
                      }}>
                        Código de pago (opcional)
                      </span>
                      <input 
                        value={paymentReference} 
                        onChange={(event) => setPaymentReference(event.target.value.toUpperCase())} 
                        maxLength={6}
                        style={{ fontFamily: 'Monaco, Consolas, monospace', letterSpacing: '1px' }}
                      />
                      <small style={{ display: 'block', marginTop: '4px', color: '#64748b', fontSize: '12px' }}>
                        {account?.invoice.paymentReference ? (
                          <>Código esperado: <strong>{account.invoice.paymentReference}</strong></>
                        ) : null}
                      </small>
                    </label>

                    <label>
                      <span style={{ 
                        color: originBank.trim() ? '#10b981' : '#dc2626',
                        fontWeight: '600',
                        transition: 'color 0.3s ease'
                      }}>
                        Banco origen
                      </span>
                      <input 
                        value={originBank} 
                        onChange={(event) => setOriginBank(event.target.value)} 
                      />
                    </label>

                    <label>
                      <span style={{ 
                        color: destinationBank.trim() ? '#10b981' : '#dc2626',
                        fontWeight: '600',
                        transition: 'color 0.3s ease'
                      }}>
                        Banco destino
                      </span>
                      <input 
                        value={destinationBank} 
                        onChange={(event) => setDestinationBank(event.target.value)} 
                      />
                    </label>

                    <label>
                      <span style={{ 
                        color: destinationAccount.trim() ? '#10b981' : '#dc2626',
                        fontWeight: '600',
                        transition: 'color 0.3s ease'
                      }}>
                        Cuenta destino
                      </span>
                      <input 
                        value={destinationAccount} 
                        onChange={(event) => setDestinationAccount(event.target.value)} 
                      />
                    </label>

                    <label className="col-span-full">
                      <span style={{ 
                        color: notes.trim() ? '#10b981' : '#dc2626',
                        fontWeight: '600',
                        transition: 'color 0.3s ease'
                      }}>
                        Notas
                      </span>
                      <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
                    </label>
                  </div>

                  <div className="actions" style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                      onClick={() => void onReportPayment("INSTALLMENT")}
                      disabled={saving}
                    >
                      {saving ? "Guardando..." : "Confirmar abono"}
                    </button>
                  </div>
                </div>

                </div>
              ) : null}

              {modalMode === "CREDIT_NOTE" ? (
                <>
                  <label className="reject-modal-label">
                    Motivo
                    <textarea
                      rows={4}
                      value={creditNoteReason}
                      onChange={(event) => setCreditNoteReason(event.target.value)}
                      placeholder="Motivo de la nota de credito"
                    />
                  </label>
                  <label className="reject-modal-label" style={{ marginTop: 10 }}>
                    Monto
                    <input
                      value={creditNoteAmount}
                      onChange={(event) => setCreditNoteAmount(event.target.value)}
                      placeholder="Ej. 25000"
                    />
                  </label>

                  <div className="actions" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                      onClick={() => void onCreateCreditNote()}
                      disabled={actionBusy === "credit-note:create"}
                    >
                      {actionBusy === "credit-note:create" ? "Guardando..." : "Enviar a aprobacion"}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

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
              <h2>Rechazar abono</h2>
              <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none" onClick={() => setRejectModalPaymentId("")}>Cerrar</button>
            </div>

            <div className="viewer-body">
              <label className="reject-modal-label">
                Motivo del rechazo
                <textarea
                  rows={5}
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder="Describe por que el abono no coincide con la verificacion bancaria"
                />
              </label>

              <div className="actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                  onClick={() => void onReject()}
                  disabled={actionBusy === `reject:${rejectModalPaymentId}`}
                >
                  {actionBusy === `reject:${rejectModalPaymentId}` ? "Guardando..." : "Confirmar rechazo"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Modal de alerta crítica para cuenta no registrada */}
      {criticalAlert ? (
        <section
          className="viewer-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setCriticalAlert(null);
            }
          }}
          style={{ zIndex: 10000 }}
        >
          <div 
            className="viewer-panel reject-modal-panel" 
            onClick={(event) => event.stopPropagation()}
            style={{
              maxWidth: '550px',
              border: '3px solid #dc2626',
              boxShadow: '0 20px 25px -5px rgba(220, 38, 38, 0.3)'
            }}
          >
            <div className="viewer-head" style={{ background: '#dc2626', color: 'white' }}>
              <h2 style={{ color: 'white', margin: 0 }}>{criticalAlert.title}</h2>
              <button 
                type="button" 
                className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg" 
                onClick={() => setCriticalAlert(null)}
                style={{ background: 'white', color: '#dc2626' }}
              >
                Cerrar
              </button>
            </div>

            <div className="viewer-body" style={{ padding: '24px' }}>
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px'
              }}>
                <p style={{ 
                  fontSize: '16px', 
                  fontWeight: '600', 
                  color: '#991b1b',
                  marginBottom: '12px',
                  lineHeight: '1.5'
                }}>
                  {criticalAlert.message}
                </p>
                <p style={{ 
                  fontSize: '14px', 
                  color: '#7f1d1d',
                  marginBottom: '12px',
                  lineHeight: '1.6'
                }}>
                  <strong>⚠️ Acción requerida:</strong> Por favor, verifique con el administrador que esta cuenta bancaria esté registrada en el sistema antes de procesar este pago.
                </p>
                <p style={{ 
                  fontSize: '14px', 
                  color: '#7f1d1d',
                  marginBottom: '0',
                  lineHeight: '1.6'
                }}>
                  <strong>🔒 Razón de seguridad:</strong> Solo se aceptan pagos a cuentas verificadas de {tenantDisplayName} para prevenir fraudes.
                </p>
              </div>

              {criticalAlert.details ? (
                <details style={{ 
                  background: '#f9fafb', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '12px',
                  fontSize: '13px',
                  color: '#6b7280'
                }}>
                  <summary style={{ cursor: 'pointer', fontWeight: '500', marginBottom: '8px' }}>
                    Ver detalles técnicos
                  </summary>
                  <pre style={{ 
                    whiteSpace: 'pre-wrap', 
                    wordBreak: 'break-word',
                    fontSize: '12px',
                    fontFamily: 'Monaco, Consolas, monospace',
                    margin: '0',
                    color: '#374151'
                  }}>
                    {criticalAlert.details}
                  </pre>
                </details>
              ) : null}

              <div className="actions" style={{ marginTop: '20px' }}>
                <button
                  type="button"
                  className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                  onClick={() => setCriticalAlert(null)}
                  style={{ 
                    width: '100%',
                    background: '#dc2626',
                    color: 'white',
                    fontSize: '15px',
                    padding: '12px'
                  }}
                >
                  Entendido - Verificar con Admin
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Loading Modal Animado */}
      <LoadingModal
        isOpen={loadingModalOpen}
        state={loadingModalState}
        loadingMessage={loadingModalMessage}
        successMessage={loadingModalSuccessMsg}
        errorMessage={loadingModalSuccessMsg}
        onClose={() => setLoadingModalOpen(false)}
        autoCloseDelay={2000}
      />
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

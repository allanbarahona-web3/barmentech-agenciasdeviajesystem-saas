"use client";

export const dynamic = 'force-dynamic';

import { getStoredToken } from "@/lib/auth-api";
import {
  type ContractFileDocument,
  type HistoryContractItem,
  deleteContractDraft,
  getContractFiles,
  resendSignedEmail,
  searchContracts,
  sendSigningLinksForContract,
} from "@/lib/contracts-api";
import { ToastNotification, useToast } from "@/components/toast-notification";
import { ConfirmModal } from "@/components/confirm-modal";
import { PageLoader } from "@/components/loading-spinner";
import AttachmentViewer from "@/components/attachment-viewer";
import { DocumentStatusIndicator } from "@/components/document-status-indicator";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const STATUS_SIGNED = "SIGNED";

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-CR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const resolveTripType = (item: HistoryContractItem): {
  label: string;
  bg: string;
  color: string;
} => {
  const source = String(item.source || "").toUpperCase();

  if (item.internalTripId || source === "INTERNAL_TRIP") {
    return { label: "Interno", bg: "#dcfce7", color: "#166534" };
  }

  if (item.travelPackageId || source === "SCHEDULED_TRIP") {
    return { label: "Internacional", bg: "#dbeafe", color: "#1d4ed8" };
  }

  if (item.kind === "DRAFT") {
    return { label: "Borrador", bg: "#f3f4f6", color: "#374151" };
  }

  return { label: "Contrato", bg: "#e5e7eb", color: "#374151" };
};

export default function HistoryPage() {
  const router = useRouter();
  
  // Cargar filtros desde localStorage
  const [query, setQuery] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("history_filter_query") || "";
    }
    return "";
  });
  const [status, setStatus] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("history_filter_status") || "";
    }
    return "";
  });
  const [dateFilter, setDateFilter] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("history_filter_dateFilter") || "";
    }
    return "";
  });
  const [dateFrom, setDateFrom] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("history_filter_dateFrom") || "";
    }
    return "";
  });
  const [dateTo, setDateTo] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("history_filter_dateTo") || "";
    }
    return "";
  });
  
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<HistoryContractItem[]>([]);
  const [busyAction, setBusyAction] = useState<string>("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerTitle, setViewerTitle] = useState("Visor");
  const [viewerMode, setViewerMode] = useState<"html" | "documents">("html");
  const [viewerHtml, setViewerHtml] = useState("");
  const [viewerDocs, setViewerDocs] = useState<ContractFileDocument[]>([]);
  const [draftToDelete, setDraftToDelete] = useState<{ id: string; contractNumber: string; clientFullName: string } | null>(null);
  const [pdfProcessingDialogOpen, setPdfProcessingDialogOpen] = useState(false);
  const [attachmentViewerData, setAttachmentViewerData] = useState<{ attachments: Array<{ id: string; originalFileName: string; url: string; mimeType: string }>; initialIndex: number } | null>(null);
  const { toasts, showSuccess, showError, showInfo, dismissToast } = useToast();

  const closeViewer = () => {
    setViewerOpen(false);
    setViewerTitle("Visor");
    setViewerMode("html");
    setViewerHtml("");
    setViewerDocs([]);
  };

  useEffect(() => {
    if (!viewerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeViewer();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerOpen]);

  const load = async (
    search = query,
    statusValue = status,
    dateFilterValue = dateFilter,
    dateFromValue = dateFrom,
    dateToValue = dateTo
  ) => {
    setLoading(true);
    try {
      const params: any = { 
        q: search, 
        status: statusValue,
        limit: 60 
      };
      
      // Si hay preset, lo usamos
      if (dateFilterValue && dateFilterValue !== "custom") {
        params.datePreset = dateFilterValue;
      }
      
      // Si es custom o hay fechas específicas, usamos dateFrom/dateTo
      if (dateFilterValue === "custom" || (!dateFilterValue && (dateFromValue || dateToValue))) {
        if (dateFromValue) params.dateFrom = dateFromValue;
        if (dateToValue) params.dateTo = dateToValue;
      }
      
      const result = await searchContracts(params);
      setItems(result);
    } catch (fetchError) {
      showError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar historial.");
    } finally {
      setLoading(false);
    }
  };

  // Guardar filtros en localStorage y recargar con debounce
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("history_filter_query", query);
      localStorage.setItem("history_filter_status", status);
      localStorage.setItem("history_filter_dateFilter", dateFilter);
      localStorage.setItem("history_filter_dateFrom", dateFrom);
      localStorage.setItem("history_filter_dateTo", dateTo);
    }

    const timer = setTimeout(() => {
      void load();
    }, 500);
    
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, dateFilter, dateFrom, dateTo]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/");
      return;
    }

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const statusInfo = (status: string) => {
    const normalized = String(status || "").trim().toUpperCase();
    if (normalized === "DRAFT") {
      return { label: "Borrador", className: "status-draft" };
    }
    if (normalized === STATUS_SIGNED) {
      return { label: "Firmado", className: "status-signed" };
    }
    if (normalized === "PENDING_PAYMENT_RESERVE") {
      return { label: "Esperando pago de reserva", className: "status-pending" };
    }
    if (normalized === "RESERVE_IN_REVIEW") {
      return { label: "Pago de reserva en revisi\u00f3n", className: "status-pending" };
    }
    if (normalized === "PENDING_SIGNATURE") {
      return { label: "Listo enviar a firmar", className: "status-ready" };
    }
    if (normalized === "SIGNING_SENT") {
      return { label: "Firmantes notificados", className: "status-sent" };
    }
    return { label: "Pendiente", className: "status-pending" };
  };

  const getDocKind = (name: string) => {
    const normalized = String(name || "").toLowerCase();

    if (normalized.includes("titular-")) {
      if (normalized.includes("cedula-frente") || normalized.includes("cedula_front")) return "titular-cedula-front";
      if (normalized.includes("cedula-reverso") || normalized.includes("cedula_back")) return "titular-cedula-back";
      if (normalized.includes("pasaporte") || normalized.includes("passport")) return "titular-passport";
    }

    const companionMatch = normalized.match(/acompanante(\d+)/);
    if (companionMatch) {
      const n = companionMatch[1];
      if (normalized.includes("cedula-frente") || normalized.includes("cedula_front")) return `companion${n}-cedula-front`;
      if (normalized.includes("cedula-reverso") || normalized.includes("cedula_back")) return `companion${n}-cedula-back`;
      if (normalized.includes("pasaporte") || normalized.includes("passport")) return `companion${n}-passport`;
    }

    const minorMatch = normalized.match(/menor(\d+)/);
    if (minorMatch) {
      const n = minorMatch[1];
      if (normalized.includes("tutor-")) {
        if (normalized.includes("cedula-frente") || normalized.includes("cedula_front")) return `minor${n}-tutor-cedula-front`;
        if (normalized.includes("cedula-reverso") || normalized.includes("cedula_back")) return `minor${n}-tutor-cedula-back`;
        if (normalized.includes("pasaporte") || normalized.includes("passport")) return `minor${n}-tutor-passport`;
      } else {
        if (normalized.includes("cedula-frente") || normalized.includes("cedula_front")) return `minor${n}-cedula-front`;
        if (normalized.includes("cedula-reverso") || normalized.includes("cedula_back")) return `minor${n}-cedula-back`;
        if (normalized.includes("pasaporte") || normalized.includes("passport")) return `minor${n}-passport`;
      }
    }

    return "other";
  };

  const openContractPdf = async (contractId: string) => {
    setBusyAction(`contract:${contractId}`);
    try {
      const files = await getContractFiles(contractId);
      const url = files.signedPdf?.url || files.pdf?.url || "";
      if (!url) {
        setPdfProcessingDialogOpen(true);
      } else {
        setViewerTitle("Contrato");
        setViewerMode("html");
        setViewerHtml(`<iframe src="${url}" title="Contrato" class="viewer-iframe"></iframe>`);
        setViewerOpen(true);
      }
    } catch (actionError) {
      showError(actionError instanceof Error ? actionError.message : "No se pudo abrir el contrato.");
    } finally {
      setBusyAction("");
    }
  };

  const openPackageDocuments = async (contractId: string) => {
    setBusyAction(`package:${contractId}`);
    try {
      const files = await getContractFiles(contractId);
      const packageDocs = files.packageDocuments || [];
      
      // Convertir packageDocuments a formato de attachments
      const attachments = packageDocs
        .filter(doc => doc.signedPdfUrl) // Solo mostrar documentos con PDF firmado
        .map(doc => ({
          id: doc.id,
          originalFileName: doc.signedPdfFileName || `${doc.documentType}.pdf`,
          url: doc.signedPdfUrl!,
          mimeType: 'application/pdf',
        }));
      
      if (attachments.length === 0) {
        showInfo("No hay documentos firmados disponibles aún.");
        return;
      }
      
      setAttachmentViewerData({ attachments, initialIndex: 0 });
    } catch (actionError) {
      showError(actionError instanceof Error ? actionError.message : "No se pudieron abrir los documentos.");
    } finally {
      setBusyAction("");
    }
  };

  const openDocuments = async (contractId: string) => {
    setBusyAction(`documents:${contractId}`);
    try {
      const files = await getContractFiles(contractId);
      setViewerTitle("Documentos del contrato");
      setViewerMode("documents");
      setViewerDocs(files.documents || []);
      setViewerOpen(true);
    } catch (actionError) {
      showError(actionError instanceof Error ? actionError.message : "No se pudieron abrir los documentos.");
    } finally {
      setBusyAction("");
    }
  };

  const onResendSigned = async (contractId: string) => {
    setBusyAction(`resend:${contractId}`);
    try {
      const result = await resendSignedEmail(contractId);
      if (result.sentCount > 0) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === contractId
              ? {
                  ...item,
                  signedContractResent: true,
                  signedContractResentAt: new Date().toISOString(),
                }
              : item,
          ),
        );
        showSuccess("Contrato reenviado exitosamente.");
      } else {
        showInfo("No se enviaron correos.");
      }
    } catch (actionError) {
      showError(actionError instanceof Error ? actionError.message : "No se pudo reenviar.");
    } finally {
      setBusyAction("");
    }
  };

  const onSendSigningLinks = async (contractId: string) => {
    setBusyAction(`sign:${contractId}`);
    try {
      const result = await sendSigningLinksForContract(contractId);
      setItems((prev) =>
        prev.map((item) =>
          item.id === contractId ? { ...item, status: "SIGNING_SENT" } : item,
        ),
      );
      showSuccess(
        result.emailsSent > 0
          ? `${result.emailsSent} correo(s) de firma enviados a los firmantes.`
          : "Contrato marcado como enviado. Comparte los links manualmente.",
      );
    } catch (actionError) {
      showError(actionError instanceof Error ? actionError.message : "No se pudo enviar a firmar.");
    } finally {
      setBusyAction("");
    }
  };

  const openDeleteDraftModal = (item: HistoryContractItem) => {
    setDraftToDelete({
      id: item.id,
      contractNumber: item.contractNumber,
      clientFullName: item.clientFullName,
    });
  };

  const closeDeleteDraftModal = () => {
    if (busyAction === "delete-draft:confirm") return;
    setDraftToDelete(null);
  };

  const confirmDeleteDraft = async () => {
    if (!draftToDelete) return;

    const draftId = draftToDelete.id;
    setBusyAction("delete-draft:confirm");
    try {
      await deleteContractDraft(draftId);
      setItems((prev) => prev.filter((item) => item.id !== draftId));
      showSuccess("Borrador eliminado correctamente.");
      setDraftToDelete(null);
    } catch (actionError) {
      showError(actionError instanceof Error ? actionError.message : "No se pudo eliminar el borrador.");
    } finally {
      setBusyAction("");
    }
  };

  const groupedDocuments = useMemo(() => {
    const byGroup: Record<string, ContractFileDocument[]> = {};
    for (const doc of viewerDocs) {
      const kind = getDocKind(doc.originalFileName);
      let key = "Otros documentos";
      if (kind.startsWith("titular-")) key = "Titular";
      else if (kind.startsWith("companion")) key = `Acompanante ${kind.replace("companion", "").split("-")[0]}`;
      else if (kind.startsWith("minor")) key = `Menor ${kind.replace("minor", "").split("-")[0]}`;

      if (!byGroup[key]) byGroup[key] = [];
      byGroup[key].push(doc);
    }
    return byGroup;
  }, [viewerDocs]);

  return (
    <main className="app-shell">
      {loading && items.length === 0 ? (
        <PageLoader />
      ) : (
        <section className="card contracts-card">
          <h1>Historial de contratos</h1>
          <p className="m-0 text-[#4b6790] text-sm">Panel de búsqueda y consulta de contratos archivados, firmados y borradores.</p>

          <div className="contracts-grid" style={{ marginTop: 12 }}>
            <label>
              Buscar
              <input
                value={query}
                placeholder="Cliente, contrato, cedula o correo"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <label>
              Estado
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Todos</option>
                <option value="DRAFT">Borrador</option>
                <option value="PENDING_SIGNATURE">Listo para enviar</option>
                <option value="SIGNING_SENT">Enviado a firmar</option>
                <option value="SIGNED">Firmado</option>
                <option value="PENDING_PAYMENT_RESERVE">Esperando pago reserva</option>
                <option value="RESERVE_IN_REVIEW">Reserva en revisión</option>
              </select>
            </label>

            <label>
              Fecha
              <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
                <option value="">Todo el historial</option>
                <option value="7days">Últimos 7 días</option>
                <option value="1week">Última semana</option>
                <option value="2weeks">Últimas 2 semanas</option>
                <option value="1month">Último mes</option>
                <option value="3months">Últimos 3 meses</option>
                <option value="custom">Rango personalizado</option>
              </select>
            </label>

            {dateFilter === "custom" && (
              <>
                <label>
                  Desde
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                  />
                </label>

                <label>
                  Hasta
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                  />
                </label>
              </>
            )}
          </div>

          {!loading && items.length === 0 ? (
            <div className="empty-state">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <h3>No se encontraron contratos</h3>
              <p>Intenta con otros terminos de busqueda o revisa los filtros aplicados.</p>
            </div>
          ) : (
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Cedula</th>
                    <th>Correo</th>
                    <th>Telefono</th>
                    <th>Numero contrato</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const status = statusInfo(item.status);
                    const tripType = resolveTripType(item);
                    const isSigned = String(item.status || "").toUpperCase() === STATUS_SIGNED;
                    const isDraft = String(item.status || "").toUpperCase() === "DRAFT";
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="history-col-name">{item.clientFullName}</div>
                          <div className="history-col-muted">{formatDateTime(item.createdAt)}</div>
                        </td>
                        <td>{item.clientIdNumber || "-"}</td>
                        <td>{item.clientEmail || "-"}</td>
                        <td>{item.clientPhone || "-"}</td>
                        <td>{item.contractNumber}</td>
                        <td>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 10px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 700,
                              backgroundColor: tripType.bg,
                              color: tripType.color,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {tripType.label}
                          </span>
                        </td>
                        <td>
                          {isDraft ? (
                            <span className={`contract-status ${status.className}`}>{status.label}</span>
                          ) : (
                            <DocumentStatusIndicator documents={item.packageDocuments || []} />
                          )}
                        </td>
                        <td>
                          <div className="history-actions">
                            {isDraft ? (
                              <>
                                <Link href={`/contracts?draftId=${encodeURIComponent(item.id)}`} className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 no-underline inline-flex items-center justify-center">
                                  Continuar borrador
                                </Link>
                                <button
                                  type="button"
                                  className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                                  onClick={() => openDeleteDraftModal(item)}
                                  disabled={busyAction === "delete-draft:confirm"}
                                >
                                  Eliminar borrador
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                                  onClick={() => void openContractPdf(item.id)}
                                  disabled={busyAction === `contract:${item.id}`}
                                >
                                  {busyAction === `contract:${item.id}` ? "Abriendo..." : "Contrato"}
                                </button>
                                <button
                                  type="button"
                                  className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                                  onClick={() => void openPackageDocuments(item.id)}
                                  disabled={busyAction === `package:${item.id}`}
                                  title="Ver documentos firmados del expediente (Anexos, Exoneraciones)"
                                >
                                  {busyAction === `package:${item.id}` ? "Abriendo..." : "📦 Expediente"}
                                </button>
                                <button
                                  type="button"
                                  className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                                  onClick={() => void openDocuments(item.id)}
                                  disabled={busyAction === `documents:${item.id}`}
                                >
                                  {busyAction === `documents:${item.id}` ? "Abriendo..." : "Documentos"}
                                </button>
                              </>
                            )}
                            {isSigned ? (
                              <button
                                type="button"
                                className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                                onClick={() => void onResendSigned(item.id)}
                                disabled={busyAction === `resend:${item.id}`}
                              >
                                {busyAction === `resend:${item.id}` ? "Enviando..." : "Reenviar firmado"}
                              </button>
                            ) : null}
                            {item.status === "PENDING_SIGNATURE" ? (
                              <button
                                type="button"
                                className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                                onClick={() => void onSendSigningLinks(item.id)}
                                disabled={busyAction === `sign:${item.id}`}
                              >
                                {busyAction === `sign:${item.id}` ? "Enviando..." : "✉️ Enviar a Firmar"}
                              </button>
                            ) : null}
                            {isSigned || item.status === "PENDING_SIGNATURE" || item.status === "SIGNING_SENT" || item.status === "PENDING_PAYMENT_RESERVE" || item.status === "RESERVE_IN_REVIEW" ? (
                              <Link href={`/billing/${encodeURIComponent(item.id)}`} className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 no-underline inline-flex items-center justify-center">
                                Estado de cuenta
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {viewerOpen ? (
        <section className="viewer-modal" onClick={closeViewer}>
          <div className="viewer-panel" onClick={(event) => event.stopPropagation()}>
            <div className="viewer-head">
              <h2>{viewerTitle}</h2>
              <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0" onClick={closeViewer}>
                Cerrar
              </button>
            </div>

            <div className="viewer-body">
              {viewerMode === "html" ? (
                <div dangerouslySetInnerHTML={{ __html: viewerHtml }} />
              ) : (
                Object.entries(groupedDocuments).map(([group, docs]) => (
                       <section key={group} className="doc-person-group">
                    <h4>{group}</h4>
                    <div className="doc-grid">
                      {docs.map((doc, docIndex) => {
                        const isImage = String(doc.mimeType || "").startsWith("image/");
                        const isPDF = String(doc.mimeType || "").toLowerCase() === "application/pdf";
                        
                        return (
                          <article key={doc.id} className="viewer-doc-card">
                            <p className="viewer-doc-card-title">{doc.originalFileName}</p>
                            {isImage || isPDF ? (
                              <div
                                onClick={() => {
                                  // Encontrar el índice global del documento en todos los docs
                                  const allDocs = viewerDocs.filter(d => 
                                    String(d.mimeType || "").startsWith("image/") || 
                                    String(d.mimeType || "").toLowerCase() === "application/pdf"
                                  );
                                  const globalIndex = allDocs.findIndex(d => d.id === doc.id);
                                  
                                  setAttachmentViewerData({
                                    attachments: allDocs.map(d => ({
                                      id: d.id,
                                      originalFileName: d.originalFileName,
                                      url: d.url,
                                      mimeType: d.mimeType
                                    })),
                                    initialIndex: globalIndex >= 0 ? globalIndex : 0
                                  });
                                }}
                                style={{ cursor: "pointer", position: "relative" }}
                              >
                                {isImage ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={doc.url} alt={doc.originalFileName} loading="lazy" />
                                ) : (
                                  <div style={{
                                    padding: "20px",
                                    textAlign: "center",
                                    background: "#f5f5f5",
                                    borderRadius: "8px",
                                    border: "2px dashed #ddd"
                                  }}>
                                    <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📄</div>
                                    <div style={{ fontSize: "0.9rem", color: "#666" }}>Click para ver PDF</div>
                                  </div>
                                )}
                                <div style={{
                                  position: "absolute",
                                  top: "8px",
                                  right: "8px",
                                  background: "rgba(0, 0, 0, 0.7)",
                                  color: "white",
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  fontSize: "0.75rem",
                                  fontWeight: "500"
                                }}>🔍 Click para zoom</div>
                              </div>
                            ) : (
                              <a href={doc.url} target="_blank" rel="noopener noreferrer">
                                Ver documento
                              </a>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))
              )}
            </div>
          </div>
        </section>
      ) : null}

      <ConfirmModal
        isOpen={pdfProcessingDialogOpen}
        onCancel={() => setPdfProcessingDialogOpen(false)}
        onConfirm={() => setPdfProcessingDialogOpen(false)}
        title="El contrato se está preparando"
        message={`El contrato ya fue creado correctamente.\n\nEl PDF todavía se está generando automáticamente en segundo plano.\n\nIntenta nuevamente en unos momentos.`}
        confirmText="Aceptar"
        showCancel={false}
      />

      <ConfirmModal
        isOpen={draftToDelete !== null}
        onCancel={closeDeleteDraftModal}
        onConfirm={() => void confirmDeleteDraft()}
        title="Confirmar eliminacion de borrador"
        message={
          draftToDelete
            ? `Vas a eliminar el borrador ${draftToDelete.contractNumber}${draftToDelete.clientFullName && draftToDelete.clientFullName !== "-" ? ` de ${draftToDelete.clientFullName}` : ""}. Esta accion no se puede deshacer.`
            : ""
        }
        confirmText="Eliminar borrador"
        cancelText="Cancelar"
        confirmVariant="danger"
      />

      <ToastNotification toasts={toasts} onDismiss={dismissToast} />

      {/* Visor de Attachments con Zoom */}
      {attachmentViewerData && (
        <AttachmentViewer
          attachments={attachmentViewerData.attachments}
          initialIndex={attachmentViewerData.initialIndex}
          onClose={() => setAttachmentViewerData(null)}
        />
      )}
    </main>
  );
}

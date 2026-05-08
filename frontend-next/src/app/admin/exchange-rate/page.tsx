"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, getHomeRouteForRole } from "@/lib/auth-api";
import {
  getCurrentExchangeRate,
  getExchangeRateHistory,
  getExchangeRateHistoryRange,
  downloadExchangeRateHistoryPdf,
  emailExchangeRateHistory,
  setExchangeRate,
  type ExchangeRate,
} from "@/lib/exchange-rate-api";
import { ToastNotification, useToast } from "@/components/toast-notification";
import { PageLoader } from "@/components/loading-spinner";

export default function AdminExchangeRatePage() {
  const router = useRouter();
  const session = getStoredSession();
  const role = String(session?.user?.role || "").toUpperCase();
  const canEdit = role === "ADMIN"; // Solo ADMIN puede editar

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentRate, setCurrentRate] = useState<ExchangeRate | null>(null);
  const [history, setHistory] = useState<ExchangeRate[]>([]);
  const { toasts, showSuccess, showError, dismissToast } = useToast();

  const [date, setDate] = useState("");
  const [buyRate, setBuyRate] = useState("");
  const [sellRate, setSellRate] = useState("");
  const [notes, setNotes] = useState("");

  // Filter states
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filtering, setFiltering] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Email modal states
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!session?.user?.id) {
      router.replace("/");
      return;
    }

    const role = String(session.user.role || "").toUpperCase();
    if (role !== "ADMIN" && role !== "FACTURACION_COBROS" && role !== "CONTADOR") {
      router.replace(getHomeRouteForRole(role));
      return;
    }

    // Set today's date as default (Costa Rica time)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    setDate(todayStr);

    // Set filter dates: 1 month ago to today
    const oneMonthAgo = new Date(today);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const startYear = oneMonthAgo.getFullYear();
    const startMonth = String(oneMonthAgo.getMonth() + 1).padStart(2, '0');
    const startDay = String(oneMonthAgo.getDate()).padStart(2, '0');
    const oneMonthAgoStr = `${startYear}-${startMonth}-${startDay}`;

    setFilterStartDate(oneMonthAgoStr);
    setFilterEndDate(todayStr);
    setEmailRecipient(""); // Campo vacío para ingreso manual

    loadData(oneMonthAgoStr, todayStr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh for non-admin users every 30 seconds
  useEffect(() => {
    if (!canEdit && filterStartDate && filterEndDate) {
      const interval = setInterval(() => {
        // Only refresh if page is visible
        if (document.visibilityState === 'visible') {
          loadData(filterStartDate, filterEndDate);
        }
      }, 30000); // 30 seconds

      return () => clearInterval(interval);
    }
  }, [canEdit, filterStartDate, filterEndDate]);

  // Auto-refresh for non-admin users every 30 seconds
  useEffect(() => {
    if (!canEdit && filterStartDate && filterEndDate) {
      const interval = setInterval(() => {
        // Only refresh if page is visible
        if (document.visibilityState === 'visible') {
          loadData(filterStartDate, filterEndDate);
        }
      }, 30000); // 30 seconds

      return () => clearInterval(interval);
    }
  }, [canEdit, filterStartDate, filterEndDate]);

  // Auto-focus email input when modal opens
  useEffect(() => {
    if (showEmailModal && emailInputRef.current) {
      emailInputRef.current.focus();
    }
  }, [showEmailModal]);

  const loadData = async (startDate?: string, endDate?: string) => {
    try {
      setLoading(true);

      const start = startDate || filterStartDate;
      const end = endDate || filterEndDate;

      const [current, hist] = await Promise.all([
        getCurrentExchangeRate(),
        start && end ? getExchangeRateHistoryRange(start, end) : getExchangeRateHistory(30),
      ]);

      setCurrentRate(current);
      setHistory(hist);

      // Pre-populate form with today's rate if it exists
      if (current) {
        setBuyRate(current.buyRate.toString());
        setSellRate(current.sellRate.toString());
        setNotes(current.notes || "");
      }
    } catch (err: any) {
      showError(err.message || "Error cargando datos");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const buy = parseFloat(buyRate);
    const sell = parseFloat(sellRate);

    if (!date) {
      showError("Debe seleccionar una fecha");
      return;
    }

    if (isNaN(buy) || buy <= 0) {
      showError("El tipo de cambio de compra debe ser mayor a 0");
      return;
    }

    if (isNaN(sell) || sell <= 0) {
      showError("El tipo de cambio de venta debe ser mayor a 0");
      return;
    }

    if (sell < buy) {
      showError("El tipo de cambio de venta debe ser mayor o igual al de compra");
      return;
    }

    try {
      setSaving(true);
      await setExchangeRate({
        date,
        buyRate: buy,
        sellRate: sell,
        notes: notes.trim() || undefined,
      });

      showSuccess("Tipo de cambio guardado exitosamente");
      await loadData();

      // Reset form
      const today = new Date().toISOString().split("T")[0];
      setDate(today);
      setBuyRate("");
      setSellRate("");
      setNotes("");
    } catch (err: any) {
      showError(err.message || "Error guardando tipo de cambio");
    } finally {
      setSaving(false);
    }
  };

  const handleFilter = async () => {
    if (!filterStartDate || !filterEndDate) {
      showError("Debe seleccionar ambas fechas");
      return;
    }

    if (filterStartDate > filterEndDate) {
      showError("La fecha inicial debe ser menor o igual a la fecha final");
      return;
    }

    setFiltering(true);
    try {
      await loadData(filterStartDate, filterEndDate);
    } catch (err: any) {
      showError(err.message || "Error filtrando historial");
    } finally {
      setFiltering(false);
    }
  };

  const handleExportPdf = async () => {
    if (!filterStartDate || !filterEndDate) {
      showError("Debe seleccionar ambas fechas para exportar");
      return;
    }

    setExporting(true);
    try {
      const blob = await downloadExchangeRateHistoryPdf(filterStartDate, filterEndDate);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `historial-tipo-cambio-${filterStartDate}-${filterEndDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showSuccess("PDF descargado exitosamente");
    } catch (err: any) {
      showError(err.message || "Error exportando PDF");
    } finally {
      setExporting(false);
    }
  };

  const handleCloseModal = () => {
    setShowEmailModal(false);
    setEmailRecipient(""); // Limpiar campo al cerrar
  };

  const handleSendEmail = async () => {
    if (!filterStartDate || !filterEndDate) {
      showError("Debe seleccionar ambas fechas");
      return;
    }

    if (!emailRecipient || !emailRecipient.includes("@")) {
    

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  };  showError("Debe ingresar un correo válido");
      return;
    }

    setSendingEmail(true);
    try {
      await emailExchangeRateHistory(filterStartDate, filterEndDate, emailRecipient);
      showSuccess("Historial enviado por correo exitosamente");
      setShowEmailModal(false);
      setEmailRecipient(""); // Limpiar campo para próximo envío
    } catch (err: any) {
      showError(err.message || "Error enviando correo");
    } finally {
      setSendingEmail(false);
    }
  };

  const formatDate = (dateStr: string) => {
    // Parse date as local time to avoid timezone conversion issues
    const [year, month, day] = dateStr.split('T')[0].split('-');
    return `${day}/${month}/${year}`;
  };

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <main className="app-shell">
      <div style={{ marginBottom: 30 }}>
        <h1 style={{ marginBottom: 8, fontSize: "1.8rem", fontWeight: 600 }}>💱 Tipo de Cambio USD/CRC</h1>
        <p style={{ color: "#6b7280", margin: 0 }}>Configura el tipo de cambio diario para conversiones de moneda</p>
      </div>

      {/* TC Actual - Card destacada */}
      <section style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        borderRadius: 12,
        padding: 30,
        marginBottom: 30,
        color: "white",
        boxShadow: "0 4px 20px rgba(102, 126, 234, 0.3)"
      }}>
        <h2 style={{ margin: "0 0 20px 0", fontSize: "1.3rem", fontWeight: 600 }}>📊 Tipo de Cambio Vigente</h2>
        {currentRate ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 20 }}>
            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: 16, backdropFilter: "blur(10px)" }}>
              <div style={{ fontSize: "0.85rem", opacity: 0.9, marginBottom: 6 }}>📅 Fecha</div>
              <div style={{ fontSize: "1.3rem", fontWeight: "bold" }}>{formatDate(currentRate.date)}</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: 16, backdropFilter: "blur(10px)" }}>
              <div style={{ fontSize: "0.85rem", opacity: 0.9, marginBottom: 6 }}>💰 TC Compra</div>
              <div style={{ fontSize: "1.3rem", fontWeight: "bold" }}>₡{currentRate.buyRate.toFixed(4)}</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: 16, backdropFilter: "blur(10px)" }}>
              <div style={{ fontSize: "0.85rem", opacity: 0.9, marginBottom: 6 }}>💵 TC Venta</div>
              <div style={{ fontSize: "1.3rem", fontWeight: "bold" }}>₡{currentRate.sellRate.toFixed(4)}</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: 16, backdropFilter: "blur(10px)" }}>
              <div style={{ fontSize: "0.85rem", opacity: 0.9, marginBottom: 6 }}>👤 Configurado por</div>
              <div style={{ fontSize: "1.1rem", fontWeight: "600" }}>{currentRate.setByName}</div>
            </div>
          </div>
        ) : (
          <div style={{ background: "rgba(239, 68, 68, 0.2)", borderRadius: 8, padding: 16, border: "1px solid rgba(239, 68, 68, 0.4)" }}>
            ⚠️ No hay tipo de cambio configurado para hoy
          </div>
        )}
      </section>

      {/* Formulario - Card blanca (solo ADMIN) */}
      {canEdit && (
        <section style={{ background: "white", borderRadius: 12, padding: 30, marginBottom: 30, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h2 style={{ margin: "0 0 6px 0", fontSize: "1.3rem", fontWeight: 600 }}>✏️ Configurar Tipo de Cambio</h2>
          <p style={{ color: "#6b7280", marginBottom: 24, fontSize: "0.9rem" }}>Establece o actualiza el tipo de cambio para una fecha específica</p>

          <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 20 }}>
            <div className="form-group">
              <label htmlFor="date" style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>📅 Fecha</label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                style={{ width: "100%", padding: "10px 12px", fontSize: "1rem" }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="buyRate" style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>💰 TC Compra (₡)</label>
              <input
                id="buyRate"
                type="number"
                step="0.0001"
                min="0"
                value={buyRate}
                onChange={(e) => setBuyRate(e.target.value)}
                placeholder="520.5000"
                required
                style={{ width: "100%", padding: "10px 12px", fontSize: "1rem" }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="sellRate" style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>💵 TC Venta (₡)</label>
              <input
                id="sellRate"
                type="number"
                step="0.0001"
                min="0"
                value={sellRate}
                onChange={(e) => setSellRate(e.target.value)}
                placeholder="530.2500"
                required
                style={{ width: "100%", padding: "10px 12px", fontSize: "1rem" }}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 24 }}>
            <label htmlFor="notes" style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>📝 Notas (opcional)</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ejemplo: Fuente: BCCR, actualizado manualmente"
              rows={3}
              style={{ width: "100%", padding: "10px 12px", fontSize: "1rem", resize: "vertical" }}
            />
          </div>

          <button 
            type="submit" 
            className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg" 
            disabled={saving}
            style={{ 
              padding: "12px 32px", 
              fontSize: "1rem",
              background: saving ? "#9ca3af" : undefined,
              cursor: saving ? "not-allowed" : "pointer"
            }}
          >
            {saving ? "⏳ Guardando..." : "💾 Guardar Tipo de Cambio"}
          </button>
        </form>
      </section>
      )}

      {/* Historial - Card blanca */}
      <section style={{ background: "white", borderRadius: 12, padding: 30, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <h2 style={{ margin: "0 0 6px 0", fontSize: "1.3rem", fontWeight: 600 }}>📜 Historial de Tipos de Cambio</h2>
        <p style={{ color: "#6b7280", marginBottom: 24, fontSize: "0.9rem" }}>Filtra por rango de fechas (default: último mes)</p>

        {/* Filters */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "1fr 1fr auto auto auto", 
          gap: 15, 
          marginBottom: 25,
          alignItems: "end"
        }}>
          <div className="form-group">
            <label htmlFor="filterStartDate" style={{ fontWeight: 500, marginBottom: 8, display: "block", fontSize: "0.9rem" }}>
              📅 Fecha Inicial
            </label>
            <input
              id="filterStartDate"
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", fontSize: "1rem" }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="filterEndDate" style={{ fontWeight: 500, marginBottom: 8, display: "block", fontSize: "0.9rem" }}>
              📅 Fecha Final
            </label>
            <input
              id="filterEndDate"
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", fontSize: "1rem" }}
            />
          </div>

          <button
            onClick={handleFilter}
            disabled={filtering || !filterStartDate || !filterEndDate}
            style={{
              padding: "10px 24px",
              fontSize: "0.95rem",
              fontWeight: 600,
              background: filtering ? "#9ca3af" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: filtering || !filterStartDate || !filterEndDate ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              opacity: filtering || !filterStartDate || !filterEndDate ? 0.6 : 1,
            }}
          >
            {filtering ? "⏳ Filtrando..." : "🔍 Filtrar"}
          </button>

          <button
            onClick={handleExportPdf}
            disabled={exporting || history.length === 0}
            style={{
              padding: "10px 24px",
              fontSize: "0.95rem",
              fontWeight: 600,
              background: exporting ? "#9ca3af" : "#10b981",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: exporting || history.length === 0 ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              opacity: exporting || history.length === 0 ? 0.6 : 1,
            }}
          >
            {exporting ? "⏳ Exportando..." : "📄 Exportar PDF"}
          </button>

          <button
            onClick={() => setShowEmailModal(true)}
            disabled={history.length === 0}
            style={{
              padding: "10px 24px",
              fontSize: "0.95rem",
              fontWeight: 600,
              background: history.length === 0 ? "#9ca3af" : "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: history.length === 0 ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              opacity: history.length === 0 ? 0.6 : 1,
            }}
          >
            📧 Enviar por Correo
          </button>
        </div>

        {/* Results count */}
        {history.length > 0 && (
          <div style={{ 
            marginBottom: 20, 
            padding: "12px 16px", 
            background: "#f3f4f6", 
            borderRadius: 8,
            fontSize: "0.9rem",
            color: "#4b5563"
          }}>
            <strong>{history.length}</strong> registro{history.length !== 1 ? 's' : ''} encontrado{history.length !== 1 ? 's' : ''} en el período seleccionado
          </div>
        )}

        {history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#9ca3af" }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>📊</div>
            <p style={{ margin: 0 }}>No hay registros en el rango seleccionado</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="exchange-rate-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f3f4f6", borderBottom: "2px solid #e5e7eb" }}>
                <tr>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>Fecha</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>TC Compra</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>TC Venta</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>Configurado por</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>Hora de Configuración</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>Notas</th>
                </tr>
              </thead>
              <tbody>
                {history.map((rate) => (
                  <tr key={rate.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "12px 16px" }}>{formatDate(rate.date)}</td>
                    <td style={{ padding: "12px 16px", color: "#10b981", fontWeight: "bold" }}>
                      ₡{rate.buyRate.toFixed(4)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#3b82f6", fontWeight: "bold" }}>
                      ₡{rate.sellRate.toFixed(4)}
                    </td>
                    <td style={{ padding: "12px 16px" }}>{rate.setByName}</td>
                    <td style={{ padding: "12px 16px", fontSize: "0.9rem", color: "#6b7280" }}>
                      {formatTimestamp(rate.createdAt)}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "0.9rem", color: "#6b7280" }}>{rate.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Email Modal */}
      {showEmailModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => !sendingEmail && handleCloseModal()}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 30,
              maxWidth: 500,
              width: "90%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 8px 0", fontSize: "1.3rem", fontWeight: 600 }}>📧 Enviar Historial por Correo</h3>
            <p style={{ color: "#6b7280", marginBottom: 24, fontSize: "0.9rem" }}>
              El PDF del historial será enviado al correo indicado
            </p>

            <div className="form-group" style={{ marginBottom: 24 }}>
              <label htmlFor="emailRecipient" style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>
                Correo electrónico
              </label>
              <input
                id="emailRecipient"
                ref={emailInputRef}
                type="email"
                value={emailRecipient}
                onChange={(e) => setEmailRecipient(e.target.value)}
                placeholder="correo@ejemplo.com"
                disabled={sendingEmail}
                style={{ width: "100%", padding: "10px 12px", fontSize: "1rem" }}
              />
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={handleCloseModal}
                disabled={sendingEmail}
                style={{
                  padding: "10px 24px",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  background: "#e5e7eb",
                  color: "#374151",
                  border: "none",
                  borderRadius: 8,
                  cursor: sendingEmail ? "not-allowed" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSendEmail}
                disabled={sendingEmail || !emailRecipient}
                style={{
                  padding: "10px 24px",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  background: sendingEmail || !emailRecipient ? "#9ca3af" : "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: sendingEmail || !emailRecipient ? "not-allowed" : "pointer",
                }}
              >
                {sendingEmail ? "⏳ Enviando..." : "✉️ Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}

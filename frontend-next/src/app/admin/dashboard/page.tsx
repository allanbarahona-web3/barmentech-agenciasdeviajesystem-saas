"use client";

import { getStoredSession, getStoredToken } from "@/lib/auth-api";
import { getBillingDashboardMetrics, type DashboardMetrics } from "@/lib/billing-api";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const formatMoney = (value: number): string => `USD ${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

const formatDate = (value: string): string => {
  try {
    const date = new Date(value);
    return date.toLocaleDateString("es-CR", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "-";
  }
};

const getTodayISO = (): string => {
  const today = new Date();
  return today.toISOString().split("T")[0];
};

const getDateDaysAgo = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
};

const PERIOD_LABELS: Record<string, string> = {
  today: "Hoy",
  week: "Última semana",
  month: "Último mes",
  year: "Último año",
  all: "Histórico completo",
  custom: "Rango personalizado",
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [mounted, setMounted] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params: { period?: string; from?: string; to?: string } = {};
      
      if (period === "custom") {
        // Usar fechas personalizadas
        if (from) params.from = from;
        if (to) params.to = to;
      } else {
        // Usar período predefinido
        params.period = period;
      }
      
      const data = await getBillingDashboardMetrics(params);
      setMetrics(data);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar el dashboard.");
    } finally {
      setLoading(false);
    }
  };

  const applyQuickRange = (range: string) => {
    setPeriod(range);
    setFrom("");
    setTo("");
  };

  const applyCustomRange = () => {
    setPeriod("custom");
  };

  useEffect(() => {
    setMounted(true);
    const token = getStoredToken();
    const role = String(getStoredSession()?.user?.role || "").toUpperCase();
    const authorized = ["ADMIN", "CONTADOR"].includes(role);
    setIsAuthorized(authorized);
    
    if (!token || !authorized) {
      router.replace("/");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, period, from, to]);

  if (!mounted || !isAuthorized) {
    return null;
  }

  return (
    <main className="app-shell">
      <section className="card contracts-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h1>📊 Dashboard de Gestión</h1>
          <button
            type="button"
            onClick={() => router.push("/settings")}
            className="btn btn-secondary"
            style={{ fontSize: "14px", padding: "8px 16px" }}
          >
            ⚙️ Configurar Empresa
          </button>
        </div>
        
        {/* Filtros de Fecha */}
        <div style={{ marginBottom: "20px", padding: "16px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", color: "#374151" }}>📅 Filtros de Período</h3>
          
          {/* Botones de rango rápido */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            <button
              type="button"
              className={period === "today" ? "btn" : "btn btn-secondary"}
              onClick={() => applyQuickRange("today")}
              style={{ fontSize: "13px", padding: "6px 12px" }}
            >
              Hoy
            </button>
            <button
              type="button"
              className={period === "week" ? "btn" : "btn btn-secondary"}
              onClick={() => applyQuickRange("week")}
              style={{ fontSize: "13px", padding: "6px 12px" }}
            >
              Última Semana
            </button>
            <button
              type="button"
              className={period === "month" ? "btn" : "btn btn-secondary"}
              onClick={() => applyQuickRange("month")}
              style={{ fontSize: "13px", padding: "6px 12px" }}
            >
              Último Mes
            </button>
            <button
              type="button"
              className={period === "year" ? "btn" : "btn btn-secondary"}
              onClick={() => applyQuickRange("year")}
              style={{ fontSize: "13px", padding: "6px 12px" }}
            >
              Último Año
            </button>
            <button
              type="button"
              className={period === "all" ? "btn" : "btn btn-secondary"}
              onClick={() => applyQuickRange("all")}
              style={{ fontSize: "13px", padding: "6px 12px" }}
            >
              Todo
            </button>
          </div>

          {/* Rango personalizado */}
          <div className="contracts-grid" style={{ marginTop: "8px" }}>
            <label style={{ fontSize: "13px" }}>
              Desde
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  applyCustomRange();
                }}
                style={{ fontSize: "13px" }}
              />
            </label>
            <label style={{ fontSize: "13px" }}>
              Hasta
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  applyCustomRange();
                }}
                style={{ fontSize: "13px" }}
              />
            </label>
          </div>

          <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "8px" }}>
            📌 Mostrando: <strong>{PERIOD_LABELS[period] || "Personalizado"}</strong>
            {period === "custom" && from && to ? ` (${from} - ${to})` : ""}
          </p>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        {loading ? (
          <p className="m-0 text-[#4b6790] text-sm">Cargando métricas...</p>
        ) : metrics ? (
          <>
            {/* KPIs Principales */}
            <section style={{ marginBottom: "24px" }}>
              <h2 style={{ fontSize: "18px", marginBottom: "12px", color: "#374151" }}>Resumen {PERIOD_LABELS[period]}</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                <article className="billing-kpi" style={{ background: "#ecfdf5", border: "1px solid #10b981" }}>
                  <span>Facturado</span>
                  <strong style={{ color: "#059669" }}>{formatMoney(metrics.summary.period.invoicedAmount)}</strong>
                  <small style={{ fontSize: "12px", color: "#6b7280" }}>{metrics.summary.period.invoicesCount} facturas</small>
                </article>

                <article className="billing-kpi" style={{ background: "#dbeafe", border: "1px solid #3b82f6" }}>
                  <span>Cobrado</span>
                  <strong style={{ color: "#2563eb" }}>{formatMoney(metrics.summary.period.collectedAmount)}</strong>
                  <small style={{ fontSize: "12px", color: "#6b7280" }}>{metrics.summary.period.paymentsCount} pagos</small>
                </article>

                <article className="billing-kpi" style={{ background: "#fee2e2", border: "1px solid #ef4444" }}>
                  <span>Saldo Pendiente</span>
                  <strong style={{ color: "#dc2626" }}>{formatMoney(metrics.summary.period.balanceAmount)}</strong>
                </article>

                <article className="billing-kpi" style={{ background: "#fef3c7", border: "1px solid #f59e0b" }}>
                  <span>Tareas Pendientes</span>
                  <strong style={{ color: "#d97706" }}>{metrics.summary.pendingTasks.total}</strong>
                  <small style={{ fontSize: "12px", color: "#6b7280" }}>
                    {metrics.summary.pendingTasks.payments} pagos, {metrics.summary.pendingTasks.receipts} recibos, {metrics.summary.pendingTasks.creditNotes} NC
                  </small>
                </article>
              </div>
            </section>

            {/* Alertas - Cuentas Vencidas */}
            {metrics.summary.invoices.overdue > 0 ? (
              <section style={{ marginBottom: "24px", padding: "16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px" }}>
                <h3 style={{ fontSize: "16px", color: "#dc2626", marginBottom: "8px" }}>⚠️ {metrics.summary.invoices.overdue} Cuentas Vencidas</h3>
                <button
                  type="button"
                  className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                  onClick={() => router.push("/billing?status=FACTURA_VENCIDA")}
                  style={{ marginTop: "8px" }}
                >
                  Ver cuentas vencidas
                </button>
              </section>
            ) : null}

            {/* Tareas Pendientes */}
            {metrics.summary.pendingTasks.total > 0 ? (
              <section style={{ marginBottom: "24px" }}>
                <h2 style={{ fontSize: "18px", marginBottom: "12px", color: "#374151" }}>📝 Tareas Pendientes</h2>
                <div style={{ display: "grid", gap: "12px" }}>
                  {metrics.summary.pendingTasks.payments > 0 ? (
                    <article style={{ padding: "12px", background: "#fffbeb", border: "1px solid #fbbf24", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <strong style={{ color: "#d97706" }}>{metrics.summary.pendingTasks.payments} Pagos por verificar</strong>
                        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b7280" }}>Requieren revisión bancaria</p>
                      </div>
                      <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none" onClick={() => router.push("/admin/pending-payments")}>
                        Revisar
                      </button>
                    </article>
                  ) : null}

                  {metrics.summary.pendingTasks.receipts > 0 ? (
                    <article style={{ padding: "12px", background: "#eff6ff", border: "1px solid #60a5fa", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <strong style={{ color: "#2563eb" }}>{metrics.summary.pendingTasks.receipts} Recibos por enviar</strong>
                        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b7280" }}>Listos para aprobar y enviar al cliente</p>
                      </div>
                      <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none" onClick={() => router.push("/admin/pending-receipts")}>
                        Ver recibos
                      </button>
                    </article>
                  ) : null}

                  {metrics.summary.pendingTasks.creditNotes > 0 ? (
                    <article style={{ padding: "12px", background: "#f0fdf4", border: "1px solid #4ade80", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <strong style={{ color: "#16a34a" }}>{metrics.summary.pendingTasks.creditNotes} Notas de Crédito por aprobar</strong>
                        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b7280" }}>Requieren aprobación administrativa</p>
                      </div>
                      <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none" onClick={() => router.push("/admin/pending-credit-notes")}>
                        Aprobar
                      </button>
                    </article>
                  ) : null}
                </div>
              </section>
            ) : null}

            {/* Estados de Factura */}
            <section style={{ marginBottom: "24px" }}>
              <h2 style={{ fontSize: "18px", marginBottom: "12px", color: "#374151" }}>📄 Estados de Cuenta</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                {metrics.summary.invoices.byStatus.map((item) => (
                  <div key={item.status} style={{ padding: "12px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "6px", textAlign: "center" }}>
                    <div style={{ fontSize: "24px", fontWeight: "700", color: "#1f2937" }}>{item.count}</div>
                    <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>{item.status.replace("FACTURA_", "")}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Gráfico de Cobros Diarios */}
            {metrics.charts.dailyPayments.length > 0 ? (
              <section style={{ marginBottom: "24px" }}>
                <h2 style={{ fontSize: "18px", marginBottom: "12px", color: "#374151" }}>📈 Cobros Diarios (Últimos 30 días)</h2>
                <div style={{ overflowX: "auto" }}>
                  <div style={{ display: "flex", gap: "4px", alignItems: "flex-end", minHeight: "200px", padding: "20px", background: "#f9fafb", borderRadius: "8px", minWidth: "800px" }}>
                    {metrics.charts.dailyPayments.map((day, idx) => {
                      const maxAmount = Math.max(...metrics.charts.dailyPayments.map((d) => d.total));
                      const height = maxAmount > 0 ? (day.total / maxAmount) * 150 : 0;

                      return (
                        <div key={idx} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px", fontWeight: "600" }}>{formatMoney(day.total)}</div>
                          <div
                            style={{
                              width: "100%",
                              height: `${height}px`,
                              background: "linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)",
                              borderRadius: "4px 4px 0 0",
                              transition: "all 0.3s",
                            }}
                            title={`${day.count} pagos - ${formatMoney(day.total)}`}
                          />
                          <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "4px" }}>{formatDate(day.day).split(" ")[0]}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            ) : null}

            {/* Top Clientes con Morosidad */}
            {metrics.alerts.topOverdueClients.length > 0 ? (
              <section>
                <h2 style={{ fontSize: "18px", marginBottom: "12px", color: "#374151" }}>🚨 Clientes con Mayor Morosidad</h2>
                <div className="history-table-wrap">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Email</th>
                        <th>Facturas</th>
                        <th>Saldo Vencido</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.alerts.topOverdueClients.map((client) => (
                        <tr key={client.id}>
                          <td>{client.fullName}</td>
                          <td>{client.email}</td>
                          <td>{client.invoiceCount}</td>
                          <td>
                            <strong style={{ color: "#dc2626" }}>{formatMoney(client.totalBalance)}</strong>
                          </td>
                          <td>
                            <button type="button" className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none" onClick={() => router.push(`/billing?q=${encodeURIComponent(client.email)}`)}>
                              Ver cuentas
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}

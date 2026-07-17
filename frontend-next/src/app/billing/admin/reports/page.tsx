"use client";

export const dynamic = 'force-dynamic';

import { getStoredSession, getStoredToken } from "@/lib/auth-api";
import { getBillingAdminReports, type BillingAdminReportData } from "@/lib/billing-api";
import { ToastNotification, useToast } from "@/components/toast-notification";
import { PageLoader } from "@/components/loading-spinner";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatBusinessDate } from "@/shared/regional";

const formatMoney = (value: number) => `USD ${Number.isFinite(value) ? value.toFixed(2) : "0.00"}`;

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

const getTodayISO = (): string => {
  const today = new Date();
  return today.toISOString().split("T")[0];
};

const getDateDaysAgo = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
};

const getStartOfYear = (): string => {
  const date = new Date();
  date.setMonth(0, 1);
  return date.toISOString().split("T")[0];
};

export default function AdminReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [data, setData] = useState<BillingAdminReportData | null>(null);
  const { toasts, showSuccess, showError, dismissToast } = useToast();

  const applyQuickRange = (range: "today" | "week" | "month" | "year" | "all") => {
    const today = getTodayISO();
    
    switch (range) {
      case "today":
        setFrom(today);
        setTo(today);
        break;
      case "week":
        setFrom(getDateDaysAgo(7));
        setTo(today);
        break;
      case "month":
        setFrom(getDateDaysAgo(30));
        setTo(today);
        break;
      case "year":
        setFrom(getStartOfYear());
        setTo(today);
        break;
      case "all":
        setFrom("");
        setTo("");
        break;
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const result = await getBillingAdminReports({
        from: from || undefined,
        to: to || undefined,
        q: q.trim() || undefined,
        invoiceStatus: invoiceStatus || undefined,
        paymentStatus: paymentStatus || undefined,
        limitInvoices: 400,
        limitPayments: 900,
      });
      setData(result);
      showSuccess("Reporte actualizado correctamente.");
    } catch (fetchError) {
      showError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar reporte.");
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

    const session = getStoredSession();
    const role = String(session?.user?.role || "").toUpperCase();
    if (!["ADMIN", "CONTADOR"].includes(role)) {
      router.replace("/billing");
      return;
    }

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <main className="app-shell">
      {loading && data === null ? (
        <PageLoader />
      ) : (
        <section className="card contracts-card">
          <h1>Reportes Contables</h1>
          <p className="m-0 text-[#4b6790] text-sm">Vista para revisión interna y envío manual al contador.</p>

        {/* Botones de Rango Rápido */}
        <div style={{ marginTop: "16px", marginBottom: "12px", padding: "12px", background: "#f9fafb", borderRadius: "6px", border: "1px solid #e5e7eb" }}>
          <p style={{ fontSize: "13px", fontWeight: "600", marginBottom: "8px", color: "#374151" }}>📅 Rangos rápidos:</p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
              onClick={() => applyQuickRange("today")}
              style={{ fontSize: "13px", padding: "6px 12px" }}
            >
              Hoy
            </button>
            <button
              type="button"
              className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
              onClick={() => applyQuickRange("week")}
              style={{ fontSize: "13px", padding: "6px 12px" }}
            >
              Última semana (7 días)
            </button>
            <button
              type="button"
              className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
              onClick={() => applyQuickRange("month")}
              style={{ fontSize: "13px", padding: "6px 12px" }}
            >
              Último mes (30 días)
            </button>
            <button
              type="button"
              className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
              onClick={() => applyQuickRange("year")}
              style={{ fontSize: "13px", padding: "6px 12px" }}
            >
              Este año
            </button>
            <button
              type="button"
              className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
              onClick={() => applyQuickRange("all")}
              style={{ fontSize: "13px", padding: "6px 12px" }}
            >
              Todo (sin filtro)
            </button>
          </div>
        </div>

        <div className="contracts-grid" style={{ marginTop: 12 }}>
          <label>
            Fecha desde
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>

          <label>
            Fecha hasta
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>

          <label>
            Buscar
            <input
              value={q}
              placeholder="Cliente, contrato, estado de cuenta, referencia"
              onChange={(event) => setQ(event.target.value)}
            />
          </label>

          <label>
            Estado factura
            <select value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value)}>
              <option value="">Todos</option>
              <option value="FACTURA_EMITIDA">FACTURA_EMITIDA</option>
              <option value="FACTURA_PARCIAL">FACTURA_PARCIAL</option>
              <option value="FACTURA_PAGADA">FACTURA_PAGADA</option>
              <option value="FACTURA_VENCIDA">FACTURA_VENCIDA</option>
              <option value="FACTURA_ANULADA">FACTURA_ANULADA</option>
            </select>
          </label>

          <label>
            Estado abono
            <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}>
              <option value="">Todos</option>
              <option value="ABONO_REPORTADO">ABONO_REPORTADO</option>
              <option value="ABONO_EN_REVISION">ABONO_EN_REVISION</option>
              <option value="ABONO_VERIFICADO">ABONO_VERIFICADO</option>
              <option value="ABONO_RECHAZADO">ABONO_RECHAZADO</option>
            </select>
          </label>
        </div>

        <div className="actions">
          <button type="button" className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg" onClick={() => void load()} disabled={loading}>
            {loading ? "Cargando..." : "Actualizar reporte"}
          </button>
        </div>

        {data ? (
          <>
            <div className="contracts-grid" style={{ marginTop: 14 }}>
              <label>
                Facturas (cantidad)
                <input value={String(data.summary.sales.invoicesCount)} readOnly />
              </label>
              <label>
                Total facturado
                <input value={formatMoney(data.summary.sales.totalInvoicedAmount)} readOnly />
              </label>
              <label>
                NC aplicadas
                <input value={formatMoney(data.summary.sales.totalCreditNotesAppliedAmount || 0)} readOnly />
              </label>
              <label>
                Total verificado
                <input value={formatMoney(data.summary.sales.totalVerifiedAmount)} readOnly />
              </label>
              <label>
                Total pendiente
                <input value={formatMoney(data.summary.sales.totalPendingAmount)} readOnly />
              </label>
              <label>
                Saldo total
                <input value={formatMoney(data.summary.sales.totalBalanceAmount)} readOnly />
              </label>
              <label>
                Facturas vencidas
                <input value={String(data.summary.sales.overdueInvoicesCount || 0)} readOnly />
              </label>
              <label>
                Saldo vencido
                <input value={formatMoney(data.summary.sales.overdueBalanceAmount || 0)} readOnly />
              </label>
              <label>
                Abonos (cantidad)
                <input value={String(data.summary.collections.paymentsCount)} readOnly />
              </label>
              <label>
                Total abonos reportados
                <input value={formatMoney(data.summary.collections.totalPaymentsAmount)} readOnly />
              </label>
            </div>

            <h2 className="my-6 mb-2 text-sm tracking-wider uppercase text-[#2a4b77]">Facturas</h2>
            <div className="history-table-wrap" style={{ marginTop: 10 }}>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Factura</th>
                    <th>Estado</th>
                    <th>Vence</th>
                    <th>Dias vencida</th>
                    <th>Facturado bruto</th>
                    <th>NC aplicada</th>
                    <th>Total</th>
                    <th>Verificado</th>
                    <th>Pendiente</th>
                    <th>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.length === 0 ? (
                    <tr>
                      <td colSpan={12}><p className="history-empty">Sin facturas para los filtros.</p></td>
                    </tr>
                  ) : null}
                  {data.invoices.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDateTime(item.issuedAt)}</td>
                      <td>
                        <div className="history-col-name">{item.client.fullName}</div>
                        <div className="history-col-muted">{item.client.idNumber}</div>
                      </td>
                      <td>{item.invoiceNumber}</td>
                      <td>
                        <span className={`contract-status ${item.status === "FACTURA_PAGADA" ? "status-signed" : item.status === "FACTURA_VENCIDA" ? "status-overdue" : "status-pending"}`}>
                          {item.status}
                        </span>
                      </td>
                      <td>{formatBusinessDate(item.paymentDueDate || "")}</td>
                      <td>{item.overdueDays || 0}</td>
                      <td>{formatMoney(item.amounts.grossInvoiced || item.amounts.total)}</td>
                      <td>{formatMoney(item.amounts.creditNotesApplied || 0)}</td>
                      <td>{formatMoney(item.amounts.total)}</td>
                      <td>{formatMoney(item.amounts.verified)}</td>
                      <td>{formatMoney(item.amounts.pending)}</td>
                      <td>{formatMoney(item.amounts.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="my-6 mb-2 text-sm tracking-wider uppercase text-[#2a4b77]">Alertas de Vencimiento</h2>
            <div className="history-table-wrap" style={{ marginTop: 10 }}>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Factura</th>
                    <th>Cliente</th>
                    <th>Fecha vencimiento</th>
                    <th>Dias vencida</th>
                    <th>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.overdueAlerts || []).length === 0 ? (
                    <tr>
                      <td colSpan={5}><p className="history-empty">Sin facturas vencidas en los filtros.</p></td>
                    </tr>
                  ) : null}
                  {(data.overdueAlerts || []).map((item) => (
                    <tr key={item.invoiceId}>
                      <td>{item.invoiceNumber}</td>
                      <td>
                        <div className="history-col-name">{item.client.fullName}</div>
                        <div className="history-col-muted">{item.client.idNumber}</div>
                      </td>
                      <td>{formatBusinessDate(item.dueDate || "")}</td>
                      <td>{item.overdueDays}</td>
                      <td>{formatMoney(item.balanceAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="my-6 mb-2 text-sm tracking-wider uppercase text-[#2a4b77]">Abonos</h2>
            <div className="history-table-wrap" style={{ marginTop: 10 }}>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Factura</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Monto</th>
                    <th>Referencia</th>
                    <th>Registrado por</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.length === 0 ? (
                    <tr>
                      <td colSpan={8}><p className="history-empty">Sin abonos para los filtros.</p></td>
                    </tr>
                  ) : null}
                  {data.payments.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDateTime(item.reportedAt)}</td>
                      <td>
                        <div className="history-col-name">{item.client.fullName}</div>
                        <div className="history-col-muted">{item.client.idNumber}</div>
                      </td>
                      <td>{item.invoice.invoiceNumber}</td>
                      <td>{item.type}</td>
                      <td>{item.status}</td>
                      <td>{formatMoney(item.amount)}</td>
                      <td>{item.bankReference || "-"}</td>
                      <td>{item.createdByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
      )}

      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}

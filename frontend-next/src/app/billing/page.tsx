"use client";

export const dynamic = 'force-dynamic';

import { getStoredToken } from "@/lib/auth-api";
import { listBillingContracts, type BillingListItem } from "@/lib/billing-api";
import { ToastNotification, useToast } from "@/components/toast-notification";
import { PageLoader } from "@/components/loading-spinner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const formatMoney = (value: number) => `USD ${Number.isFinite(value) ? value.toFixed(2) : "0.00"}`;

const formatDate = (value?: string | null): string => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-CR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

export default function BillingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  
  // Cargar filtros desde localStorage
  const [query, setQuery] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("billing_filter_query") || "";
    }
    return "";
  });
  const [status, setStatus] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("billing_filter_status") || "";
    }
    return "";
  });
  const [dateFilter, setDateFilter] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("billing_filter_dateFilter") || "";
    }
    return "";
  });
  const [dateFrom, setDateFrom] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("billing_filter_dateFrom") || "";
    }
    return "";
  });
  const [dateTo, setDateTo] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("billing_filter_dateTo") || "";
    }
    return "";
  });
  
  const [items, setItems] = useState<BillingListItem[]>([]);
  const { toasts, showError, dismissToast } = useToast();

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
      
      const list = await listBillingContracts(params);
      setItems(list);
    } catch (fetchError) {
      showError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar estados de cuenta.");
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

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Guardar filtros en localStorage y debounce search
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("billing_filter_query", query);
      localStorage.setItem("billing_filter_status", status);
      localStorage.setItem("billing_filter_dateFilter", dateFilter);
      localStorage.setItem("billing_filter_dateFrom", dateFrom);
      localStorage.setItem("billing_filter_dateTo", dateTo);
    }

    const timer = setTimeout(() => {
      void load();
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, dateFilter, dateFrom, dateTo]);

  if (loading && items.length === 0) {
    return (
      <main className="app-shell">
        <PageLoader message="Cargando estados de cuenta..." />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
      
      <section className="card contracts-card">
        <h1>Estados de cuenta</h1>
        <p className="m-0 text-[#4b6790] text-sm">Panel operativo de estados de cuenta por contrato, pagos reportados y saldos pendientes.</p>

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
              <option value="FACTURA_EMITIDA">Emitida</option>
              <option value="FACTURA_PARCIAL">Parcial</option>
              <option value="FACTURA_PAGADA">Pagada</option>
              <option value="FACTURA_VENCIDA">Vencida</option>
              <option value="FACTURA_ANULADA">Anulada</option>
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

          <div className="actions" style={{ alignItems: "flex-end", marginTop: 22 }}>
            <button type="button" className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg" onClick={() => void load()} disabled={loading}>
              {loading ? "Buscando..." : "Aplicar filtros"}
            </button>
          </div>
        </div>

        <div className="history-table-wrap" style={{ marginTop: 14 }}>
          <table className="history-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contrato</th>
                <th>Estado</th>
                <th>Vence</th>
                <th>Total</th>
                <th>Pendiente</th>
                <th>Saldo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state" style={{ padding: "40px 20px" }}>
                      <div className="empty-state-icon" style={{ fontSize: "48px", marginBottom: "12px" }}>💰</div>
                      <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>No hay estados de cuenta</h3>
                      <p className="m-0 text-[#4b6790] text-sm" style={{ margin: 0 }}>
                        {query || status || dateFilter ? "No se encontraron resultados con los filtros aplicados." : "Los estados de cuenta aparecerán aquí automáticamente al firmar contratos."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : null}

              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="history-col-name">{item.client.fullName}</div>
                    <div className="history-col-muted">{item.client.idNumber} - {item.client.email}</div>
                  </td>
                  <td>{item.invoiceNumber}</td>
                  <td>
                    <span className={`contract-status ${item.status === "FACTURA_PAGADA" ? "status-signed" : item.status === "FACTURA_VENCIDA" ? "status-overdue" : "status-pending"}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>
                    <div>{formatDate(item.paymentDueDate)}</div>
                    {item.isOverdue ? <div className="history-col-muted">{item.overdueDays} dia(s) vencida</div> : null}
                  </td>
                  <td>{formatMoney(item.amounts.total)}</td>
                  <td>{formatMoney(item.amounts.pending)}</td>
                  <td>{formatMoney(item.amounts.balance)}</td>
                  <td>
                    <Link href={`/billing/${encodeURIComponent(item.contractId)}`} className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 no-underline inline-flex items-center justify-center">
                      Abrir cuenta
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

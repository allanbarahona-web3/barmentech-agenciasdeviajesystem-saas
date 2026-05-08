"use client";

export const dynamic = 'force-dynamic';

import { getStoredSession, getStoredToken } from "@/lib/auth-api";
import { listBillingAudit, type BillingAuditItem } from "@/lib/billing-api";
import { ToastNotification, useToast } from "@/components/toast-notification";
import { PageLoader } from "@/components/loading-spinner";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-CR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export default function BillingAuditPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [entityType, setEntityType] = useState("");
  const [contractId, setContractId] = useState("");
  const [items, setItems] = useState<BillingAuditItem[]>([]);
  const { toasts, showError, dismissToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const result = await listBillingAudit({
        q: q.trim() || undefined,
        entityType: entityType.trim() || undefined,
        contractId: contractId.trim() || undefined,
        limit: 160,
      });
      setItems(result);
    } catch (fetchError) {
      showError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar auditoria.");
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
    if (role !== "ADMIN") {
      router.replace("/billing");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <main className="app-shell">
      {loading && items.length === 0 ? (
        <PageLoader />
      ) : (
        <section className="card contracts-card">
          <h1>Auditoria de Estados de Cuenta</h1>
          <p className="m-0 text-[#4b6790] text-sm">Todos los eventos de estados de cuenta, abonos, recibos y notas de credito.</p>

        <div className="contracts-grid" style={{ marginTop: 12 }}>
          <label>
            Buscar
            <input
              value={q}
              placeholder="Actor, accion, tipo entidad, ID"
              onChange={(event) => setQ(event.target.value)}
            />
          </label>

          <label>
            Tipo entidad
            <select value={entityType} onChange={(event) => setEntityType(event.target.value)}>
              <option value="">Todos</option>
              <option value="INVOICE">INVOICE</option>
              <option value="PAYMENT">PAYMENT</option>
              <option value="RECEIPT">RECEIPT</option>
              <option value="CREDIT_NOTE">CREDIT_NOTE</option>
            </select>
          </label>

          <label>
            Contract ID (opcional)
            <input
              value={contractId}
              placeholder="Filtrar por contrato"
              onChange={(event) => setContractId(event.target.value)}
            />
          </label>
        </div>

        <div className="actions">
          <button type="button" className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg" onClick={() => void load()} disabled={loading}>
            {loading ? "Cargando..." : "Aplicar filtros"}
          </button>
        </div>

        <div className="history-table-wrap" style={{ marginTop: 14 }}>
          <table className="history-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Entidad</th>
                <th>Accion</th>
                <th>Actor</th>
                <th>IP</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <p className="history-empty">No hay eventos para los filtros indicados.</p>
                  </td>
                </tr>
              ) : null}

              {items.map((item) => (
                <tr key={item.id}>
                  <td>{formatDateTime(item.createdAt)}</td>
                  <td>
                    <div className="history-col-name">{item.entityType}</div>
                    <div className="history-col-muted">{item.entityId}</div>
                  </td>
                  <td>{item.action}</td>
                  <td>{item.actorName}</td>
                  <td>{item.sourceIp || "-"}</td>
                  <td>
                    <details>
                      <summary>Ver cambios</summary>
                      <pre className="json-preview">{JSON.stringify({ before: item.beforeJson, after: item.afterJson }, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}

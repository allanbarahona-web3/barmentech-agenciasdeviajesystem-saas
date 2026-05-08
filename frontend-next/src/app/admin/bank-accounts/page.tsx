"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, getHomeRouteForRole } from "@/lib/auth-api";
import {
  getAllBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  toggleBankAccountActive,
  type CompanyBankAccount,
  type CreateBankAccountInput,
} from "@/lib/bank-accounts-api";
import { ToastNotification, useToast } from "@/components/toast-notification";
import { ConfirmModal } from "@/components/confirm-modal";
import { PageLoader } from "@/components/loading-spinner";

export default function BankAccountsPage() {
  const router = useRouter();
  const session = getStoredSession();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<CompanyBankAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CompanyBankAccount | null>(null);
  const { toasts, showSuccess, showError, dismissToast } = useToast();

  // Form state
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState<"CUENTA_CORRIENTE" | "CUENTA_AHORRO">("CUENTA_CORRIENTE");
  const [currency, setCurrency] = useState<"CRC" | "USD">("CRC");
  const [sinpeNumber, setSinpeNumber] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("VIAJES LUCITOURS TURISMO INTERNACIONAL S.A.");
  const [companyName, setCompanyName] = useState("Viajes Alma Nova");
  const [notes, setNotes] = useState("");

  // Modal de confirmación
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    variant?: "primary" | "danger" | "warning";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const showConfirm = (config: Omit<typeof confirmModal, "isOpen">) => {
    setConfirmModal({ ...config, isOpen: true });
  };

  const closeConfirm = () => {
    setConfirmModal({ ...confirmModal, isOpen: false });
  };

  useEffect(() => {
    if (!session?.user?.id) {
      router.replace("/");
      return;
    }

    const role = String(session.user.role || "").toUpperCase();
    if (role !== "ADMIN") {
      router.replace(getHomeRouteForRole(role));
      return;
    }

    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const data = await getAllBankAccounts();
      setAccounts(data);
    } catch (err: any) {
      showError(err.message || "Error cargando cuentas");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setBankName("");
    setAccountNumber("");
    setAccountType("CUENTA_CORRIENTE");
    setCurrency("CRC");
    setSinpeNumber("");
    setAccountHolderName("VIAJES LUCITOURS TURISMO INTERNACIONAL S.A.");
    setCompanyName("Viajes Alma Nova");
    setNotes("");
    setEditingAccount(null);
    setShowForm(false);
  };

  const handleEdit = (account: CompanyBankAccount) => {
    setEditingAccount(account);
    setBankName(account.bankName);
    setAccountNumber(account.accountNumber);
    setAccountType(account.accountType as any);
    setCurrency(account.currency as any);
    setSinpeNumber(account.sinpeNumber || "");
    setAccountHolderName(account.accountHolderName);
    setCompanyName(account.companyName || "Viajes Alma Nova");
    setNotes(account.notes || "");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!bankName.trim()) {
      showError("El nombre del banco es requerido");
      return;
    }

    if (!accountNumber.trim()) {
      showError("El número de cuenta es requerido");
      return;
    }

    const input: CreateBankAccountInput = {
      bankName: bankName.trim(),
      accountNumber: accountNumber.trim(),
      accountType,
      currency,
      sinpeNumber: sinpeNumber.trim() || undefined,
      accountHolderName: accountHolderName.trim(),
      companyName: companyName.trim(),
      notes: notes.trim() || undefined,
    };

    try {
      setSaving(true);
      if (editingAccount) {
        await updateBankAccount(editingAccount.id, input);
        showSuccess("Cuenta actualizada exitosamente");
      } else {
        await createBankAccount(input);
        showSuccess("Cuenta creada exitosamente");
      }
      await loadAccounts();
      resetForm();
    } catch (err: any) {
      showError(err.message || "Error guardando cuenta");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (account: CompanyBankAccount) => {
    try {
      await toggleBankAccountActive(account.id);
      showSuccess(`Cuenta ${account.isActive ? "desactivada" : "activada"} exitosamente`);
      await loadAccounts();
    } catch (err: any) {
      showError(err.message || "Error cambiando estado");
    }
  };

  const handleDelete = async (account: CompanyBankAccount) => {
    showConfirm({
      title: "Eliminar Cuenta Bancaria",
      message: `¿Está seguro de eliminar la cuenta ${account.accountNumber}?\n\nEsta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      variant: "danger",
      onConfirm: async () => {
        closeConfirm();
        await performDelete(account);
      },
    });
  };

  const performDelete = async (account: CompanyBankAccount) => {
    try {
      await deleteBankAccount(account.id);
      showSuccess("Cuenta eliminada exitosamente");
      await loadAccounts();
    } catch (err: any) {
      showError(err.message || "Error eliminando cuenta");
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <>
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        confirmVariant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
      />
      <main className="app-shell">
        <div style={{ marginBottom: 30, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ marginBottom: 8, fontSize: "1.8rem", fontWeight: 600 }}>🏦 Cuentas Bancarias</h1>
            <p style={{ color: "#6b7280", margin: 0 }}>Gestiona las cuentas bancarias de la empresa para recibir pagos</p>
          </div>
          {!showForm && (
            <button className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg" onClick={() => setShowForm(true)} style={{ padding: "10px 20px" }}>
              ➕ Nueva Cuenta
            </button>
          )}
        </div>

        {/* Formulario */}
        {showForm && (
          <section style={{ background: "white", borderRadius: 12, padding: 30, marginBottom: 30, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
            <h2 style={{ margin: "0 0 20px 0", fontSize: "1.3rem", fontWeight: 600 }}>
              {editingAccount ? "✏️ Editar Cuenta" : "➕ Nueva Cuenta Bancaria"}
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 20, marginBottom: 20 }}>
                <div className="form-group">
                  <label style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>🏦 Banco</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="BAC, BCR, Promerica, etc."
                    required
                    style={{ width: "100%", padding: "10px 12px", fontSize: "1rem" }}
                  />
                </div>

                <div className="form-group">
                  <label style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>🔢 Número de Cuenta / IBAN</label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="CR05001614040007456807"
                    required
                    style={{ width: "100%", padding: "10px 12px", fontSize: "1rem" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, marginBottom: 20 }}>
                <div className="form-group">
                  <label style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>📂 Tipo de Cuenta</label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value as any)}
                    style={{ width: "100%", padding: "10px 12px", fontSize: "1rem" }}
                  >
                    <option value="CUENTA_CORRIENTE">Cuenta Corriente</option>
                    <option value="CUENTA_AHORRO">Cuenta Ahorro</option>
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>💱 Moneda</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as any)}
                    style={{ width: "100%", padding: "10px 12px", fontSize: "1rem" }}
                  >
                    <option value="CRC">₡ Colones (CRC)</option>
                    <option value="USD">$ Dólares (USD)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>📱 SINPE Móvil (opcional)</label>
                  <input
                    type="text"
                    value={sinpeNumber}
                    onChange={(e) => setSinpeNumber(e.target.value)}
                    placeholder="8888-8888"
                    style={{ width: "100%", padding: "10px 12px", fontSize: "1rem" }}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 20 }}>
                <label style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>👤 Titular de la Cuenta</label>
                <input
                  type="text"
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  required
                  style={{ width: "100%", padding: "10px 12px", fontSize: "1rem" }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 20 }}>
                <label style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>🏢 Nombre Comercial de la Empresa</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Viajes Alma Nova, Lucitours, etc."
                  style={{ width: "100%", padding: "10px 12px", fontSize: "1rem" }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 24 }}>
                <label style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>📝 Notas (opcional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Información adicional sobre esta cuenta"
                  rows={2}
                  style={{ width: "100%", padding: "10px 12px", fontSize: "1rem", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <button type="submit" className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg" disabled={saving}>
                  {saving ? "⏳ Guardando..." : editingAccount ? "💾 Actualizar" : "💾 Crear Cuenta"}
                </button>
                <button type="button" onClick={resetForm} className="rounded-xl px-4 py-3 bg-linear-to-b from-blue-500 to-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg" style={{ background: "#6b7280" }}>
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Lista de Cuentas */}
        <section style={{ background: "white", borderRadius: 12, padding: 30, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h2 style={{ margin: "0 0 20px 0", fontSize: "1.3rem", fontWeight: 600 }}>📋 Cuentas Registradas</h2>

          {loading && (
            <div style={{ textAlign: "center", padding: 20 }}>⏳ Cargando...</div>
          )}

          {!loading && accounts.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#9ca3af" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>🏦</div>
              <p style={{ margin: 0 }}>No hay cuentas bancarias registradas</p>
            </div>
          )}

          {!loading && accounts.length > 0 && (
            <div className="history-table-wrap">
              <table style={{ width: "100%", minWidth: "900px" }} className="history-table">
                <thead>
                  <tr>
                    <th style={{ width: "10%", minWidth: "100px" }}>Empresa</th>
                    <th style={{ width: "10%", minWidth: "100px" }}>Banco</th>
                    <th style={{ width: "18%", minWidth: "180px" }}>Cuenta</th>
                    <th style={{ width: "8%", minWidth: "80px" }}>Tipo</th>
                    <th style={{ width: "8%", minWidth: "80px" }}>Moneda</th>
                    <th style={{ width: "10%", minWidth: "100px" }}>SINPE</th>
                    <th style={{ width: "20%", minWidth: "180px" }}>Titular</th>
                    <th style={{ width: "8%", minWidth: "80px" }}>Estado</th>
                    <th style={{ width: "8%", minWidth: "180px", textAlign: "center" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id} style={{ opacity: account.isActive ? 1 : 0.5 }}>
                      <td style={{ fontWeight: 700, color: "#6366f1", fontSize: "0.95rem" }}>
                        {account.companyName || "Viajes Alma Nova"}
                      </td>
                      <td style={{ fontWeight: "bold", fontSize: "0.95rem" }}>{account.bankName}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.9rem", color: "#374151" }}>
                        {account.accountNumber}
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>
                        {account.accountType === "CUENTA_CORRIENTE" ? "Corriente" : "Ahorro"}
                      </td>
                      <td>
                        <span style={{ 
                          padding: "4px 8px", 
                          borderRadius: 4, 
                          background: account.currency === "USD" ? "#dbeafe" : "#dcfce7",
                          color: account.currency === "USD" ? "#1e40af" : "#166534",
                          fontWeight: "bold",
                          fontSize: "0.85rem",
                          display: "inline-block"
                        }}>
                          {account.currency === "USD" ? "$ USD" : "₡ CRC"}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                        {account.sinpeNumber || "-"}
                      </td>
                      <td style={{ fontSize: "0.8rem", color: "#6b7280", lineHeight: "1.3" }}>
                        {account.accountHolderName}
                      </td>
                      <td>
                        <span style={{
                          padding: "4px 8px",
                          borderRadius: 4,
                          background: account.isActive ? "#dcfce7" : "#fee2e2",
                          color: account.isActive ? "#166534" : "#991b1b",
                          fontSize: "0.8rem",
                          fontWeight: "bold",
                          whiteSpace: "nowrap"
                        }}>
                          {account.isActive ? "✓ Activa" : "✗ Inactiva"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "nowrap" }}>
                          <button
                            onClick={() => handleEdit(account)}
                            title="Editar cuenta"
                            style={{ 
                              padding: "6px 10px", 
                              fontSize: "0.8rem", 
                              background: "#3b82f6",
                              color: "white",
                              border: "none",
                              borderRadius: 4,
                              cursor: "pointer",
                              whiteSpace: "nowrap"
                            }}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => handleToggleActive(account)}
                            title={account.isActive ? "Desactivar cuenta" : "Activar cuenta"}
                            style={{ 
                              padding: "6px 10px", 
                              fontSize: "0.8rem", 
                              background: account.isActive ? "#f59e0b" : "#10b981",
                              color: "white",
                              border: "none",
                              borderRadius: 4,
                              cursor: "pointer",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {account.isActive ? "⏸️" : "▶️"}
                          </button>
                          <button
                            onClick={() => handleDelete(account)}
                            title="Eliminar cuenta"
                            style={{ 
                              padding: "6px 10px", 
                              fontSize: "0.8rem", 
                              background: "#ef4444",
                              color: "white",
                              border: "none",
                              borderRadius: 4,
                              cursor: "pointer"
                            }}
                          >
                            🗑️
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
      </main>
    </>
  );
}

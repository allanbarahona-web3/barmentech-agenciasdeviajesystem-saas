"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, getHomeRouteForRole, getTenantConfigAdmin } from "@/lib/auth-api";
import {
  getAllBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  toggleBankAccountActive,
  type CompanyBankAccount,
  type CreateBankAccountInput,
} from "@/lib/bank-accounts-api";
import { ConfirmModal } from "@/components/confirm-modal";
import { LoadingModal } from "@/components/loading-modal";
import { PageLoader } from "@/components/loading-spinner";
import { PageHeader } from "@/components/patterns/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconBadge } from "@/components/ui/icon-badge";
import { BankAccountEditor } from "@/features/bank-accounts/bank-account-editor";
import { BankAccountsTable } from "@/features/bank-accounts/bank-accounts-table";
import { Landmark, Plus } from "lucide-react";

export default function BankAccountsPage() {
  const router = useRouter();
  const session = getStoredSession();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<CompanyBankAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CompanyBankAccount | null>(null);

  // Form state
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState<"CUENTA_CORRIENTE" | "CUENTA_AHORRO">("CUENTA_CORRIENTE");
  const [currency, setCurrency] = useState<"CRC" | "USD">("CRC");
  const [sinpeNumber, setSinpeNumber] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [notes, setNotes] = useState("");
  const [editorError, setEditorError] = useState<{ title: string; message: string } | null>(null);
  const [accountConfirmation, setAccountConfirmation] = useState<{
    account: CompanyBankAccount;
    action: "activate" | "deactivate" | "delete";
  } | null>(null);
  const [accountActionError, setAccountActionError] = useState<string | null>(null);
  const [tenantNameFallback, setTenantNameFallback] = useState("la empresa");
  const [tenantLegalNameFallback, setTenantLegalNameFallback] = useState("la razon social de la empresa");
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<"loading" | "success" | "error">("loading");
  const [loadingModalMessage, setLoadingModalMessage] = useState("");

  // Modal de confirmación
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
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
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  };

  const closeLoadingModal = () => {
    setShowLoadingModal(false);
    setLoadingModalState("loading");
    setLoadingModalMessage("");
  };

  const showLoadingState = (message: string) => {
    setLoadingModalMessage(message);
    setLoadingModalState("loading");
    setShowLoadingModal(true);
  };

  const showLoadingSuccess = (message: string) => {
    setLoadingModalMessage(message);
    setLoadingModalState("success");
    setShowLoadingModal(true);
  };

  const showWarningModal = (title: string, message: string) => {
    showConfirm({
      title,
      message,
      confirmText: "Entendido",
      cancelText: "Cerrar",
      variant: "warning",
      onConfirm: () => closeConfirm(),
    });
  };

  const extractErrorMessage = (error: unknown, fallback: string) => {
    const rawMessage = String((error as any)?.message || '').trim();
    if (!rawMessage) {
      return fallback;
    }

    const cleanedMessage = rawMessage.replace(/^Error\s+\d+\s*:\s*/i, '').trim();
    return cleanedMessage || fallback;
  };

  const handleAccountSaveError = (error: unknown) => {
    const message = extractErrorMessage(error, "Error guardando cuenta");
    const normalized = message.toLowerCase();
    const isDuplicate =
      normalized.includes("ya existe una cuenta bancaria") ||
      normalized.includes("ya existe otra cuenta");

    if (isDuplicate) {
      setEditorError({ title: "Cuenta duplicada", message });
      return;
    }

    setEditorError({ title: "Error guardando cuenta", message });
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

    void loadTenantIdentity();
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTenantIdentity = async () => {
    try {
      const tenantConfig = await getTenantConfigAdmin();
      const tenantName = String(tenantConfig?.name || "").trim();
      const legalName = String(tenantConfig?.legalName || "").trim();

      if (tenantName) {
        setTenantNameFallback(tenantName);
        setCompanyName((prev) => (String(prev || "").trim() ? prev : tenantName));
      }

      if (legalName) {
        setTenantLegalNameFallback(legalName);
        setAccountHolderName((prev) => (String(prev || "").trim() ? prev : legalName));
      }
    } catch {
      // Keep generic fallbacks when tenant config is not available.
    }
  };

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const data = await getAllBankAccounts();
      setAccounts(data);
    } catch (err: unknown) {
      showWarningModal("Error al cargar cuentas", extractErrorMessage(err, "Error cargando cuentas"));
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
    setAccountHolderName(tenantLegalNameFallback);
    setCompanyName(tenantNameFallback);
    setNotes("");
    setEditorError(null);
    setEditingAccount(null);
    setShowForm(false);
  };

  const handleEdit = (account: CompanyBankAccount) => {
    setEditorError(null);
    setEditingAccount(account);
    setBankName(account.bankName);
    setAccountNumber(account.accountNumber);
    setAccountType(account.accountType as any);
    setCurrency(account.currency as any);
    setSinpeNumber(account.sinpeNumber || "");
    setAccountHolderName(account.accountHolderName);
    setCompanyName(account.companyName || tenantNameFallback);
    setNotes(account.notes || "");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditorError(null);

    if (!bankName.trim()) {
      setEditorError({ title: "Campo requerido", message: "El nombre del banco es requerido" });
      return;
    }

    if (!accountNumber.trim()) {
      setEditorError({ title: "Campo requerido", message: "El número de cuenta es requerido" });
      return;
    }

    // Validación del formato IBAN (CR + 20 dígitos = 22 caracteres)
    const ibanValue = accountNumber.trim().toUpperCase();
    if (ibanValue.startsWith("CR")) {
      if (ibanValue.length !== 22) {
        setEditorError({
          title: "Error en formato IBAN",
          message: `El IBAN debe tener exactamente 22 caracteres (CR + 20 dígitos).\n\nActualmente tiene ${ibanValue.length} caracteres.\n\nPor favor, verifica el número ingresado.`,
        });
        return;
      }
      // Verificar que después de "CR" solo haya dígitos
      const digits = ibanValue.substring(2);
      if (!/^\d{20}$/.test(digits)) {
        setEditorError({
          title: "Error en formato IBAN",
          message: "El IBAN debe tener el formato: CR seguido de 20 dígitos numéricos.\n\nEjemplo: CR05001614040007456807\n\nPor favor, verifica que no contenga letras después de CR.",
        });
        return;
      }
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
      showLoadingState(editingAccount ? "Actualizando cuenta bancaria..." : "Creando cuenta bancaria...");
      if (editingAccount) {
        await updateBankAccount(editingAccount.id, input);
        showLoadingSuccess("Cuenta actualizada exitosamente");
      } else {
        await createBankAccount(input);
        showLoadingSuccess("Cuenta creada exitosamente");
      }
      await loadAccounts();
      resetForm();
    } catch (err: unknown) {
      closeLoadingModal();
      handleAccountSaveError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (account: CompanyBankAccount) => {
    setAccountActionError(null);
    setAccountConfirmation({ account, action: account.isActive ? "deactivate" : "activate" });
  };

  const performToggleActive = async (account: CompanyBankAccount) => {
    try {
      showLoadingState(account.isActive ? "Desactivando cuenta bancaria..." : "Activando cuenta bancaria...");
      await toggleBankAccountActive(account.id);
      showLoadingSuccess(`Cuenta ${account.isActive ? "desactivada" : "activada"} exitosamente`);
      await loadAccounts();
    } catch (err: unknown) {
      closeLoadingModal();
      const message = extractErrorMessage(err, "Error cambiando estado");
      setAccountActionError(message);
    }
  };

  const handleDelete = async (account: CompanyBankAccount) => {
    setAccountActionError(null);
    setAccountConfirmation({ account, action: "delete" });
  };

  const performDelete = async (account: CompanyBankAccount) => {
    try {
      showLoadingState("Eliminando cuenta bancaria...");
      await deleteBankAccount(account.id);
      showLoadingSuccess("Cuenta eliminada exitosamente");
      await loadAccounts();
    } catch (err: unknown) {
      closeLoadingModal();
      const message = extractErrorMessage(err, "Error eliminando cuenta");
      setAccountActionError(message);
    }
  };

  const confirmAccountAction = () => {
    if (!accountConfirmation) return;

    const { account, action } = accountConfirmation;
    setAccountConfirmation(null);

    if (action === "delete") {
      void performDelete(account);
      return;
    }

    void performToggleActive(account);
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        confirmVariant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
      />
      <LoadingModal
        isOpen={showLoadingModal}
        state={loadingModalState}
        loadingMessage={loadingModalMessage}
        successMessage={loadingModalMessage}
        errorMessage={loadingModalMessage}
        onClose={closeLoadingModal}
      />
      <ConfirmDialog
        open={Boolean(accountConfirmation)}
        onOpenChange={(open) => { if (!open) setAccountConfirmation(null); }}
        title={
          accountConfirmation?.action === "delete"
            ? "Eliminar cuenta bancaria"
            : accountConfirmation?.action === "deactivate"
              ? "Desactivar cuenta bancaria"
              : "Activar cuenta bancaria"
        }
        description={accountConfirmation ? (
          <span>
            {accountConfirmation.action === "delete"
              ? "¿Seguro que deseas eliminar esta cuenta? Esta acción no se puede deshacer."
              : accountConfirmation.action === "deactivate"
                ? "¿Deseas desactivar esta cuenta bancaria? Dejará de estar disponible para recibir pagos."
                : "¿Deseas activar esta cuenta bancaria para recibir pagos?"}
            <span
              className={
                accountConfirmation.action === "delete"
                  ? "mt-3 block rounded-md border border-destructive/25 bg-destructive/5 p-3 text-destructive"
                  : accountConfirmation.action === "deactivate"
                    ? "mt-3 block rounded-md border border-warning/25 bg-warning/5 p-3 text-warning"
                    : "mt-3 block rounded-md border border-success/25 bg-success/5 p-3 text-success"
              }
            >
              <span className="block font-medium">{accountConfirmation.account.bankName}</span>
              <span className="mt-1 block text-sm">Cuenta / IBAN: {accountConfirmation.account.accountNumber}</span>
            </span>
          </span>
        ) : undefined}
        cancelLabel="Cancelar"
        confirmLabel={
          accountConfirmation?.action === "delete"
            ? "Eliminar"
            : accountConfirmation?.action === "deactivate"
              ? "Desactivar"
              : "Activar"
        }
        variant={accountConfirmation?.action === "delete" ? "destructive" : "default"}
        onConfirm={confirmAccountAction}
      />
      <main className="app-shell">
        <PageHeader
          className="mb-6"
          title={<span className="flex items-center gap-3"><IconBadge tone="primary"><Landmark aria-hidden="true" /></IconBadge>Cuentas bancarias</span>}
          description="Gestiona las cuentas bancarias de la empresa para recibir pagos."
          meta={<Badge variant="secondary">{accounts.length} cuenta{accounts.length === 1 ? '' : 's'}</Badge>}
          actions={!showForm ? (
            <Button type="button" onClick={() => setShowForm(true)}>
              <Plus aria-hidden="true" />
              Nueva cuenta
            </Button>
          ) : undefined}
        />

        {accountActionError ? (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Error en la cuenta bancaria</AlertTitle>
            <AlertDescription>{accountActionError}</AlertDescription>
          </Alert>
        ) : null}

        {showForm && (
          <BankAccountEditor
            isEditing={Boolean(editingAccount)}
            saving={saving}
            bankName={bankName}
            accountNumber={accountNumber}
            accountType={accountType}
            currency={currency}
            sinpeNumber={sinpeNumber}
            accountHolderName={accountHolderName}
            companyName={companyName}
            notes={notes}
            error={editorError}
            onBankNameChange={setBankName}
            onAccountNumberChange={setAccountNumber}
            onAccountTypeChange={setAccountType}
            onCurrencyChange={setCurrency}
            onSinpeNumberChange={setSinpeNumber}
            onAccountHolderNameChange={setAccountHolderName}
            onCompanyNameChange={setCompanyName}
            onNotesChange={setNotes}
            onSubmit={handleSubmit}
            onCancel={resetForm}
          />
        )}

        <BankAccountsTable
          accounts={accounts}
          loading={loading}
          tenantNameFallback={tenantNameFallback}
          onEdit={handleEdit}
          onToggleActive={handleToggleActive}
          onDelete={handleDelete}
        />
      </main>
    </>
  );
}

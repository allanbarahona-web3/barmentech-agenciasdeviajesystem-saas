"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { formatBusinessDate } from "@/shared/regional";
import { getStoredSession, getHomeRouteForRole } from "@/lib/auth-api";
import {
  getCurrentExchangeRate,
  getExchangeRateHistoryReportRange,
  downloadExchangeRateHistoryPdf,
  emailExchangeRateHistory,
  notifyCurrentExchangeRateChanged,
  setExchangeRate,
  type CurrentExchangeRate,
  type ExchangeRateHistoryReportRow,
} from "@/lib/exchange-rate-api";
import { getTenantBillingConfiguration, updateTenantBillingConfiguration } from "@/lib/fiscal-billing-admin-api";
import { ConfirmModal } from "@/components/confirm-modal";
import { LoadingModal } from "@/components/loading-modal";
import { PageLoader } from "@/components/loading-spinner";
import { PageHeader } from "@/components/patterns/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { ExchangeRateConfigForm } from "@/features/exchange-rate/exchange-rate-config-form";
import { ExchangeRateHistory } from "@/features/exchange-rate/exchange-rate-history";
import { BadgeDollarSign, Banknote, CalendarDays, Settings2, UserRound } from "lucide-react";

export default function AdminExchangeRatePage() {
  const router = useRouter();
  const session = getStoredSession();
  const role = String(session?.user?.role || "").toUpperCase();
  const canEdit = role === "ADMIN"; // Solo ADMIN puede editar
  const canEmailHistory = role === "ADMIN" || role === "FACTURACION_COBROS";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentRate, setCurrentRate] = useState<CurrentExchangeRate | null>(null);
  const [currentRateStatus, setCurrentRateStatus] = useState<"AVAILABLE" | "INCOMPLETE" | "MISSING">("MISSING");
  const [history, setHistory] = useState<ExchangeRateHistoryReportRow[]>([]);
  const [exchangeRateSource, setExchangeRateSource] = useState<"MANUAL" | "BCCR">("MANUAL");
  const [sourceSaving, setSourceSaving] = useState(false);

  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<"loading" | "success" | "error">("loading");
  const [loadingModalMessage, setLoadingModalMessage] = useState("");
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

  const [date, setDate] = useState("");
  const [buyRate, setBuyRate] = useState("");
  const [sellRate, setSellRate] = useState("");
  const [notes, setNotes] = useState("");
  const [isConfigurationSheetOpen, setIsConfigurationSheetOpen] = useState(false);
  const [configurationError, setConfigurationError] = useState("");

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

  const extractErrorMessage = (error: unknown, fallback: string) => {
    const rawMessage = String((error as any)?.message || "").trim();
    if (!rawMessage) {
      return fallback;
    }
    return rawMessage.replace(/^Error\s+\d+\s*:\s*/i, "").trim() || fallback;
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

      const configuration = canEdit ? await getTenantBillingConfiguration() : null;
      const [current, historyRows] = await Promise.all([
        getCurrentExchangeRate(),
        start && end ? getExchangeRateHistoryReportRange(start, end) : Promise.resolve([]),
      ]);

      setExchangeRateSource(configuration?.configuration.exchangeRateSource ?? current.rate?.source ?? "MANUAL");
      setCurrentRate(current.rate);
      setCurrentRateStatus(current.status);
      setHistory(historyRows);

      // Pre-populate form with today's rate if it exists
      if (current.rate?.source === "MANUAL") {
        setBuyRate(current.rate.buyRate.toString());
        setSellRate(current.rate.sellRate.toString());
        setNotes(current.rate.notes || "");
      }
    } catch (err: unknown) {
      showWarningModal("Error cargando datos", extractErrorMessage(err, "Error cargando datos"));
    } finally {
      setLoading(false);
    }
  };

  const handleExchangeRateSourceChange = async (source: "MANUAL" | "BCCR") => {
    if (!canEdit || source === exchangeRateSource || sourceSaving) return;
    const previousSource = exchangeRateSource;
    setExchangeRateSource(source);
    setSourceSaving(true);
    try {
      await updateTenantBillingConfiguration({ exchangeRateSource: source });
      await loadData();
      notifyCurrentExchangeRateChanged();
      showLoadingSuccess(`Fuente de tipo de cambio actualizada a ${source === "MANUAL" ? "Manual" : "BCCR"}.`);
    } catch (error: unknown) {
      setExchangeRateSource(previousSource);
      showWarningModal("No se pudo actualizar la fuente", extractErrorMessage(error, "No se pudo actualizar la fuente de tipo de cambio."));
    } finally {
      setSourceSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const buy = parseFloat(buyRate);
    const sell = parseFloat(sellRate);
    setConfigurationError("");

    if (!date) {
      setConfigurationError("Debe seleccionar una fecha");
      return;
    }

    if (isNaN(buy) || buy <= 0) {
      setConfigurationError("El tipo de cambio de compra debe ser mayor a 0");
      return;
    }

    if (isNaN(sell) || sell <= 0) {
      setConfigurationError("El tipo de cambio de venta debe ser mayor a 0");
      return;
    }

    if (sell < buy) {
      setConfigurationError("El tipo de cambio de venta debe ser mayor o igual al de compra");
      return;
    }

    try {
      setSaving(true);
      showLoadingState("Guardando tipo de cambio...");
      await setExchangeRate({
        date,
        buyRate: buy,
        sellRate: sell,
        notes: notes.trim() || undefined,
      });

      showLoadingSuccess("Tipo de cambio guardado exitosamente");
      await loadData();

      // Reset form
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      setDate(today);
      setBuyRate("");
      setSellRate("");
      setNotes("");
      setConfigurationError("");
      setIsConfigurationSheetOpen(false);
    } catch (err: unknown) {
      closeLoadingModal();
      setConfigurationError(extractErrorMessage(err, "Error guardando tipo de cambio"));
    } finally {
      setSaving(false);
    }
  };

  const openConfigurationSheet = () => {
    setConfigurationError("");
    setIsConfigurationSheetOpen(true);
  };

  const handleConfigurationSheetOpenChange = (open: boolean) => {
    if (!open && saving) return;
    setIsConfigurationSheetOpen(open);
    if (!open) setConfigurationError("");
  };

  const handleFilter = async () => {
    if (!filterStartDate || !filterEndDate) {
      showWarningModal("Filtro incompleto", "Debe seleccionar ambas fechas");
      return;
    }

    if (filterStartDate > filterEndDate) {
      showWarningModal("Rango inválido", "La fecha inicial debe ser menor o igual a la fecha final");
      return;
    }

    setFiltering(true);
    try {
      showLoadingState("Filtrando historial...");
      await loadData(filterStartDate, filterEndDate);
      showLoadingSuccess("Historial filtrado exitosamente");
    } catch (err: unknown) {
      closeLoadingModal();
      showWarningModal("Error filtrando historial", extractErrorMessage(err, "Error filtrando historial"));
    } finally {
      setFiltering(false);
    }
  };

  const handleExportPdf = async () => {
    if (!filterStartDate || !filterEndDate) {
      showWarningModal("Rango requerido", "Debe seleccionar ambas fechas para exportar");
      return;
    }

    setExporting(true);
    try {
      showLoadingState("Generando PDF del historial...");
      const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const clientUtcOffsetMinutes = new Date().getTimezoneOffset();

      const blob = await downloadExchangeRateHistoryPdf(filterStartDate, filterEndDate, {
        timeZone: clientTimeZone,
        utcOffsetMinutes: clientUtcOffsetMinutes,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `historial-tipo-cambio-${filterStartDate}-${filterEndDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showLoadingSuccess("PDF descargado exitosamente");
    } catch (err: unknown) {
      closeLoadingModal();
      showWarningModal("Error exportando PDF", extractErrorMessage(err, "Error exportando PDF"));
    } finally {
      setExporting(false);
    }
  };

  const handleCloseModal = () => {
    setShowEmailModal(false);
    setEmailRecipient(""); // Limpiar campo al cerrar
  };

  const handleSendEmail = async () => {
    if (!canEmailHistory) return;
    if (!filterStartDate || !filterEndDate) {
      showWarningModal("Rango requerido", "Debe seleccionar ambas fechas");
      return;
    }

    if (!emailRecipient || !emailRecipient.includes("@")) {
      showWarningModal("Correo inválido", "Debe ingresar un correo válido");
      return;
    }

    setSendingEmail(true);
    try {
      showLoadingState("Enviando historial por correo...");
      const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const clientUtcOffsetMinutes = new Date().getTimezoneOffset();

      await emailExchangeRateHistory(filterStartDate, filterEndDate, emailRecipient, {
        timeZone: clientTimeZone,
        utcOffsetMinutes: clientUtcOffsetMinutes,
      });
      showLoadingSuccess("Historial enviado por correo exitosamente");
      setShowEmailModal(false);
      setEmailRecipient(""); // Limpiar campo para próximo envío
    } catch (err: unknown) {
      closeLoadingModal();
      showWarningModal("Error enviando correo", extractErrorMessage(err, "Error enviando correo"));
    } finally {
      setSendingEmail(false);
    }
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
      <main className="app-shell">
        <PageHeader
          className="mb-6"
          title={<span className="flex items-center gap-3"><IconBadge tone="primary"><BadgeDollarSign aria-hidden="true" /></IconBadge>Tipo de cambio</span>}
          description="Administra el tipo de cambio USD/CRC utilizado por el sistema."
          actions={canEdit && exchangeRateSource === "MANUAL" ? (
            <Button type="button" onClick={openConfigurationSheet}>
              <Settings2 aria-hidden="true" />
              Configurar tipo de cambio
            </Button>
          ) : undefined}
        />

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Fuente del tipo de cambio</CardTitle>
            <CardDescription>Define la fuente diaria que Finance utiliza para consolidaciones.</CardDescription>
          </CardHeader>
          <CardContent>
            <label className="grid max-w-md gap-2 text-sm font-medium text-foreground" htmlFor="exchange-rate-source">
              Fuente del tipo de cambio
              <select
                id="exchange-rate-source"
                value={exchangeRateSource}
                disabled={!canEdit || sourceSaving}
                onChange={(event) => void handleExchangeRateSourceChange(event.target.value as "MANUAL" | "BCCR")}
                className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
              >
                <option value="MANUAL">Manual</option>
                <option value="BCCR">BCCR</option>
              </select>
              <span className="text-xs font-normal text-muted-foreground">{exchangeRateSource === "MANUAL" ? "La agencia registra el tipo de cambio diario." : "Finance usa la fuente oficial BCCR; no se habilita edición manual."}</span>
            </label>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start gap-3">
              <IconBadge tone="info"><Banknote aria-hidden="true" /></IconBadge>
              <div>
                <CardTitle>Tipo de cambio vigente</CardTitle>
                <CardDescription>Valores actuales para conversiones USD/CRC.</CardDescription>
              </div>
            </div>
            {currentRate ? <Badge variant="info">{currentRate.source}</Badge> : null}
          </CardHeader>
          <CardContent>
            {currentRate ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><IconBadge tone="info" size="sm"><CalendarDays aria-hidden="true" /></IconBadge>Fecha efectiva</div>
                  <p className="mt-3 text-lg font-semibold tracking-tight text-foreground">{formatBusinessDate(currentRate.effectiveDate)}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><IconBadge tone="success" size="sm"><BadgeDollarSign aria-hidden="true" /></IconBadge>TC Compra</div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">₡{currentRate.buyRate.toFixed(4)}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><IconBadge tone="primary" size="sm"><BadgeDollarSign aria-hidden="true" /></IconBadge>TC Venta</div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">₡{currentRate.sellRate.toFixed(4)}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><IconBadge tone="neutral" size="sm"><UserRound aria-hidden="true" /></IconBadge>Fuente</div>
                  <p className="mt-3 text-lg font-semibold tracking-tight text-foreground">{currentRate.source}</p>
                </div>
              </div>
            ) : (
              <Alert variant="warning">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <AlertDescription>{currentRateStatus === "INCOMPLETE" ? "La fuente activa no tiene TC Compra y TC Venta disponibles." : "No se ha configurado el tipo de cambio para hoy."}</AlertDescription>
                  {canEdit ? <Button type="button" variant="outline" size="sm" onClick={openConfigurationSheet}>Configurar ahora</Button> : null}
                </div>
              </Alert>
            )}
          </CardContent>
        </Card>

      {canEdit && exchangeRateSource === "MANUAL" && (
        <ExchangeRateConfigForm
          open={isConfigurationSheetOpen}
          date={date}
          buyRate={buyRate}
          sellRate={sellRate}
          notes={notes}
          saving={saving}
          error={configurationError}
          onOpenChange={handleConfigurationSheetOpenChange}
          onDateChange={setDate}
          onBuyRateChange={setBuyRate}
          onSellRateChange={setSellRate}
          onNotesChange={setNotes}
          onSubmit={handleSubmit}
        />
      )}

      <ExchangeRateHistory
        filterStartDate={filterStartDate}
        filterEndDate={filterEndDate}
        history={history}
        filtering={filtering}
        exporting={exporting}
        onFilterStartDateChange={setFilterStartDate}
        onFilterEndDateChange={setFilterEndDate}
        onFilter={handleFilter}
        onExportPdf={handleExportPdf}
        canEmail={canEmailHistory}
        onOpenEmail={() => setShowEmailModal(true)}
        formatTimestamp={formatTimestamp}
        formatBusinessDate={formatBusinessDate}
      />

      {/* Email Modal */}
      {canEmailHistory && showEmailModal && (
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

      </main>
    </>
  );
}

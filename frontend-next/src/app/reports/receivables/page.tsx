"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, Download, FileText, RefreshCw } from "lucide-react";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportRouteGuard } from "@/features/reporting/report-route-guard";
import { formatFinanceMoneyDisplay } from "@/lib/finance-money-display";
import {
  downloadReportingExport,
  getReceivablesReport,
  type ReceivablesCollectionTiming,
  type ReceivablesReportCategory,
  type ReceivablesDueDatePreset,
  type ReceivablesReportResult,
} from "@/lib/reporting-api";

const PAGE_SIZE = 25;

const DUE_DATE_OPTIONS: Array<{ value: ReceivablesDueDatePreset; label: string }> = [
  { value: "ALL", label: "Todas las fechas" },
  { value: "OVERDUE", label: "Vencidas" },
  { value: "DUE_TODAY", label: "Vence hoy" },
  { value: "NEXT_7_DAYS", label: "Próximos 7 días" },
  { value: "NEXT_15_DAYS", label: "Próximos 15 días" },
  { value: "CURRENT_MONTH", label: "Mes actual" },
  { value: "CUSTOM", label: "Personalizado" },
];

function formatFiscalDate(calendarDate: string): string {
  const [year, month, day] = calendarDate.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : calendarDate;
}

function categoryLabel(category: ReceivablesReportCategory): string {
  return category === "RECOGNIZED_RECEIVABLE" ? "CxC facturada" : "Obligación contractual";
}

function timingLabel(timing: ReceivablesCollectionTiming): string {
  switch (timing) {
    case "OVERDUE": return "Vencido";
    case "CURRENT": return "Vigente";
    case "FUTURE": return "Futuro";
    case "NO_PROJECTABLE_DATE": return "Sin fecha proyectable";
  }
}

function timingVariant(timing: ReceivablesCollectionTiming): "destructive" | "outline" | "secondary" {
  if (timing === "OVERDUE") return "destructive";
  if (timing === "CURRENT") return "outline";
  return "secondary";
}

function customerLabel(customer: ReceivablesReportResult["rows"][number]["customer"]): string {
  const identification = customer.identification
    ? `${customer.identificationType ? `${customer.identificationType} ` : ""}${customer.identification}`
    : "Sin identificación";
  return `${customer.name ?? "Cliente no disponible"} · ${identification}`;
}

function paymentStatusLabel(status: ReceivablesReportResult["rows"][number]["status"]): string {
  return status === "PARTIALLY_SETTLED" ? "Parcialmente cobrada" : "Pendiente";
}

function Amount({ label, value, currencyCode }: { label: string; value: string; currencyCode: string }) {
  return <div className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2 last:border-b-0">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="m-0 whitespace-nowrap text-right text-sm font-medium tabular-nums">{formatFinanceMoneyDisplay(value, currencyCode)}</dd>
  </div>;
}

function CurrencySummaryCard({ summary }: { summary: ReceivablesReportResult["currencies"][number] }) {
  return <Card aria-label={`Resumen de cuentas por cobrar en ${summary.currencyCode}`}>
    <CardHeader><div><p className="text-xs font-medium tracking-wide text-muted-foreground">Moneda</p><CardTitle className="mt-1 text-lg">{summary.currencyCode}</CardTitle></div></CardHeader>
    <CardContent><dl>
      <Amount label="CxC facturada pendiente" value={summary.recognizedOutstanding} currencyCode={summary.currencyCode} />
      <Amount label="Obligación contractual pendiente" value={summary.projectedOutstanding} currencyCode={summary.currencyCode} />
      <Amount label="CxC facturada vencida" value={summary.overdueRecognized} currencyCode={summary.currencyCode} />
      <Amount label="Obligación contractual vencida" value={summary.overdueProjected} currencyCode={summary.currencyCode} />
      <Amount label="CxC facturada sin fecha" value={summary.noDateRecognized} currencyCode={summary.currencyCode} />
      <Amount label="Obligación contractual sin fecha" value={summary.noDateProjected} currencyCode={summary.currencyCode} />
    </dl></CardContent>
  </Card>;
}

function ReceivablesReportPageContent() {
  const [dueDatePreset, setDueDatePreset] = useState<ReceivablesDueDatePreset>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currencyCode, setCurrencyCode] = useState("ALL");
  const [category, setCategory] = useState<"ALL" | ReceivablesReportCategory>("ALL");
  const [timing, setTiming] = useState<"ALL" | ReceivablesCollectionTiming>("ALL");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ReceivablesReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const customPeriodIncomplete = dueDatePreset === "CUSTOM" && (!dateFrom || !dateTo);

  const load = useCallback(async (signal: AbortSignal) => {
    if (customPeriodIncomplete) {
      setLoading(false);
      setResult(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setResult(await getReceivablesReport({
        dueDatePreset,
        dateFrom: dueDatePreset === "CUSTOM" ? dateFrom : undefined,
        dateTo: dueDatePreset === "CUSTOM" ? dateTo : undefined,
        currencyCode: currencyCode === "ALL" ? undefined : currencyCode,
        category: category === "ALL" ? undefined : category,
        timing: timing === "ALL" ? undefined : timing,
        page,
        pageSize: PAGE_SIZE,
      }, signal));
    } catch (requestError) {
      if (!signal.aborted) {
        setResult(null);
        setError(requestError instanceof Error ? requestError.message : "No se pudo cargar el reporte de cuentas por cobrar.");
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [category, currencyCode, customPeriodIncomplete, dateFrom, dateTo, dueDatePreset, page, timing]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const currencyOptions = useMemo(() => [...new Set([...(currencyCode === "ALL" ? [] : [currencyCode]), ...(result?.currencies.map((summary) => summary.currencyCode) ?? [])])], [currencyCode, result]);
  const pageLabel = useMemo(() => {
    if (!result || result.pagination.totalItems === 0) return "0 filas";
    const first = (result.pagination.page - 1) * result.pagination.pageSize + 1;
    const last = Math.min(result.pagination.page * result.pagination.pageSize, result.pagination.totalItems);
    return `${first}–${last} de ${result.pagination.totalItems} filas`;
  }, [result]);

  function resetPage(action: () => void) { action(); setPage(1); }
  function selectDueDatePreset(nextPreset: ReceivablesDueDatePreset) { resetPage(() => setDueDatePreset(nextPreset)); }
  async function exportReport(format: "PDF" | "XLSX" | "CSV") { setExporting(true); setError(null); try { const file = await downloadReportingExport("RECEIVABLES", format, { dueDatePreset, dateFrom: dueDatePreset === "CUSTOM" ? dateFrom : undefined, dateTo: dueDatePreset === "CUSTOM" ? dateTo : undefined, currencyCode: currencyCode === "ALL" ? undefined : currencyCode, category: category === "ALL" ? undefined : category, timing: timing === "ALL" ? undefined : timing }); const url = URL.createObjectURL(file.blob); const link = document.createElement("a"); link.href = url; link.download = file.fileName; link.click(); URL.revokeObjectURL(url); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "No se pudo exportar el reporte de cuentas por cobrar."); } finally { setExporting(false); } }

  return <main className="app-shell"><div className="mx-auto w-full max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground">Reporting Engine · Cuentas por cobrar</p><h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Cuentas por cobrar</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">CxC facturada y saldos contractuales pendientes por vencimiento.</p></div>
      <div className="flex flex-wrap items-center gap-2"><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={exporting || customPeriodIncomplete}><Download aria-hidden="true" />{exporting ? "Exportando…" : "Exportar"}<ChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void exportReport("PDF")}>PDF</DropdownMenuItem><DropdownMenuItem onSelect={() => void exportReport("XLSX")}>Excel</DropdownMenuItem><DropdownMenuItem onSelect={() => void exportReport("CSV")}>CSV</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button asChild type="button" variant="outline"><Link href="/reports">Volver a reportes</Link></Button><Button type="button" variant="outline" onClick={() => { const controller = new AbortController(); void load(controller.signal); }} disabled={loading || customPeriodIncomplete}><RefreshCw aria-hidden="true" />Actualizar</Button></div>
    </header>

    <Card><CardContent className="grid gap-4 pt-5 md:grid-cols-2 xl:grid-cols-3 md:items-end">
      <label className="grid gap-2 text-sm font-medium text-foreground">Vencimiento<select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={dueDatePreset} onChange={(event) => selectDueDatePreset(event.target.value as ReceivablesDueDatePreset)}>{DUE_DATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-foreground">Moneda<select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={currencyCode} onChange={(event) => resetPage(() => setCurrencyCode(event.target.value))}><option value="ALL">Todas</option>{currencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-foreground">Tipo<select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={category} onChange={(event) => resetPage(() => setCategory(event.target.value as "ALL" | ReceivablesReportCategory))}><option value="ALL">Todas</option><option value="RECOGNIZED_RECEIVABLE">CxC facturada</option><option value="PROJECTED_RECEIVABLE">Obligación contractual</option></select></label>
      <label className="grid gap-2 text-sm font-medium text-foreground">Estado<select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={timing} onChange={(event) => resetPage(() => setTiming(event.target.value as "ALL" | ReceivablesCollectionTiming))}><option value="ALL">Todos</option><option value="OVERDUE">Vencido</option><option value="CURRENT">Vigente</option><option value="FUTURE">Futuro</option><option value="NO_PROJECTABLE_DATE">Sin fecha proyectable</option></select></label>
      {dueDatePreset === "CUSTOM" ? <div className="grid gap-4 sm:grid-cols-2 xl:col-span-3"><label className="grid gap-2 text-sm font-medium text-foreground">Desde<Input type="date" value={dateFrom} onChange={(event) => resetPage(() => setDateFrom(event.target.value))} /></label><label className="grid gap-2 text-sm font-medium text-foreground">Hasta<Input type="date" value={dateTo} onChange={(event) => resetPage(() => setDateTo(event.target.value))} /></label></div> : <p className="pb-2 text-sm text-muted-foreground xl:col-span-3">El vencimiento se resuelve con la zona horaria fiscal del tenant.</p>}
    </CardContent></Card>

    <Card className="bg-muted/20"><CardContent className="grid gap-4 pt-5 text-sm sm:grid-cols-2"><div><p className="font-medium">CxC facturada</p><p className="mt-1 text-muted-foreground">Deuda ya facturada y pendiente de cobro.</p></div><div><p className="font-medium">Obligación contractual</p><p className="mt-1 text-muted-foreground">Saldo contractual pendiente con su fecha límite de pago.</p></div></CardContent></Card>

    {customPeriodIncomplete ? <Card><CardContent className="py-10 text-center"><p className="text-sm text-muted-foreground">Seleccione Desde y Hasta para consultar un período personalizado.</p></CardContent></Card> : null}
    {loading && !customPeriodIncomplete ? <Card><CardContent className="grid min-h-[260px] place-items-center"><LoadingSpinner message="Cargando cuentas por cobrar…" /></CardContent></Card> : null}
    {error ? <Card className="border-destructive/40"><CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center"><AlertCircle className="size-8 text-destructive" aria-hidden="true" /><div><h2 className="font-semibold">No se pudo cargar el reporte</h2><p className="mt-1 text-sm text-muted-foreground">{error}</p></div><Button type="button" variant="outline" onClick={() => { const controller = new AbortController(); void load(controller.signal); }}>Intentar nuevamente</Button></CardContent></Card> : null}
    {!loading && !error && result && result.currencies.length === 0 ? <Card><CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center"><FileText className="size-8 text-muted-foreground" aria-hidden="true" /><p className="text-sm text-muted-foreground">No hay cuentas por cobrar u obligaciones contractuales para los filtros seleccionados.</p></CardContent></Card> : null}
    {!loading && !error && result && result.currencies.length > 0 ? <>
      <section className="grid gap-4 lg:grid-cols-2" aria-label="Resumen de cuentas por cobrar por moneda">{result.currencies.map((summary) => <CurrencySummaryCard key={summary.currencyCode} summary={summary} />)}</section>
      <Card className="overflow-hidden"><CardHeader><div><CardTitle>Detalle de cuentas por cobrar</CardTitle><p className="mt-1 text-sm text-muted-foreground">{pageLabel}</p></div></CardHeader><div className="overflow-x-auto"><Table className="min-w-[1100px]"><TableHeader><TableRow><TableHead>Cliente / identificación</TableHead><TableHead>Tipo</TableHead><TableHead>Referencia</TableHead><TableHead>Fecha</TableHead><TableHead>Vencimiento</TableHead><TableHead>Moneda</TableHead><TableHead className="text-right">Monto original</TableHead><TableHead className="text-right">Aplicado</TableHead><TableHead className="text-right">Pendiente</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>{result.rows.map((row) => <TableRow key={`${row.category}-${row.opaqueId}`}><TableCell className="max-w-56 whitespace-normal">{customerLabel(row.customer)}</TableCell><TableCell><Badge variant="outline">{categoryLabel(row.category)}</Badge></TableCell><TableCell className="max-w-40 whitespace-normal font-medium">{row.reference ?? "Sin referencia"}</TableCell><TableCell className="whitespace-nowrap">{formatFiscalDate(row.createdOn)}</TableCell><TableCell className="whitespace-nowrap">{row.dueOn ? formatFiscalDate(row.dueOn) : "Sin fecha proyectable"}</TableCell><TableCell>{row.currencyCode}</TableCell><TableCell className="whitespace-nowrap text-right tabular-nums">{formatFinanceMoneyDisplay(row.originalAmount, row.currencyCode)}</TableCell><TableCell className="whitespace-nowrap text-right tabular-nums">{formatFinanceMoneyDisplay(row.appliedAmount, row.currencyCode)}</TableCell><TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{formatFinanceMoneyDisplay(row.outstandingAmount, row.currencyCode)}</TableCell><TableCell><div className="flex min-w-36 flex-col items-start gap-1"><Badge variant={timingVariant(row.collectionTiming)}>{timingLabel(row.collectionTiming)}</Badge><span className="text-xs text-muted-foreground">{paymentStatusLabel(row.status)}</span></div></TableCell></TableRow>)}</TableBody></Table></div><div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">{pageLabel}</p><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={result.pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft aria-hidden="true" />Anterior</Button><Button type="button" size="sm" variant="outline" disabled={result.pagination.totalPages === 0 || result.pagination.page >= result.pagination.totalPages} onClick={() => setPage((current) => Math.min(result.pagination.totalPages, current + 1))}>Siguiente<ChevronRight aria-hidden="true" /></Button></div></div></Card>
    </> : null}
  </div></main>;
}

export default function ReceivablesReportPage() {
  return <ReportRouteGuard reportKey="RECEIVABLES"><ReceivablesReportPageContent /></ReportRouteGuard>;
}

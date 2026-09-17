"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, Download, FileText, RefreshCw } from "lucide-react";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportRouteGuard } from "@/features/reporting/report-route-guard";
import { formatFinanceMoneyDisplay } from "@/lib/finance-money-display";
import { downloadReportingExport, getSalesTaxReport, type ReportingPeriodPreset, type SalesTaxReportResult } from "@/lib/reporting-api";

const PAGE_SIZE = 25;

const PERIOD_OPTIONS: Array<{ value: ReportingPeriodPreset; label: string }> = [
  { value: "TODAY", label: "Hoy" },
  { value: "LAST_7_DAYS", label: "Últimos 7 días" },
  { value: "LAST_15_DAYS", label: "Últimos 15 días" },
  { value: "CURRENT_MONTH", label: "Mes actual" },
  { value: "PREVIOUS_MONTH", label: "Mes anterior" },
  { value: "CUSTOM", label: "Personalizado" },
];

function formatFiscalDate(calendarDate: string): string {
  const [year, month, day] = calendarDate.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : calendarDate;
}

function customerLabel(customer: SalesTaxReportResult["documents"][number]["customer"]): string {
  const identification = customer.identification
    ? `${customer.identificationType ? `${customer.identificationType} ` : ""}${customer.identification}`
    : "Sin identificación";
  return `${customer.name ?? "Cliente no disponible"} · ${identification}`;
}

function effectLabel(effect: "INCREASE" | "DECREASE"): string {
  return effect === "INCREASE" ? "Aumenta" : "Disminuye";
}

function SummaryMetric({ label, value, currencyCode }: { label: string; value: string; currencyCode: string }) {
  return <div className="min-w-0 rounded-md bg-muted/45 px-3 py-2.5"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 truncate text-sm font-medium tabular-nums" title={formatFinanceMoneyDisplay(value, currencyCode)}>{formatFinanceMoneyDisplay(value, currencyCode)}</dd></div>;
}

function TaxCurrencyCard({ summary }: { summary: SalesTaxReportResult["currencies"][number] }) {
  return <Card className="overflow-hidden" aria-label={`Impuestos ${summary.currencyCode}`}>
    <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
      <div><p className="text-xs font-medium tracking-wide text-muted-foreground">Moneda</p><CardTitle className="mt-1 text-lg">{summary.currencyCode}</CardTitle></div>
      <Badge variant="outline">{summary.documentCount} documentos</Badge>
    </CardHeader>
    <CardContent className="space-y-5">
      <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryMetric label="Ventas exentas" value={summary.exemptSales} currencyCode={summary.currencyCode} />
        <SummaryMetric label="Ventas exoneradas" value={summary.exoneratedSales} currencyCode={summary.currencyCode} />
        <SummaryMetric label="Impuesto bruto" value={summary.grossTax} currencyCode={summary.currencyCode} />
        <SummaryMetric label="Impuesto exonerado" value={summary.exoneratedTax} currencyCode={summary.currencyCode} />
        <SummaryMetric label="Impuesto cobrado" value={summary.taxCollected} currencyCode={summary.currencyCode} />
      </dl>
      <div>
        <div className="mb-2"><h2 className="text-sm font-semibold">Tarifas / impuestos</h2><p className="mt-0.5 text-xs text-muted-foreground">Valores fiscales exactos agrupados por código y tarifa.</p></div>
        <Table><TableHeader><TableRow><TableHead>Tarifa</TableHead><TableHead className="text-right">Base imponible</TableHead><TableHead className="text-right">Impuesto cobrado</TableHead><TableHead className="text-right">Documentos</TableHead></TableRow></TableHeader><TableBody>{summary.taxGroups.map((group) => <TableRow key={`${group.taxCode}-${group.rateCode ?? ""}-${group.rate}`}><TableCell className="font-medium"><div>{group.rate}%</div><div className="mt-0.5 text-xs font-normal text-muted-foreground">Código {group.taxCode}{group.rateCode ? ` · Tarifa ${group.rateCode}` : ""}</div></TableCell><TableCell className="whitespace-nowrap text-right text-xs tabular-nums sm:text-sm">{formatFinanceMoneyDisplay(group.taxableBase, summary.currencyCode)}</TableCell><TableCell className="whitespace-nowrap text-right text-xs tabular-nums sm:text-sm"><div>{formatFinanceMoneyDisplay(group.taxCollected, summary.currencyCode)}</div><div className="mt-0.5 text-xs text-muted-foreground">Bruto: {formatFinanceMoneyDisplay(group.grossTaxAmount, summary.currencyCode)}{group.exemptionAmount === undefined ? "" : ` · Exon.: ${formatFinanceMoneyDisplay(group.exemptionAmount, summary.currencyCode)}`}</div></TableCell><TableCell className="text-right tabular-nums">{group.documentCount}</TableCell></TableRow>)}</TableBody></Table>
      </div>
    </CardContent>
  </Card>;
}

function SalesTaxReportPageContent() {
  const [periodPreset, setPeriodPreset] = useState<ReportingPeriodPreset>("CURRENT_MONTH");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [currencyCode, setCurrencyCode] = useState("ALL");
  const [taxGroupFilter, setTaxGroupFilter] = useState("ALL");
  const [projectionMode, setProjectionMode] = useState<"ORIGINAL" | "CRC">("ORIGINAL");
  const [result, setResult] = useState<SalesTaxReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const customPeriodIncomplete = periodPreset === "CUSTOM" && (!dateFrom || !dateTo);

  const load = useCallback(async (signal: AbortSignal) => {
    if (periodPreset === "CUSTOM" && (!dateFrom || !dateTo)) {
      setLoading(false); setResult(null); setError(null); return;
    }
    setLoading(true); setError(null);
    try {
      const [taxCode, rateCode, rate] = taxGroupFilter === "ALL" ? [] : taxGroupFilter.split("\u0000");
      setResult(await getSalesTaxReport({ periodPreset, dateFrom: periodPreset === "CUSTOM" ? dateFrom : undefined, dateTo: periodPreset === "CUSTOM" ? dateTo : undefined, page, pageSize: PAGE_SIZE, currencyCode: currencyCode === "ALL" ? undefined : currencyCode, taxCode, rateCode: rateCode || undefined, rate, projectionMode }, signal));
    } catch (requestError) {
      if (!signal.aborted) { setResult(null); setError(requestError instanceof Error ? requestError.message : "No se pudo cargar el reporte de impuestos sobre ventas."); }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [currencyCode, dateFrom, dateTo, page, periodPreset, projectionMode, taxGroupFilter]);

  const taxGroupOptions = useMemo(() => {
    const groups = result?.currencies.flatMap((currency) => currency.taxGroups) ?? [];
    return [...new Map(groups.map((group) => [`${group.taxCode}\u0000${group.rateCode ?? ""}\u0000${group.rate}`, group])).values()];
  }, [result]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const pageLabel = useMemo(() => {
    if (!result || result.pagination.totalItems === 0) return "0 documentos";
    const first = (result.pagination.page - 1) * result.pagination.pageSize + 1;
    const last = Math.min(result.pagination.page * result.pagination.pageSize, result.pagination.totalItems);
    return `${first}–${last} de ${result.pagination.totalItems} documentos`;
  }, [result]);

  function selectPeriod(nextPeriod: ReportingPeriodPreset) { setPeriodPreset(nextPeriod); setPage(1); }
  async function exportReport(format: "PDF" | "XLSX" | "CSV") { setExporting(true); setError(null); try { const [taxCode, rateCode, rate] = taxGroupFilter === "ALL" ? [] : taxGroupFilter.split("\u0000"); const file = await downloadReportingExport("SALES_TAX", format, { periodPreset, dateFrom: periodPreset === "CUSTOM" ? dateFrom : undefined, dateTo: periodPreset === "CUSTOM" ? dateTo : undefined, currencyCode: currencyCode === "ALL" ? undefined : currencyCode, taxCode, rateCode: rateCode || undefined, rate, projectionMode }); const url = URL.createObjectURL(file.blob); const link = document.createElement("a"); link.href = url; link.download = file.fileName; link.click(); URL.revokeObjectURL(url); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "No se pudo exportar el reporte."); } finally { setExporting(false); } }

  return <main className="app-shell"><div className="mx-auto w-full max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground">Reporting Engine · Impuestos</p><h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Impuestos sobre ventas</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Información fiscal aceptada, separada por moneda y agrupada por los códigos y tarifas entregados por el reporte.</p></div><div className="flex flex-wrap items-center gap-2"><div className="flex items-center rounded-md border border-input p-0.5" aria-label="Vista monetaria"><span className="px-2 text-xs text-muted-foreground">Vista monetaria</span><Button type="button" size="sm" variant={projectionMode === "ORIGINAL" ? "default" : "ghost"} onClick={() => { setProjectionMode("ORIGINAL"); setPage(1); }}>Original</Button><Button type="button" size="sm" variant={projectionMode === "CRC" ? "default" : "ghost"} onClick={() => { setProjectionMode("CRC"); setPage(1); }}>CRC</Button></div><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={exporting || customPeriodIncomplete}><Download aria-hidden="true" />{exporting ? "Exportando…" : "Exportar"}<ChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void exportReport("PDF")}>PDF</DropdownMenuItem><DropdownMenuItem onSelect={() => void exportReport("XLSX")}>Excel</DropdownMenuItem><DropdownMenuItem onSelect={() => void exportReport("CSV")}>CSV</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button asChild type="button" variant="outline"><Link href="/reports">Volver a reportes</Link></Button><Button type="button" variant="outline" onClick={() => { const controller = new AbortController(); void load(controller.signal); }} disabled={loading || customPeriodIncomplete}><RefreshCw aria-hidden="true" />Actualizar</Button></div></header>
    <Card><CardContent className="grid gap-4 pt-5 md:grid-cols-2 xl:grid-cols-3 md:items-end"><label className="grid gap-2 text-sm font-medium text-foreground">Período<select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={periodPreset} onChange={(event) => selectPeriod(event.target.value as ReportingPeriodPreset)}>{PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="grid gap-2 text-sm font-medium text-foreground">Moneda<select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={currencyCode} onChange={(event) => { setCurrencyCode(event.target.value); setTaxGroupFilter("ALL"); setPage(1); }}><option value="ALL">Todas</option><option value="CRC">CRC</option><option value="USD">USD</option></select></label><label className="grid gap-2 text-sm font-medium text-foreground">Tarifa / impuesto<select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={taxGroupFilter} onChange={(event) => { setTaxGroupFilter(event.target.value); setPage(1); }}><option value="ALL">Todos</option>{taxGroupOptions.map((group) => <option key={`${group.taxCode}\u0000${group.rateCode ?? ""}\u0000${group.rate}`} value={`${group.taxCode}\u0000${group.rateCode ?? ""}\u0000${group.rate}`}>{group.rate}% · {group.taxCode}{group.rateCode ? ` / ${group.rateCode}` : ""}</option>)}</select></label>{periodPreset === "CUSTOM" ? <div className="grid gap-4 sm:grid-cols-2 xl:col-span-3"><label className="grid gap-2 text-sm font-medium text-foreground">Desde<Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></label><label className="grid gap-2 text-sm font-medium text-foreground">Hasta<Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></label></div> : <p className="pb-2 text-sm text-muted-foreground xl:col-span-3">El período se resuelve con la zona horaria fiscal del tenant.</p>}</CardContent></Card>
    {customPeriodIncomplete ? <Card><CardContent className="py-10 text-center"><p className="text-sm text-muted-foreground">Seleccione Desde y Hasta para consultar un período personalizado.</p></CardContent></Card> : null}
    {loading && !customPeriodIncomplete ? <Card><CardContent className="grid min-h-[260px] place-items-center"><LoadingSpinner message="Cargando reporte de impuestos…" /></CardContent></Card> : null}
    {error ? <Card className="border-destructive/40"><CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center"><AlertCircle className="size-8 text-destructive" aria-hidden="true" /><div><h2 className="font-semibold">No se pudo cargar el reporte</h2><p className="mt-1 text-sm text-muted-foreground">{error}</p></div><Button type="button" variant="outline" onClick={() => { const controller = new AbortController(); void load(controller.signal); }}>Intentar nuevamente</Button></CardContent></Card> : null}
    {!loading && !error && result && result.currencies.length === 0 ? <Card><CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center"><FileText className="size-8 text-muted-foreground" aria-hidden="true" /><p className="text-sm text-muted-foreground">No hay documentos fiscales aceptados con impuestos para el período seleccionado.</p></CardContent></Card> : null}
    {!loading && !error && result && result.currencies.length > 0 ? <>{result.headerTotalsScope === "DOCUMENTS_MATCHING_TAX_FILTER" ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="note">Los totales de cabecera corresponden al documento completo de los documentos que contienen la tarifa seleccionada; los grupos muestran únicamente las líneas coincidentes.</p> : null}<section className="grid gap-4 lg:grid-cols-2" aria-label="Resumen de impuestos por moneda">{result.currencies.map((summary) => <TaxCurrencyCard key={summary.currencyCode} summary={summary} />)}</section><Card className="overflow-hidden"><CardHeader><div><CardTitle>Detalle de documentos</CardTitle><p className="mt-1 text-sm text-muted-foreground">{pageLabel}</p></div></CardHeader><div className="overflow-x-auto"><Table className="min-w-[1050px]"><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Documento</TableHead><TableHead>Cliente / identificación</TableHead><TableHead>Moneda</TableHead><TableHead className="text-right">Ventas gravadas</TableHead><TableHead className="text-right">Exentas</TableHead><TableHead className="text-right">Exoneradas</TableHead><TableHead className="text-right">Impuesto</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Efecto</TableHead></TableRow></TableHeader><TableBody>{result.documents.map((document) => <TableRow key={document.documentId}><TableCell className="whitespace-nowrap">{formatFiscalDate(document.issuedOn)}</TableCell><TableCell className="font-medium">{document.documentNumber}</TableCell><TableCell className="max-w-56 whitespace-normal">{customerLabel(document.customer)}</TableCell><TableCell>{document.currencyCode}</TableCell><TableCell className="text-right tabular-nums">{formatFinanceMoneyDisplay(document.taxableSales, document.currencyCode)}</TableCell><TableCell className="text-right tabular-nums">{formatFinanceMoneyDisplay(document.exemptSales, document.currencyCode)}</TableCell><TableCell className="text-right tabular-nums">{formatFinanceMoneyDisplay(document.exoneratedSales, document.currencyCode)}</TableCell><TableCell className="text-right tabular-nums">{formatFinanceMoneyDisplay(document.taxCollected, document.currencyCode)}</TableCell><TableCell className="text-right font-medium tabular-nums">{formatFinanceMoneyDisplay(document.total, document.currencyCode)}</TableCell><TableCell><Badge variant={document.effect === "INCREASE" ? "outline" : "secondary"}>{effectLabel(document.effect)}</Badge></TableCell></TableRow>)}</TableBody></Table></div><div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">{pageLabel}</p><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={result.pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft aria-hidden="true" />Anterior</Button><Button type="button" size="sm" variant="outline" disabled={result.pagination.totalPages === 0 || result.pagination.page >= result.pagination.totalPages} onClick={() => setPage((current) => Math.min(result.pagination.totalPages, current + 1))}>Siguiente<ChevronRight aria-hidden="true" /></Button></div></div></Card></> : null}
  </div></main>;
}

export default function SalesTaxReportPage() {
  return <ReportRouteGuard reportKey="SALES_TAX"><SalesTaxReportPageContent /></ReportRouteGuard>;
}

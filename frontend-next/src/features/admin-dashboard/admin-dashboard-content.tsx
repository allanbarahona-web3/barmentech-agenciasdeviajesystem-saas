"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatFinanceMoneyDisplay } from "@/lib/finance-money-display";
import { formatBusinessDate } from "@/shared/regional";
import { getAdminDashboard, type AdminDashboardPeriod, type AdminDashboardResponse, type DashboardCurrencyAmount } from "./admin-dashboard-api";

type Props = { onOpenSettings: () => void };

const PERIOD_OPTIONS: Array<{ value: AdminDashboardPeriod; label: string }> = [
  { value: "TODAY", label: "Hoy" },
  { value: "LAST_7_DAYS", label: "Últimos 7 días" },
  { value: "LAST_30_DAYS", label: "Últimos 30 días" },
  { value: "THIS_MONTH", label: "Este mes" },
  { value: "CUSTOM", label: "Rango personalizado" },
];

const DASHBOARD_CURRENCIES = ["USD", "CRC"] as const;

function amountForCurrency<T extends { currencyCode: string }>(rows: T[], currency: string | null) {
  return currency ? rows.find((row) => row.currencyCode === currency) ?? null : null;
}

function currenciesFor(data: AdminDashboardResponse): string[] {
  return [...new Set([
    ...data.receivables.outstandingByCurrency.map((row) => row.currencyCode),
    ...data.receivables.overdueByCurrency.map((row) => row.currencyCode),
    ...data.payments.receivedByCurrency.map((row) => row.currencyCode),
    ...data.commercial.contractedSales.totalByCurrency.map((row) => row.currencyCode),
    ...data.commercial.averageContractTicketByCurrency.map((row) => row.currencyCode),
    ...data.fiscal.netSalesByCurrency.map((row) => row.currencyCode),
    ...data.sales.totalByCurrency.map((row) => row.currencyCode),
    ...data.operationalCosts.actualByCurrency.map((row) => row.currencyCode),
    ...data.dailyPayments.map((row) => row.currencyCode),
    ...data.topOverdueCustomers.map((row) => row.currencyCode),
  ])].sort();
}

function hasDashboardData(data: AdminDashboardResponse): boolean {
  return data.receivables.outstandingByCurrency.length > 0
    || data.receivables.overdueByCurrency.length > 0
    || data.payments.receivedByCurrency.length > 0
    || data.commercial.contractedSales.totalByCurrency.length > 0
    || data.commercial.averageContractTicketByCurrency.length > 0
    || data.fiscal.netSalesByCurrency.length > 0
    || data.sales.totalByCurrency.length > 0
    || data.operationalCosts.actualByCurrency.length > 0
    || data.dailyPayments.length > 0
    || data.topOverdueCustomers.length > 0
    || data.receivables.openCount > 0
    || data.receivables.overdueCount > 0
    || data.payments.receivedCount > 0
    || data.payments.pendingVerificationCount > 0
    || data.fiscal.submittedDocumentCount > 0
    || data.fiscal.acceptedDocumentCount > 0
    || data.sales.orderCount > 0
    || data.operations.activeTripsCount > 0
    || data.operations.activePassengersCount > 0
    || data.commercial.passengerTrend.length > 0;
}

function money(value: string | undefined, currency: string | null): string {
  return value && currency ? formatFinanceMoneyDisplay(value, currency) : "No disponible";
}

function dayLabel(value: string): string {
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : value;
}

function monthLabel(value: string): string {
  const parts = value.split("-");
  return parts.length === 2 ? `${parts[1]}/${parts[0].slice(2)}` : value;
}

function MetricCard({ title, value, detail, tone = "default", prominent = false, className = "" }: {
  title: string;
  value: string;
  detail: string;
  tone?: "default" | "risk" | "success" | "warning";
  prominent?: boolean;
  className?: string;
}) {
  const toneClass = tone === "risk" ? "border-destructive/45" : tone === "success" ? "border-success/40" : tone === "warning" ? "border-warning/45" : "";
  const valueClass = tone === "risk" ? "text-destructive" : tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";

  return <Card className={`${toneClass} ${className}`}>
    <CardHeader className={prominent ? "pb-2" : "pb-1.5"}>
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
    </CardHeader>
    <CardContent className={prominent ? "pb-5" : "pb-4"}>
      <p className={`${prominent ? "text-3xl sm:text-[2rem]" : "text-2xl"} font-semibold tracking-tight tabular-nums ${valueClass}`}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </CardContent>
  </Card>;
}

function SecondaryMetric({ title, value, detail, className = "" }: { title: string; value: string; detail: string; className?: string }) {
  return <article className={`min-w-0 border-b border-border py-4 last:border-b-0 md:border-b-0 md:border-l md:px-4 md:first:border-l-0 md:first:pl-0 ${className}`}>
    <p className="text-sm font-medium text-muted-foreground">{title}</p>
    <p className="mt-2 truncate text-xl font-semibold tracking-tight tabular-nums text-foreground" title={value}>{value}</p>
    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{detail}</p>
  </article>;
}

function DailyPaymentsChart({ data, currency }: { data: AdminDashboardResponse["dailyPayments"]; currency: string | null }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const points = data.filter((item) => item.currencyCode === currency);
  const amounts = points.map((point) => Number(point.amount)).filter(Number.isFinite);
  const maximum = Math.max(...amounts, 0);
  const width = 640, height = 202, left = 54, right = 18, top = 14, bottom = 32;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const coordinates = points.map((point, index) => ({
    ...point,
    x: points.length <= 1 ? left + chartWidth / 2 : left + (chartWidth * index) / (points.length - 1),
    y: top + chartHeight - ((maximum > 0 ? Number(point.amount) / maximum : 0) * chartHeight),
  }));
  const path = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const active = activeIndex === null ? null : coordinates[activeIndex];

  const labelEvery = Math.max(1, Math.ceil(coordinates.length / 5));

  return <Card className="relative overflow-hidden">
    <CardHeader className="flex-row items-start justify-between pb-2">
      <div><CardTitle>Pagos diarios</CardTitle><CardDescription>Serie diaria del período · {currency ?? "sin moneda disponible"}</CardDescription></div>
      {currency ? <Badge variant="outline">{currency}</Badge> : null}
    </CardHeader>
    <CardContent className="pb-4">
      {points.length === 0 ? <div className="flex min-h-44 items-center justify-center border border-dashed border-border bg-muted/20 px-6 text-center text-sm text-muted-foreground">No hay pagos diarios para la moneda seleccionada en este período.</div> : <div className="relative" aria-label={`Gráfico de pagos diarios en ${currency}`} onMouseLeave={() => setActiveIndex(null)}>
        <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-describedby="daily-payments-chart-description">
          <desc id="daily-payments-chart-description">Serie diaria de pagos recibidos para la moneda seleccionada. Use tabulación y Enter o la barra espaciadora sobre un punto para consultar su importe exacto.</desc>
          {[0, 1 / 3, 2 / 3, 1].map((value) => <line key={value} x1={left} x2={width - right} y1={top + chartHeight * value} y2={top + chartHeight * value} className="stroke-border" strokeWidth="1" />)}
          <line x1={left} x2={left} y1={top} y2={top + chartHeight} className="stroke-muted-foreground" strokeWidth="1" />
          <line x1={left} x2={width - right} y1={top + chartHeight} y2={top + chartHeight} className="stroke-muted-foreground" strokeWidth="1" />
          <text x={left - 8} y={top + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">{maximum > 0 ? money(maximum.toFixed(2), currency) : currency}</text>
          <text x={left - 8} y={top + chartHeight + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">0</text>
          <path d={path} fill="none" className="stroke-primary" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {coordinates.map((point, index) => <g key={`${point.date}-${point.currencyCode}`}>
            {activeIndex === index ? <circle cx={point.x} cy={point.y} r="7" className="fill-primary/10 stroke-primary" strokeWidth="1" /> : null}
            <circle cx={point.x} cy={point.y} r="10" fill="transparent" tabIndex={0} role="button" aria-pressed={activeIndex === index} aria-label={`${formatBusinessDate(point.date)}: ${money(point.amount, currency)}, ${point.paymentCount} pagos`} onClick={() => setActiveIndex(index)} onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} onBlur={() => setActiveIndex(null)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveIndex(index); } }} />
            <circle cx={point.x} cy={point.y} r={activeIndex === index ? "4.5" : "3.5"} className="fill-card stroke-primary" strokeWidth="2" />
            {(index === 0 || index === coordinates.length - 1 || index % labelEvery === 0) ? <text x={point.x} y={height - 9} textAnchor="middle" className="fill-muted-foreground text-[10px]">{dayLabel(point.date)}</text> : null}
          </g>)}
        </svg>
        {active ? <div role="tooltip" className="pointer-events-none absolute top-2 z-10 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-ui-xs" style={{ left: `${Math.min(70, Math.max(8, ((active.x / width) * 100)))}%` }}><p className="font-medium">{formatBusinessDate(active.date)}</p><p className="mt-1 tabular-nums text-muted-foreground">{money(active.amount, currency)} · {active.paymentCount} pagos</p></div> : null}
      </div>}
    </CardContent>
  </Card>;
}

function PassengerTrendChart({ data }: { data: AdminDashboardResponse["commercial"]["passengerTrend"] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const maximum = Math.max(...data.map((point) => point.passengerCount), 0);
  const width = 640, height = 178, left = 38, right = 16, top = 14, bottom = 30;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const coordinates = data.map((point, index) => ({
    ...point,
    x: data.length <= 1 ? left + chartWidth / 2 : left + (chartWidth * index) / (data.length - 1),
    y: top + chartHeight - ((maximum > 0 ? point.passengerCount / maximum : 0) * chartHeight),
  }));
  const path = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const active = activeIndex === null ? null : coordinates[activeIndex];
  const labelEvery = Math.max(1, Math.ceil(coordinates.length / 6));
  const middle = Math.ceil(maximum / 2);

  return <Card className="relative overflow-hidden">
    <CardHeader className="pb-2"><CardTitle>Evolución de pasajeros contratados</CardTitle><CardDescription>Adquisición comercial mensual · últimos 12 meses</CardDescription></CardHeader>
    <CardContent className="pb-4">
      {data.length === 0 ? <div className="flex min-h-40 items-center justify-center border border-dashed border-border bg-muted/20 px-6 text-center text-sm text-muted-foreground">No hay participaciones contratadas para mostrar en los últimos 12 meses.</div> : <div className="relative" aria-label="Gráfico de evolución de pasajeros contratados" onMouseLeave={() => setActiveIndex(null)}>
        <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-describedby="passenger-trend-chart-description">
          <desc id="passenger-trend-chart-description">Serie mensual de participaciones de pasajeros que se contrataron comercialmente. Use tabulación y Enter o la barra espaciadora sobre un punto para consultar su valor exacto.</desc>
          {[0, 0.5, 1].map((value) => <line key={value} x1={left} x2={width - right} y1={top + chartHeight * value} y2={top + chartHeight * value} className="stroke-border" strokeWidth="1" />)}
          <line x1={left} x2={left} y1={top} y2={top + chartHeight} className="stroke-muted-foreground" strokeWidth="1" />
          <line x1={left} x2={width - right} y1={top + chartHeight} y2={top + chartHeight} className="stroke-muted-foreground" strokeWidth="1" />
          <text x={left - 7} y={top + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">{maximum}</text>
          <text x={left - 7} y={top + chartHeight / 2 + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">{middle}</text>
          <text x={left - 7} y={top + chartHeight + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">0</text>
          <path d={path} fill="none" className="stroke-primary" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {coordinates.map((point, index) => <g key={point.month}>
            {activeIndex === index ? <circle cx={point.x} cy={point.y} r="7" className="fill-primary/10 stroke-primary" strokeWidth="1" /> : null}
            <circle cx={point.x} cy={point.y} r="10" fill="transparent" tabIndex={0} role="button" aria-pressed={activeIndex === index} aria-label={`${monthLabel(point.month)}: ${point.passengerCount} pasajeros contratados`} onClick={() => setActiveIndex(index)} onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} onBlur={() => setActiveIndex(null)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveIndex(index); } }} />
            <circle cx={point.x} cy={point.y} r={activeIndex === index ? "4.5" : "3.5"} className="fill-card stroke-primary" strokeWidth="2" />
            {(index === 0 || index === coordinates.length - 1 || index % labelEvery === 0) ? <text x={point.x} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[9px]">{monthLabel(point.month)}</text> : null}
          </g>)}
        </svg>
        {active ? <div role="tooltip" className="pointer-events-none absolute top-2 z-10 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-ui-xs" style={{ left: `${Math.min(70, Math.max(8, ((active.x / width) * 100)))}%` }}><p className="font-medium">{monthLabel(active.month)}</p><p className="mt-1 tabular-nums text-muted-foreground">{active.passengerCount} pasajeros contratados</p></div> : null}
      </div>}
    </CardContent>
  </Card>;
}

function OverdueCustomers({ rows, currency }: { rows: AdminDashboardResponse["topOverdueCustomers"]; currency: string | null }) {
  const customers = rows.filter((row) => row.currencyCode === currency);
  return <Card className="xl:self-start">
    <CardHeader className="pb-3"><CardTitle>Clientes con mayor saldo vencido</CardTitle><CardDescription>Top de cuentas vencidas · {currency ?? "sin moneda disponible"}</CardDescription></CardHeader>
    <CardContent className="pb-4">
      {customers.length === 0 ? <p className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">No hay clientes vencidos para la moneda seleccionada.</p> : <>
        <div className="hidden md:block"><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead className="text-right">Cuentas</TableHead><TableHead className="text-right">Saldo vencido</TableHead></TableRow></TableHeader><TableBody>{customers.map((customer) => <TableRow key={`${customer.currencyCode}-${customer.customerId}`}><TableCell className="max-w-48 truncate font-medium" title={customer.customerName}>{customer.customerName}</TableCell><TableCell className="text-right tabular-nums text-muted-foreground">{customer.receivableCount}</TableCell><TableCell className="whitespace-nowrap text-right font-semibold tabular-nums text-destructive">{money(customer.outstandingAmount, currency)}</TableCell></TableRow>)}</TableBody></Table></div>
        <ul className="space-y-3 md:hidden">{customers.map((customer) => <li className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0" key={`${customer.currencyCode}-${customer.customerId}`}><div className="min-w-0"><p className="truncate font-medium">{customer.customerName}</p><p className="mt-1 text-xs text-muted-foreground">{customer.receivableCount} cuentas</p></div><p className="shrink-0 text-right text-sm font-semibold tabular-nums text-destructive">{money(customer.outstandingAmount, currency)}</p></li>)}</ul>
      </>}
    </CardContent>
  </Card>;
}

function DashboardSkeleton() {
  return <div className="space-y-6" aria-label="Cargando dashboard administrativo"><div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between"><div className="space-y-2"><Skeleton className="h-5 w-44" /><Skeleton className="h-4 w-80" /></div><Skeleton className="h-9 w-32" /></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1.35fr_1fr]">{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-32" key={index} />)}</div><div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton className="h-24" key={index} />)}</div><div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(380px,1fr)]"><Skeleton className="h-64" /><Skeleton className="h-56" /></div></div>;
}

export function AdminDashboardContent({ onOpenSettings }: Props) {
  const [period, setPeriod] = useState<AdminDashboardPeriod>("THIS_MONTH");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<AdminDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<string>("USD");

  const load = useCallback(async (signal?: AbortSignal) => {
    if (period === "CUSTOM" && (!dateFrom || !dateTo || dateFrom > dateTo)) {
      setData(null); setLoading(false); setError(null); return;
    }
    setLoading(true); setError(null);
    try {
      const response = await getAdminDashboard({ period, ...(period === "CUSTOM" ? { dateFrom, dateTo } : {}) }, signal);
      setData(response);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el dashboard administrativo.");
      setData(null);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [period, dateFrom, dateTo]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const currencies = useMemo(() => data ? [...new Set([...DASHBOARD_CURRENCIES, ...currenciesFor(data)])] : [], [data]);
  const outstanding = data ? amountForCurrency(data.receivables.outstandingByCurrency, selectedCurrency) : null;
  const overdue = data ? amountForCurrency(data.receivables.overdueByCurrency, selectedCurrency) : null;
  const received = data ? amountForCurrency(data.payments.receivedByCurrency, selectedCurrency) : null;
  const contractedSales = data ? amountForCurrency(data.commercial.contractedSales.totalByCurrency, selectedCurrency) : null;
  const fiscalNetSales = data ? amountForCurrency(data.fiscal.netSalesByCurrency, selectedCurrency) : null;
  const averageContractTicket = data ? amountForCurrency(data.commercial.averageContractTicketByCurrency, selectedCurrency) : null;
  const sales = data ? amountForCurrency(data.sales.totalByCurrency, selectedCurrency) : null;
  const costs = data && selectedCurrency ? data.operationalCosts.actualByCurrency.find((row) => row.currencyCode === selectedCurrency) ?? null : null;
  const customNeedsRange = period === "CUSTOM" && (!dateFrom || !dateTo || dateFrom > dateTo);

  return <main className="app-shell"><div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:py-7">
    <header className="flex flex-col gap-5 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-medium tracking-[0.12em] text-muted-foreground">ADMINISTRACIÓN</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Dashboard</h1><p className="mt-2 text-sm text-muted-foreground">Resumen ejecutivo para el período seleccionado.</p></div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4"><label className="grid w-full gap-1.5 text-sm font-medium text-foreground sm:w-56">Período<Select aria-label="Período del dashboard" value={period} onChange={(event) => setPeriod(event.target.value as AdminDashboardPeriod)}>{PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></label><div className="sm:border-l sm:border-border sm:pl-4"><Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onOpenSettings}><Settings2 aria-hidden="true" />Configuración</Button></div></div>
    </header>
    {period === "CUSTOM" ? <div className="flex flex-col gap-3 border border-border bg-muted/20 p-4 sm:flex-row sm:items-end"><label className="grid gap-1.5 text-sm font-medium">Desde<Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-medium">Hasta<Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>{dateFrom && dateTo && dateFrom > dateTo ? <p className="text-sm text-destructive">La fecha inicial debe ser anterior o igual a la final.</p> : null}</div> : null}
    {loading ? <DashboardSkeleton /> : customNeedsRange ? <Card><CardContent className="py-8 text-sm text-muted-foreground">Seleccione una fecha inicial y final válidas para consultar el rango personalizado.</CardContent></Card> : error ? <Card className="border-destructive/40"><CardContent className="flex flex-col items-start gap-4 py-7"><div><p className="font-semibold text-foreground">No se pudo cargar el dashboard</p><p className="mt-1 text-sm text-muted-foreground">{error}</p></div><Button type="button" variant="outline" onClick={() => void load()}><RefreshCw aria-hidden="true" />Reintentar</Button></CardContent></Card> : data && !hasDashboardData(data) ? <Card><CardContent className="py-9"><p className="font-semibold text-foreground">No hay datos para este período</p><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Ajuste el período para consultar información disponible. La ausencia de datos no se presenta como un importe en cero.</p></CardContent></Card> : data ? <>
      <section className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between" aria-labelledby="financial-attention-title"><div><h2 id="financial-attention-title" className="text-base font-semibold">Resumen ejecutivo</h2><p className="mt-1 text-sm text-muted-foreground">Los importes se muestran por moneda; no se suman ni convierten.</p></div>{currencies.length > 0 ? <div className="shrink-0"><p className="mb-1.5 text-xs font-medium text-muted-foreground">Moneda (filtro)</p><div className="flex w-fit rounded-md border border-border p-0.5" role="group" aria-label="Filtrar importes por moneda">{currencies.map((currency) => <Button key={currency} type="button" size="sm" variant={selectedCurrency === currency ? "default" : "ghost"} aria-pressed={selectedCurrency === currency} onClick={() => setSelectedCurrency(currency)}>{currency}</Button>)}</div></div> : <Badge variant="outline">Sin moneda disponible</Badge>}</section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.35fr_1.35fr_1fr_1fr]" aria-label="Indicadores ejecutivos principales"><MetricCard prominent title="Ventas contratadas" value={money(contractedSales?.amount, selectedCurrency)} detail={contractedSales ? `${contractedSales.count} contratos aprobados` : "Sin contratos aprobados para la moneda seleccionada"} /><MetricCard prominent title="Ventas facturadas" value={money(fiscalNetSales?.amount, selectedCurrency)} detail={fiscalNetSales ? "Ventas fiscales netas aceptadas" : "Sin ventas fiscales netas para la moneda seleccionada"} /><MetricCard title="Cuentas por cobrar" value={money(outstanding?.amount, selectedCurrency)} detail={`${data.receivables.openCount} cuentas abiertas`} /><MetricCard title="Vencido" value={money(overdue?.amount, selectedCurrency)} detail={`${data.receivables.overdueCount} cuentas vencidas`} tone="risk" /></section>
      <section aria-labelledby="dashboard-secondary-title"><div className="mb-2"><h2 id="dashboard-secondary-title" className="text-base font-semibold">Actividad comercial y caja</h2><p className="mt-1 text-sm text-muted-foreground">Indicadores del período seleccionado.</p></div><div className="grid border-y border-border md:grid-cols-2 xl:grid-cols-4"><SecondaryMetric title="Ticket promedio" value={money(averageContractTicket?.amount, selectedCurrency)} detail={averageContractTicket ? `por ${averageContractTicket.obligationCount} contratos aprobados` : "Sin contratos para la moneda seleccionada"} /><SecondaryMetric title="Pagos recibidos" value={money(received?.amount, selectedCurrency)} detail={`${data.payments.receivedCount} pagos recibidos en el período`} /><SecondaryMetric title="Pendientes de verificación" value={String(data.payments.pendingVerificationCount)} detail="pagos pendientes de verificación" /><SecondaryMetric title="Órdenes de venta" value={String(data.sales.orderCount)} detail={sales ? money(sales.amount, selectedCurrency) : "Sin órdenes para la moneda seleccionada"} /></div></section>
      <section aria-labelledby="dashboard-operations-title"><div className="mb-2"><h2 id="dashboard-operations-title" className="text-base font-semibold">Huella operativa</h2><p className="mt-1 text-sm text-muted-foreground">Viajes y pasajeros contratados actualmente en operación.</p></div><div className="grid border-y border-border md:grid-cols-3"><SecondaryMetric title="Viajes activos" value={String(data.operations.activeTripsCount)} detail="TravelPackages con estado OPEN" /><SecondaryMetric title="Pasajeros activos" value={String(data.operations.activePassengersCount)} detail="participaciones contratadas en viajes OPEN" /><SecondaryMetric title="Costos operativos reales" value={money(costs?.total, selectedCurrency)} detail={costs ? `${costs.purchaseCount} compras operativas` : "Sin costos para la moneda seleccionada"} /></div></section>
      <section className="grid items-start gap-4 xl:grid-cols-2"><DailyPaymentsChart data={data.dailyPayments} currency={selectedCurrency} /><PassengerTrendChart data={data.commercial.passengerTrend} /></section>
      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,1fr)]"><OverdueCustomers rows={data.topOverdueCustomers} currency={selectedCurrency} /><Card className="hidden xl:block"><CardHeader className="pb-2"><CardTitle>Documentos fiscales</CardTitle><CardDescription>Seguimiento de documentos del período</CardDescription></CardHeader><CardContent className="pb-4"><p className="text-2xl font-semibold tracking-tight tabular-nums">{data.fiscal.acceptedDocumentCount}</p><p className="mt-1 text-sm text-muted-foreground">aceptados de {data.fiscal.submittedDocumentCount} enviados</p></CardContent></Card></section>
      <p className="text-xs leading-5 text-muted-foreground">Período resuelto por backend: {formatBusinessDate(data.period.startOn)} — {formatBusinessDate(data.period.endOn)} · Zona fiscal: {data.period.timezone}</p>
    </> : null}
  </div></main>;
}

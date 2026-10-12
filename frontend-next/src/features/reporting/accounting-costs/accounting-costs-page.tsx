"use client";
import Link from "next/link";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportRouteGuard } from "@/features/reporting/report-route-guard";
import { AccountingCostsTabs } from "./accounting-costs-tabs";
import { OperationalCostsReport } from "./operational-costs-report";
function Content() { const [refreshToken, setRefreshToken] = useState(0); return <main className="app-shell"><div className="mx-auto w-full max-w-7xl space-y-6"><header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground">Reporting Engine · Costos</p><h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Costos reales</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Egresos reales por fuente.</p></div><div className="flex flex-wrap items-center gap-2"><Button asChild type="button" variant="outline"><Link href="/reports">Volver a reportes</Link></Button><Button type="button" variant="outline" onClick={() => setRefreshToken((value) => value + 1)}><RefreshCw />Actualizar</Button></div></header><AccountingCostsTabs /><OperationalCostsReport refreshToken={refreshToken} /></div></main>; }
export function AccountingCostsPage() { return <ReportRouteGuard reportKey="ACCOUNTING_COSTS"><Content /></ReportRouteGuard>; }

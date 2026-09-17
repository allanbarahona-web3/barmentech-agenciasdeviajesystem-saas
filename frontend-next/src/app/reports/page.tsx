"use client";

import Link from "next/link";
import { BarChart3, FileText, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportRouteGuard } from "@/features/reporting/report-route-guard";
import { getStoredSession } from "@/lib/auth-api";
import { reportsForRole, type ReportPresentation } from "@/features/reporting/report-registry";

export default function ReportsHomePage() {
  const [reports, setReports] = useState<readonly ReportPresentation[]>([]);

  useEffect(() => {
    setReports(reportsForRole(getStoredSession()?.user?.role));
  }, []);

  return <ReportRouteGuard><main className="app-shell"><div className="mx-auto w-full max-w-7xl space-y-6">
    <header>
      <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground">Reporting Engine</p>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Reportes</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Consulte información fiscal aceptada sin modificar datos operativos.</p>
    </header>
    <section className="grid gap-4 md:grid-cols-2" aria-label="Reportes disponibles">
      {reports.map((report) => <Card key={report.key} className={!report.available ? "bg-muted/30" : undefined}>
        <CardHeader>
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{report.key === "SALES" ? <BarChart3 aria-hidden="true" /> : <FileText aria-hidden="true" />}</div>
          {!report.available ? <Lock className="size-4 text-muted-foreground" aria-label="Próximamente" /> : null}
        </CardHeader>
        <CardContent><CardTitle>{report.title}</CardTitle><p className="mt-2 text-sm leading-6 text-muted-foreground">{report.description}</p></CardContent>
        <CardFooter>{report.available && report.href ? <Button asChild><Link href={report.href}>Abrir reporte</Link></Button> : <Button disabled variant="outline">Próximamente</Button>}</CardFooter>
      </Card>)}</section>
  </div></main></ReportRouteGuard>;
}

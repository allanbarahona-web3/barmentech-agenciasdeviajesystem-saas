import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFinanceMoneyDisplay } from "@/lib/finance-money-display";
import type { AccountingCostsReport } from "@/lib/accounting-costs-reporting-api";
import type { AccountingCostsMonetaryView } from "./accounting-costs-monetary-view";

function Amount({ label, value, currency }: { label: string; value: string; currency: string }) {
  return <div className="flex justify-between gap-3 border-b border-border/70 py-2 last:border-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="tabular-nums font-medium">{formatFinanceMoneyDisplay(value, currency)}</dd></div>;
}

export function AccountingCostsSummary({ summaries, monetaryView }: { summaries: AccountingCostsReport["summaries"]; monetaryView: AccountingCostsMonetaryView }) {
  if (monetaryView === "ORIGINAL") return <section className="grid gap-4 lg:grid-cols-2" aria-label="Resumen original por moneda">{summaries.byCurrency.map((summary) => <Card key={summary.currency}><CardHeader><div><p className="text-xs font-medium tracking-wide text-muted-foreground">Moneda original</p><CardTitle className="mt-1 text-lg">{summary.currency}</CardTitle></div><Badge variant="outline">{summary.count} compras</Badge></CardHeader><CardContent><dl><Amount label="Subtotal" value={summary.subtotal} currency={summary.currency} /><Amount label="Impuesto" value={summary.tax} currency={summary.currency} /><Amount label="Total" value={summary.total} currency={summary.currency} /></dl></CardContent></Card>)}</section>;
  const base = summaries.baseByCurrency.length ? summaries.baseByCurrency : [summaries.base];
  return <section className="space-y-4" aria-label="Resumen en moneda contable"><div className="grid gap-4 lg:grid-cols-2">{base.map((summary) => <Card key={summary.baseCurrency || "unconfigured"}><CardHeader><div><p className="text-xs font-medium tracking-wide text-muted-foreground">Moneda contable</p><CardTitle className="mt-1 text-lg">{summary.baseCurrency || "No configurada"}</CardTitle></div><Badge variant="outline">{summary.countConverted} compras convertidas</Badge></CardHeader><CardContent><dl><Amount label="Subtotal" value={summary.subtotal} currency={summary.baseCurrency || "USD"} /><Amount label="Impuesto" value={summary.tax} currency={summary.baseCurrency || "USD"} /><Amount label="Total" value={summary.total} currency={summary.baseCurrency || "USD"} /></dl></CardContent></Card>)}</div>{base.length > 1 ? <Alert><AlertDescription>Las compras históricas usan más de una moneda contable; los totales se muestran separados.</AlertDescription></Alert> : null}{summaries.base.isPartial ? <Alert variant="warning"><AlertDescription>Resumen parcial: faltan conversiones para algunas compras ({summaries.base.missingConversionCount}){summaries.base.invalidSnapshotCount ? `; ${summaries.base.invalidSnapshotCount} con snapshot de TC inválido.` : "."}</AlertDescription></Alert> : null}</section>;
}

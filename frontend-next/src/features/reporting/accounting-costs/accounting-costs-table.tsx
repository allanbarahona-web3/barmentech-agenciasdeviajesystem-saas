"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatFinanceMoneyDisplay } from "@/lib/finance-money-display";
import type { AccountingCostRow, AccountingCostsReport } from "@/lib/accounting-costs-reporting-api";
import { useTenantDateTimeFormatter } from "@/shared/regional/tenant-regional-provider";
import { AccountingCostEvidenceDialog } from "./accounting-cost-evidence-dialog";
import type { AccountingCostsMonetaryView } from "./accounting-costs-monetary-view";

const purpose: Record<string, string> = { AIRFARE: "Aéreo / Boleto aéreo", LODGING: "Hospedaje", TOUR_ACTIVITY: "Tour / Actividad", TRANSPORTATION: "Transporte", GENERIC: "Otro servicio" };
const category: Record<string, string> = { BASE_TRIP: "Viaje base", ADDITIONAL_SERVICES: "Servicio adicional", CUSTOM_QUOTATION: "Cotización personalizada", OTHER: "Otro" };

function context(row: AccountingCostRow) {
  const value = row.context;
  if (value.sourceCategory === "CUSTOM_QUOTATION") return [value.customer?.name, value.quotation ? `${value.quotation.number ?? "Cotización"} · v${value.quotation.versionNumber}` : null, value.salesOrderNumber].filter(Boolean).join(" · ");
  return value.travelPackage ? `${value.travelPackage.code} · ${value.travelPackage.name}` : category[value.sourceCategory];
}

function fx(row: AccountingCostRow) {
  if (row.conversion.status === "FX_MISSING") return <span className="text-muted-foreground">TC no disponible</span>;
  if (row.conversion.status === "FX_SNAPSHOT_INVALID") return <span className="text-destructive">Snapshot TC inválido</span>;
  if (row.conversion.status === "IDENTITY") return "Identidad";
  return <span>{row.conversion.authority === "BCCR_REFERENCE_SELL_318" ? "BCCR" : "Manual"} · {row.conversion.exchangeRate}</span>;
}

function OriginalAmounts({ row }: { row: AccountingCostRow }) {
  return <><TableCell className="text-right tabular-nums">{formatFinanceMoneyDisplay(row.subtotal, row.currency)}</TableCell><TableCell className="text-right tabular-nums">{formatFinanceMoneyDisplay(row.tax, row.currency)}</TableCell><TableCell className="text-right font-medium tabular-nums">{formatFinanceMoneyDisplay(row.total, row.currency)}</TableCell><TableCell>{row.currency}</TableCell></>;
}

function BaseAmounts({ row }: { row: AccountingCostRow }) {
  const available = row.conversion.status === "IDENTITY" || row.conversion.status === "AVAILABLE";
  const baseCurrency = row.conversion.baseCurrency;
  const original = `Original: ${formatFinanceMoneyDisplay(row.total, row.currency)}`;
  return <><TableCell className="text-right tabular-nums">{available && row.conversion.subtotal ? formatFinanceMoneyDisplay(row.conversion.subtotal, baseCurrency) : "—"}</TableCell><TableCell className="text-right tabular-nums">{available && row.conversion.tax ? formatFinanceMoneyDisplay(row.conversion.tax, baseCurrency) : "—"}</TableCell><TableCell className="text-right font-medium tabular-nums">{available && row.conversion.total ? <><span>{formatFinanceMoneyDisplay(row.conversion.total, baseCurrency)}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{original}</span></> : <><span>—</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{original}</span></>}</TableCell><TableCell className="text-xs">{fx(row)}</TableCell></>;
}

export function AccountingCostsTable({ report, loading, monetaryView, onPage }: { report: AccountingCostsReport; loading: boolean; monetaryView: AccountingCostsMonetaryView; onPage: (page: number) => void }) {
  const formatDateTime = useTenantDateTimeFormatter();
  const [evidenceSourceId, setEvidenceSourceId] = useState<string | null>(null);
  const label = report.pagination.totalItems === 0 ? "0 compras" : `${(report.pagination.page - 1) * report.pagination.pageSize + 1}–${Math.min(report.pagination.page * report.pagination.pageSize, report.pagination.totalItems)} de ${report.pagination.totalItems} compras`;
  const monetaryHeaders = monetaryView === "ORIGINAL" ? ["Subtotal", "Impuesto", "Total", "Moneda"] : ["Subtotal base", "Impuesto base", "Total base", "TC"];
  return <><Card className="overflow-hidden"><CardHeader><div><CardTitle>Detalle de compras reales</CardTitle><p className="mt-1 text-sm text-muted-foreground">{label}</p></div></CardHeader><div className="overflow-x-auto"><Table className="min-w-[1350px]"><TableHeader><TableRow>{["Fecha", "Fuente", "Contexto", "Descripción", "Proveedor", ...monetaryHeaders, "Factura / referencia", "Estado", "Evidencia"].map((value) => <TableHead key={value} className={value.startsWith("Subtotal") || value.startsWith("Impuesto") || value.startsWith("Total") ? "text-right" : undefined}>{value}</TableHead>)}</TableRow></TableHeader><TableBody>{report.rows.map((row) => <TableRow key={row.sourceId}><TableCell className="whitespace-nowrap">{formatDateTime(row.sourceDate)}</TableCell><TableCell><Badge variant="outline">{category[row.context.sourceCategory]}</Badge></TableCell><TableCell className="max-w-52 whitespace-normal">{context(row)}</TableCell><TableCell className="max-w-56 whitespace-normal"><p>{row.description}</p><p className="mt-1 text-xs text-muted-foreground">{purpose[row.context.servicePurpose.code] ?? row.context.servicePurpose.name}</p></TableCell><TableCell>{row.counterparty.name}</TableCell>{monetaryView === "ORIGINAL" ? <OriginalAmounts row={row} /> : <BaseAmounts row={row} />}<TableCell className="max-w-44 whitespace-normal">{row.reference.documentNumber ?? row.reference.supplierReference ?? "Sin referencia"}</TableCell><TableCell><Badge variant={row.cancelled ? "destructive" : "secondary"}>{row.cancelled ? "Cancelado" : row.status}</Badge>{row.cancelled ? <p className="mt-1 text-xs text-muted-foreground">Compra registrada; gestión posteriormente cancelada</p> : null}</TableCell><TableCell>{row.evidence.available ? <Button type="button" size="sm" variant="outline" onClick={() => setEvidenceSourceId(row.sourceId)}><Paperclip aria-hidden="true" />Ver comprobantes ({row.evidence.count})</Button> : "—"}</TableCell></TableRow>)}</TableBody></Table></div><CardContent className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">{label}</p><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={loading || report.pagination.page <= 1} onClick={() => onPage(report.pagination.page - 1)}><ChevronLeft />Anterior</Button><Button type="button" size="sm" variant="outline" disabled={loading || report.pagination.page >= report.pagination.totalPages} onClick={() => onPage(report.pagination.page + 1)}>Siguiente<ChevronRight /></Button></div></CardContent></Card><AccountingCostEvidenceDialog sourceId={evidenceSourceId} open={Boolean(evidenceSourceId)} onOpenChange={(open) => { if (!open) setEvidenceSourceId(null); }} /></>;
}

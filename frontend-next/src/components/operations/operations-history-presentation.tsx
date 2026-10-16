'use client';

import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { OperationalServiceDetailFields, typedOperationalDetail } from '@/components/operations/operational-service-detail-fields';
import { operationalFieldLabel } from '@/lib/operations-presentation';
import { addFinanceMoneyDisplayValues, formatFinanceMoneyDisplay } from '@/lib/finance-money-display';
import { operationalEvidenceTypeLabel } from '@/lib/operations-presentation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export type TerminalHistoryStatus = 'CONFIRMED' | 'CANCELLED';

export function HistoryFilterBar({ children, className = 'md:grid-cols-3 xl:grid-cols-6' }: { children: ReactNode; className?: string }) {
  return <Card><CardContent className={`grid gap-3 py-4 ${className}`}>{children}</CardContent></Card>;
}

export function HistoryCustomDateControls({ dateFrom, dateTo, onDateFromChange, onDateToChange }: { dateFrom: string; dateTo: string; onDateFromChange: (value: string) => void; onDateToChange: (value: string) => void }) {
  return <><Input aria-label="Desde" type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} /><Input aria-label="Hasta" type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} /></>;
}

export function HistoryError({ message }: { message: string | null }) {
  return message ? <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert> : null;
}

export function HistoryTableShell({ title, description, icon, minWidth, children, footer }: { title: string; description?: string; icon?: ReactNode; minWidth?: string; children: ReactNode; footer?: ReactNode }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-2">{icon}{title}</CardTitle>{description ? <p className="text-sm text-muted-foreground">{description}</p> : null}</CardHeader><CardContent className="overflow-x-auto p-0"><div className={minWidth ? minWidth : undefined}>{children}</div>{footer}</CardContent></Card>;
}

export function HistoryTableStateRow({ colSpan, loading, emptyMessage }: { colSpan: number; loading: boolean; emptyMessage: string }) {
  return <tr><td colSpan={colSpan} className="py-10 text-center text-muted-foreground">{loading ? 'Cargando historial...' : emptyMessage}</td></tr>;
}

export function HistoryPagination({ total, totalLabel, page, totalPages, loading, onPrevious, onNext }: { total: number; totalLabel: string; page: number; totalPages: number; loading: boolean; onPrevious: () => void; onNext: () => void }) {
  if (totalPages <= 1) return null;
  return <div className="flex items-center justify-between border-t px-4 py-3 text-sm"><span className="text-muted-foreground">{total} {totalLabel}</span><div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" disabled={page <= 1 || loading} onClick={onPrevious}>Anterior</Button><span>Página {page} de {totalPages}</span><Button type="button" size="sm" variant="outline" disabled={page >= totalPages || loading} onClick={onNext}>Siguiente</Button></div></div>;
}

export function TerminalStatusBadge({ status }: { status: TerminalHistoryStatus }) {
  return <Badge variant={status === 'CONFIRMED' ? 'success' : 'destructive'}>{status === 'CONFIRMED' ? 'Confirmado' : 'Cancelado'}</Badge>;
}

export function HistoryDetailDialog({ title, description, loading, error, onClose, children }: { title: string; description: string; loading: boolean; error: string | null; onClose: () => void; children: ReactNode }) {
  return <Dialog open onOpenChange={(open) => { if (!open && !loading) onClose(); }}><DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{loading ? <p className="py-10 text-center text-sm text-muted-foreground">Cargando detalle...</p> : error ? <HistoryError message={error} /> : children}<DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cerrar</Button></DialogFooter></DialogContent></Dialog>;
}

export function HistoryMetadataGrid({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <div className={`mt-2 grid gap-3 rounded-lg border p-4 md:grid-cols-3${muted ? ' bg-muted/30' : ''}`}>{children}</div>;
}

export function HistoryInfo({ label, value }: { label: string; value: ReactNode }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{operationalFieldLabel(label)}</p><div className="mt-1 text-sm">{value}</div></div>;
}

export function HistoryTypedServiceDetails({ servicePurposeCode, detailVersion, detailPayload }: { servicePurposeCode: string; detailVersion: number | null; detailPayload: Record<string, unknown> | null }) {
  if (!detailPayload) return null;
  return <section><h3 className="font-semibold">Detalles operativos</h3><div className="mt-2 rounded-lg border p-4"><OperationalServiceDetailFields servicePurposeCode={servicePurposeCode} detailVersion={detailVersion} value={typedOperationalDetail(detailPayload, servicePurposeCode)} readOnly /></div></section>;
}

export function HistoryPurchaseCard({ providerName, supplierReference, amount, currency, taxAmount, purchasedAt, supplierInvoiceNumber, notes, formatDateTime }: { providerName: string; supplierReference: string | null; amount: string; currency: string; taxAmount: string | null; purchasedAt: string; supplierInvoiceNumber: string | null; notes: string | null; formatDateTime: (value: string) => string }) {
  const money = (value: string) => formatFinanceMoneyDisplay(value, currency);
  return <HistoryMetadataGrid><HistoryInfo label="Proveedor" value={providerName} /><HistoryInfo label="Referencia" value={supplierReference ?? '—'} /><HistoryInfo label="Subtotal" value={money(amount)} /><HistoryInfo label="Impuesto" value={money(taxAmount ?? '0')} /><HistoryInfo label="Total" value={money(addFinanceMoneyDisplayValues(amount, taxAmount))} /><HistoryInfo label="Fecha de compra" value={formatDateTime(purchasedAt)} /><HistoryInfo label="Factura del proveedor" value={supplierInvoiceNumber ?? '—'} />{notes ? <div className="md:col-span-3"><HistoryInfo label="Notas" value={notes} /></div> : null}</HistoryMetadataGrid>;
}

export function HistoryPurchaseEmpty() {
  return <p className="mt-2 rounded-lg border p-4 text-sm text-muted-foreground">No hay compra registrada para esta cancelación.</p>;
}

export function HistoryEvidenceRow({ fileName, mimeType, evidenceType, byteSize, purchaseId, onView }: { fileName: string; mimeType: string; evidenceType?: string; byteSize?: number; purchaseId: string | null; onView: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">{fileName} <span className="text-muted-foreground">· {purchaseId ? 'Evidencia de compra' : 'Evidencia operativa'}{evidenceType ? ` · ${operationalEvidenceTypeLabel(evidenceType)}` : ''} · {mimeType}{byteSize === undefined ? '' : ` · ${formatBytes(byteSize)}`}</span></span><Button type="button" size="sm" variant="outline" onClick={onView}><FileText aria-hidden="true" size={16} /> Abrir</Button></div>;
}

export function HistoryEvidenceEmpty() {
  return <p className="text-sm text-muted-foreground">No hay evidencia asociada.</p>;
}

export function HistoryTerminalState({ status, terminalAt, formatDateTime, confirmationReference, voucherReference, ticketReference, notes }: { status: TerminalHistoryStatus; terminalAt: string; formatDateTime: (value: string) => string; confirmationReference: string | null; voucherReference: string | null; ticketReference: string | null; notes: string | null }) {
  return <section><h3 className="font-semibold">Confirmación o cancelación</h3><HistoryMetadataGrid><HistoryInfo label="Estado final" value={<TerminalStatusBadge status={status} />} /><HistoryInfo label="Fecha final" value={formatDateTime(terminalAt)} /><HistoryInfo label="Confirmación" value={confirmationReference ?? '—'} /><HistoryInfo label="Voucher" value={voucherReference ?? '—'} /><HistoryInfo label="Boleto / ticket" value={ticketReference ?? '—'} />{notes ? <div className="md:col-span-3"><HistoryInfo label="Notas" value={notes} /></div> : null}</HistoryMetadataGrid></section>;
}

function formatBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AttachmentViewer, { type Attachment } from "@/components/attachment-viewer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatBusinessDate } from "@/shared/regional";
import { useTenantDateTimeFormatter } from "@/shared/regional/tenant-regional-provider";
import {
  getCostEvidenceAccess,
  listComponentMonetaryTimeline,
  listCostEvidence,
  listProjectMonetaryTimeline,
  overrideAdminAirfareDailyAuthority,
  type CostComposition,
  type CostMonetaryTimelineItem,
  type CostMonetaryTimelinePage,
  type CostingProject,
} from "@/lib/cost-engine-api";

const MONEY_PATTERN = /^\d+(?:\.\d{1,5})?$/;

type Props = {
  isOpen: boolean;
  project: CostingProject;
  composition: CostComposition | null;
  travel: { name: string };
  onClose: () => void;
  onCompositionChanged: () => Promise<void>;
};

export function AirfareEvolutionDialog({ isOpen, project, composition, travel, onClose, onCompositionChanged }: Props) {
  const formatTenantDateTime = useTenantDateTimeFormatter();
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const [page, setPage] = useState(1);
  const [timelinePage, setTimelinePage] = useState<CostMonetaryTimelinePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [overrideRow, setOverrideRow] = useState<CostMonetaryTimelineItem | null>(null);
  const [evidenceViewer, setEvidenceViewer] = useState<{ snapshotId: string; attachments: Attachment[] } | null>(null);
  const [evidenceLoadingSnapshotId, setEvidenceLoadingSnapshotId] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState("");
  const evidenceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const components = useMemo(() => composition?.components ?? [], [composition]);

  const loadTimeline = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = selectedComponentId
        ? await listComponentMonetaryTimeline(selectedComponentId, page, 20)
        : await listProjectMonetaryTimeline(project.id, page, 20);
      setTimelinePage(response);
    } catch (error) {
      setLoadError(message(error, "No se pudo cargar la evolución de costos."));
      setTimelinePage(null);
    } finally {
      setLoading(false);
    }
  }, [page, project.id, selectedComponentId]);

  useEffect(() => { if (isOpen) void loadTimeline(); }, [isOpen, loadTimeline]);

  const selectComponent = (value: string) => {
    setSelectedComponentId(value);
    setPage(1);
    setNotice("");
  };
  const refreshAfterOverride = async () => {
    await Promise.all([loadTimeline(), onCompositionChanged()]);
    setNotice("El ajuste de administrador fue registrado. El historial conserva las revisiones anteriores.");
    setOverrideRow(null);
  };
  const openEvidence = async (row: CostMonetaryTimelineItem, trigger: HTMLButtonElement) => {
    if (evidenceLoadingSnapshotId) return;
    evidenceTriggerRef.current = trigger;
    setEvidenceLoadingSnapshotId(row.snapshotId);
    setEvidenceError("");
    try {
      const response = await listCostEvidence(row.snapshotId);
      const attachments = response.evidence.map((evidence) => ({ id: evidence.id, originalFileName: evidence.originalFileName, mimeType: evidence.mimeType }));
      if (!attachments.length) throw new Error("No hay comprobantes adjuntos para esta revisión.");
      setEvidenceViewer({ snapshotId: row.snapshotId, attachments });
    } catch (error) {
      setEvidenceError(message(error, "No se pudo cargar el comprobante."));
    } finally {
      setEvidenceLoadingSnapshotId(null);
    }
  };
  const resolveEvidenceUrl = async (attachment: Attachment, _signal: AbortSignal) => {
    if (!evidenceViewer) throw new Error("No se pudo cargar el comprobante.");
    return (await getCostEvidenceAccess(evidenceViewer.snapshotId, attachment.id)).url;
  };
  const closeEvidenceViewer = useCallback(() => {
    setEvidenceViewer(null);
    window.requestAnimationFrame(() => evidenceTriggerRef.current?.focus());
  }, []);
  const events = timelinePage?.events ?? [];

  return <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent
      className="max-w-6xl"
      onEscapeKeyDown={(event) => { if (evidenceViewer) event.preventDefault(); }}
      onPointerDownOutside={(event) => { if (evidenceViewer) event.preventDefault(); }}
    >
      <DialogHeader><DialogTitle>Evolución de costos</DialogTitle><DialogDescription>Historial monetario del Cost Engine para {travel.name}.</DialogDescription></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-3"><SummaryItem label="Viaje / paquete" value={travel.name} /><SummaryItem label="Costo total autoritativo actual" value={exactMoney(composition?.authoritativeTotalCost ?? "0", project.baseCurrency)} /><SummaryItem label="Moneda base" value={project.baseCurrency} /></div>
      <div className="flex flex-col gap-3 border-y border-border py-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="block min-w-0 flex-1 text-sm font-medium">Componente
          <Select className="mt-1" value={selectedComponentId} onChange={(event) => selectComponent(event.target.value)} disabled={loading}>
            <option value="">Todos los componentes</option>
            {components.map((component) => <option key={component.id} value={component.id}>{component.title} · {component.costCategory.displayName}</option>)}
          </Select>
        </label>
        <p className="text-xs text-muted-foreground">Página {timelinePage?.page ?? page} · máximo 20 registros</p>
      </div>
      {notice ? <Alert variant="success"><AlertTitle>Actualización registrada</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
      {loadError ? <Alert variant="destructive"><AlertTitle>No se pudo cargar el historial</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert> : null}
      {evidenceError ? <Alert variant="destructive"><AlertDescription>{evidenceError}</AlertDescription></Alert> : null}
      <section className="min-h-64 space-y-3">
        {loading ? <p className="py-12 text-center text-sm text-muted-foreground">Cargando evolución de costos…</p> : null}
        {!loading && !loadError && events.length === 0 ? <EmptyHistory /> : null}
        {!loading && events.map((row) => <HistoryTimelineRow key={row.eventId} row={row} formatTenantDateTime={formatTenantDateTime} onOverride={() => setOverrideRow(row)} onEvidence={(trigger) => void openEvidence(row, trigger)} evidenceLoading={evidenceLoadingSnapshotId === row.snapshotId} />)}
      </section>
      <DialogFooter>
        {loadError ? <Button type="button" variant="outline" onClick={() => void loadTimeline()} disabled={loading}>Reintentar</Button> : null}
        <div className="mr-auto flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={loading || page <= 1}>Anterior</Button><Button type="button" variant="outline" size="sm" onClick={() => setPage((value) => value + 1)} disabled={loading || !timelinePage || page >= timelinePage.totalPages}>Siguiente</Button></div>
        <Button type="button" variant="outline" onClick={onClose}>Volver a composición</Button>
      </DialogFooter>
    </DialogContent>
    <AirfareOverrideDialog row={overrideRow} travelName={travel.name} currentAppliedAmount={components.find((component) => component.id === overrideRow?.costComponentId)?.currentSnapshot?.amount ?? overrideRow?.appliedAmount ?? null} onClose={() => setOverrideRow(null)} onSaved={refreshAfterOverride} />
    {evidenceViewer ? <AttachmentViewer attachments={evidenceViewer.attachments} initialIndex={0} resolveAttachmentUrl={resolveEvidenceUrl} onClose={closeEvidenceViewer} /> : null}
  </Dialog>;
}

function HistoryTimelineRow({ row, formatTenantDateTime, onOverride, onEvidence, evidenceLoading }: { row: CostMonetaryTimelineItem; formatTenantDateTime: (value: string) => string; onOverride: () => void; onEvidence: (trigger: HTMLButtonElement) => void; evidenceLoading: boolean }) {
  const override = row.eventType === "ADMIN_OVERRIDE";
  return <Card className={override ? "border-warning/40 bg-warning/5" : "shadow-none"}>
    <CardHeader className="items-start"><div><CardTitle className="text-base">{row.componentTitle}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{row.category.displayName}{row.businessDate ? ` · Fecha de negocio: ${formatBusinessDate(row.businessDate)}` : ""}</p></div><Badge variant={override ? "warning" : "info"}>{eventTypeLabel(row.eventType)}</Badge></CardHeader>
    <CardContent className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Value label="Aplicado" value={exactMoney(row.appliedAmount, row.currency)} />{row.observedAmount ? <Value label="Observado" value={exactMoney(row.observedAmount, row.currency)} /> : null}<Value label="Actor" value={row.actor.name} /><Value label="Registrado" value={formatTenantDateTime(row.effectiveAt)} /></div>
      {(row.sourceReference || row.sourceUrl || row.overrideReason) ? <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">{row.sourceReference ? <p><span className="font-medium text-foreground">Referencia:</span> {row.sourceReference}</p> : null}{row.sourceUrl ? <a className="mt-1 block w-fit text-primary hover:underline" href={row.sourceUrl} target="_blank" rel="noreferrer">Abrir fuente</a> : null}{row.overrideReason ? <p className="mt-1"><span className="font-medium text-foreground">Motivo de ajuste:</span> {row.overrideReason}</p> : null}</div> : null}
      <div className="flex flex-wrap gap-2">{row.hasEvidence ? <Button type="button" variant="outline" size="sm" onClick={(event) => onEvidence(event.currentTarget)} disabled={evidenceLoading}>{evidenceLoading ? "Abriendo comprobante…" : "Ver comprobante"}</Button> : null}{row.airfareDailyAuthorityId ? <Button type="button" size="sm" onClick={onOverride}>Anular costo de boleto aéreo</Button> : null}</div>
    </CardContent>
  </Card>;
}

function AirfareOverrideDialog({ row, travelName, currentAppliedAmount, onClose, onSaved }: { row: CostMonetaryTimelineItem | null; travelName: string; currentAppliedAmount: string | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [amount, setAmount] = useState(""); const [reason, setReason] = useState(""); const [sourceReference, setSourceReference] = useState(""); const [sourceUrl, setSourceUrl] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  useEffect(() => { setAmount(""); setReason(""); setSourceReference(""); setSourceUrl(""); setError(""); }, [row?.eventId]);
  const submit = async () => {
    if (!row?.airfareDailyAuthorityId) return;
    const observedAmount = amount.trim(); const overrideReason = reason.trim();
    if (!MONEY_PATTERN.test(observedAmount)) { setError("Ingresa un monto exacto con hasta cinco decimales."); return; }
    if (!overrideReason) { setError("El motivo de anulación es requerido."); return; }
    setSaving(true); setError("");
    try { await overrideAdminAirfareDailyAuthority(row.airfareDailyAuthorityId, { observedAmount, overrideReason, sourceReference: sourceReference.trim() || null, sourceUrl: sourceUrl.trim() || null }); await onSaved(); } catch (caught) { setError(message(caught, "No se pudo registrar el ajuste de administrador.")); } finally { setSaving(false); }
  };
  return <Dialog open={Boolean(row)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Anular costo de boleto aéreo</DialogTitle><DialogDescription>La anulación crea una nueva revisión inmutable y mantiene el historial existente.</DialogDescription></DialogHeader>{row ? <div className="space-y-4"><div className="rounded-lg border border-border bg-muted/30 p-3 text-sm"><p className="font-medium">{travelName}</p><p className="mt-1 text-muted-foreground">{row.componentTitle}</p>{row.businessDate ? <p className="mt-1 text-muted-foreground">Fecha de negocio: {formatBusinessDate(row.businessDate)}</p> : null}<p className="mt-1 text-muted-foreground">Costo aplicado actual: {currentAppliedAmount ? exactMoney(currentAppliedAmount, row.currency) : "Sin costo actual"}</p></div>{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}<label className="block text-sm font-medium">Nuevo monto aplicado<Input className="mt-1" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={saving} /></label><label className="block text-sm font-medium">Motivo de anulación *<Textarea className="mt-1" value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving} /></label><label className="block text-sm font-medium">Fuente / referencia <span className="font-normal text-muted-foreground">(opcional)</span><Input className="mt-1" value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} disabled={saving} /></label><label className="block text-sm font-medium">URL <span className="font-normal text-muted-foreground">(opcional)</span><Input className="mt-1" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} disabled={saving} /></label></div> : null}<DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button><Button type="button" onClick={() => void submit()} disabled={saving || !row?.airfareDailyAuthorityId}>{saving ? "Guardando…" : "Registrar anulación"}</Button></DialogFooter></DialogContent></Dialog>;
}

function SummaryItem({ label, value }: { label: string; value: string }) { return <Card className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></CardContent></Card>; }
function Value({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
function EmptyHistory() { return <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-border p-6 text-center"><div><p className="font-medium">No hay historial de costos todavía</p></div></div>; }
function exactMoney(amount: string, currency: string) { return `${currency} ${amount}`; }
function eventTypeLabel(type: CostMonetaryTimelineItem["eventType"]) { return ({ INITIAL_COST: "Costo inicial", COST_SNAPSHOT: "Actualización de costo", AGENT_INITIAL: "Actualización diaria", ADMIN_OVERRIDE: "Ajuste de administrador" })[type]; }
function message(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }

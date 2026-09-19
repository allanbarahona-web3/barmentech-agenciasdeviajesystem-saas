"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getCostEvidenceAccess,
  listAdminComponentAirfareHistory,
  listAdminProjectAirfareHistory,
  listCostEvidence,
  overrideAdminAirfareDailyAuthority,
  type AirfareHistoryItem,
  type AirfareHistoryPage,
  type CostComponent,
  type CostComposition,
  type CostEvidence,
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
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState<AirfareHistoryPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [overrideRow, setOverrideRow] = useState<AirfareHistoryItem | null>(null);
  const [evidenceRow, setEvidenceRow] = useState<AirfareHistoryItem | null>(null);

  const airfareComponents = useMemo(
    () => composition?.components.filter((component) => component.costCategory.code === "AIRFARE") ?? [],
    [composition],
  );

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = selectedComponentId
        ? await listAdminComponentAirfareHistory(selectedComponentId, page, 20)
        : await listAdminProjectAirfareHistory(project.id, page, 20);
      setHistoryPage(response);
    } catch (error) {
      setLoadError(message(error, "No se pudo cargar la evolución de tarifas aéreas."));
      setHistoryPage(null);
    } finally {
      setLoading(false);
    }
  }, [page, project.id, selectedComponentId]);

  useEffect(() => {
    if (isOpen) void loadHistory();
  }, [isOpen, loadHistory]);

  const selectComponent = (value: string) => {
    setSelectedComponentId(value);
    setPage(1);
    setNotice("");
  };

  const refreshAfterOverride = async () => {
    await Promise.all([loadHistory(), onCompositionChanged()]);
    setNotice("La anulación administrativa fue registrada. El historial conserva las revisiones anteriores.");
    setOverrideRow(null);
  };

  const history = historyPage?.history ?? [];
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Evolución de costos</DialogTitle>
          <DialogDescription>Historial de autoridad diaria de boletos aéreos para {travel.name}.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryItem label="Viaje / paquete" value={travel.name} />
          <SummaryItem label="Costo total autoritativo actual" value={exactMoney(composition?.authoritativeTotalCost ?? "0", project.baseCurrency)} />
          <SummaryItem label="Moneda base" value={project.baseCurrency} />
        </div>

        <div className="flex flex-col gap-3 border-y border-border py-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="block min-w-0 flex-1 text-sm font-medium">Ruta / componente de boleto aéreo
            <Select className="mt-1" value={selectedComponentId} onChange={(event) => selectComponent(event.target.value)} disabled={loading}>
              <option value="">Todos los componentes de boleto aéreo</option>
              {airfareComponents.map((component) => <option key={component.id} value={component.id}>{component.title} · {componentRoute(component)}</option>)}
            </Select>
          </label>
          <p className="text-xs text-muted-foreground">Página {historyPage?.page ?? page} · máximo 20 registros</p>
        </div>

        {notice ? <Alert variant="success"><AlertTitle>Actualización registrada</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
        {loadError ? <Alert variant="destructive"><AlertTitle>No se pudo cargar el historial</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert> : null}

        <section className="min-h-64 space-y-3">
          {loading ? <p className="py-12 text-center text-sm text-muted-foreground">Cargando evolución de boletos aéreos…</p> : null}
          {!loading && !loadError && history.length === 0 ? <EmptyHistory /> : null}
          {!loading && history.map((row) => <HistoryTimelineRow key={`${row.airfareDailyAuthorityId}-${row.revisionNumber}`} row={row} currency={project.baseCurrency} onOverride={() => setOverrideRow(row)} onEvidence={() => setEvidenceRow(row)} />)}
        </section>

        <DialogFooter>
          {loadError ? <Button type="button" variant="outline" onClick={() => void loadHistory()} disabled={loading}>Reintentar</Button> : null}
          <div className="mr-auto flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={loading || page <= 1}>Anterior</Button><Button type="button" variant="outline" size="sm" onClick={() => setPage((value) => value + 1)} disabled={loading || !historyPage || page >= historyPage.totalPages}>Siguiente</Button></div>
          <Button type="button" variant="outline" onClick={onClose}>Volver a composición</Button>
        </DialogFooter>
      </DialogContent>

      <AirfareOverrideDialog row={overrideRow} travelName={travel.name} currency={project.baseCurrency} currentAppliedAmount={composition?.components.find((component) => component.id === overrideRow?.costComponentId)?.currentSnapshot?.amount ?? overrideRow?.appliedAmount ?? null} onClose={() => setOverrideRow(null)} onSaved={refreshAfterOverride} />
      <EvidenceDialog row={evidenceRow} onClose={() => setEvidenceRow(null)} />
    </Dialog>
  );
}

function HistoryTimelineRow({ row, currency, onOverride, onEvidence }: { row: AirfareHistoryItem; currency: string; onOverride: () => void; onEvidence: () => void }) {
  const override = row.kind === "ADMIN_OVERRIDE";
  return <Card className={override ? "border-warning/40 bg-warning/5" : "shadow-none"}>
    <CardHeader className="items-start"><div><CardTitle className="text-base">{row.componentTitle}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{routeLabel(row)} · Fecha de negocio: {row.businessDate}</p></div><Badge variant={override ? "warning" : "info"}>{revisionKindLabel(row.kind)}</Badge></CardHeader>
    <CardContent className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Value label="Observado" value={exactMoney(row.observedAmount, currency)} /><Value label="Aplicado" value={exactMoney(row.appliedAmount, currency)} /><Value label="Actor" value={row.actor.name} /><Value label="Registrado" value={timestamp(row.createdAt)} /></div>
      {(row.sourceReference || row.sourceUrl || row.overrideReason) ? <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground"><p>{row.sourceReference ? `Fuente: ${row.sourceReference}` : "Sin referencia de fuente"}</p>{row.sourceUrl ? <a className="mt-1 block w-fit text-primary hover:underline" href={row.sourceUrl} target="_blank" rel="noreferrer">Abrir URL de fuente</a> : null}{row.overrideReason ? <p className="mt-1"><span className="font-medium text-foreground">Motivo de anulación:</span> {row.overrideReason}</p> : null}</div> : null}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={onEvidence}>Comprobantes</Button><Button type="button" size="sm" onClick={onOverride}>Anular costo de boleto aéreo</Button></div>
    </CardContent>
  </Card>;
}

function AirfareOverrideDialog({ row, travelName, currency, currentAppliedAmount, onClose, onSaved }: { row: AirfareHistoryItem | null; travelName: string; currency: string; currentAppliedAmount: string | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [amount, setAmount] = useState(""); const [reason, setReason] = useState(""); const [sourceReference, setSourceReference] = useState(""); const [sourceUrl, setSourceUrl] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  useEffect(() => { setAmount(""); setReason(""); setSourceReference(""); setSourceUrl(""); setError(""); }, [row?.airfareDailyAuthorityId, row?.revisionNumber]);
  const submit = async () => {
    if (!row) return;
    const observedAmount = amount.trim(); const overrideReason = reason.trim();
    if (!MONEY_PATTERN.test(observedAmount)) { setError("Ingresa un monto exacto con hasta cinco decimales."); return; }
    if (!overrideReason) { setError("El motivo de anulación es requerido."); return; }
    setSaving(true); setError("");
    try {
      await overrideAdminAirfareDailyAuthority(row.airfareDailyAuthorityId, { observedAmount, overrideReason, sourceReference: sourceReference.trim() || null, sourceUrl: sourceUrl.trim() || null });
      await onSaved();
    } catch (caught) { setError(message(caught, "No se pudo registrar la anulación administrativa.")); } finally { setSaving(false); }
  };
  return <Dialog open={Boolean(row)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Anular costo de boleto aéreo</DialogTitle><DialogDescription>La anulación crea una nueva revisión inmutable y mantiene el historial existente.</DialogDescription></DialogHeader>{row ? <div className="space-y-4"><div className="rounded-lg border border-border bg-muted/30 p-3 text-sm"><p className="font-medium">{travelName}</p><p className="mt-1 text-muted-foreground">{row.componentTitle} · {routeLabel(row)}</p><p className="mt-1 text-muted-foreground">Fecha de negocio: {row.businessDate}</p><p className="mt-1 text-muted-foreground">Costo aplicado actual: {currentAppliedAmount ? exactMoney(currentAppliedAmount, currency) : "Sin costo actual"}</p></div>{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}<label className="block text-sm font-medium">Nuevo monto aplicado<Input className="mt-1" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={saving} /></label><label className="block text-sm font-medium">Motivo de anulación *<Textarea className="mt-1" value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving} /></label><label className="block text-sm font-medium">Fuente / referencia <span className="font-normal text-muted-foreground">(opcional)</span><Input className="mt-1" value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} disabled={saving} /></label><label className="block text-sm font-medium">URL <span className="font-normal text-muted-foreground">(opcional)</span><Input className="mt-1" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} disabled={saving} /></label></div> : null}<DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button><Button type="button" onClick={() => void submit()} disabled={saving || !row}>{saving ? "Guardando…" : "Registrar anulación"}</Button></DialogFooter></DialogContent></Dialog>;
}

function EvidenceDialog({ row, onClose }: { row: AirfareHistoryItem | null; onClose: () => void }) {
  const [evidence, setEvidence] = useState<CostEvidence[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [openingId, setOpeningId] = useState<string | null>(null);
  useEffect(() => { if (!row) { setEvidence([]); setError(""); return; } let active = true; setLoading(true); setError(""); void listCostEvidence(row.appliedSnapshotId).then((response) => { if (active) setEvidence(response.evidence); }).catch((caught) => { if (active) setError(message(caught, "No se pudieron cargar los comprobantes.")); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [row]);
  const open = async (item: CostEvidence) => { if (!row || openingId) return; setOpeningId(item.id); try { const access = await getCostEvidenceAccess(row.appliedSnapshotId, item.id); window.open(access.url, "_blank", "noopener,noreferrer"); } catch (caught) { setError(message(caught, "No se pudo abrir el comprobante.")); } finally { setOpeningId(null); } };
  return <Dialog open={Boolean(row)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Comprobantes del costo</DialogTitle><DialogDescription>Los comprobantes se cargan solo al abrir esta revisión.</DialogDescription></DialogHeader>{loading ? <p className="py-6 text-center text-sm text-muted-foreground">Cargando comprobantes…</p> : null}{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}{!loading && !error && evidence.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No hay comprobantes adjuntos para esta revisión.</p> : null}{!loading && evidence.length ? <div className="space-y-2">{evidence.map((item) => <Button key={item.id} type="button" variant="outline" className="w-full justify-start" disabled={Boolean(openingId)} onClick={() => void open(item)}>{openingId === item.id ? "Abriendo…" : item.originalFileName}</Button>)}</div> : null}<DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cerrar</Button></DialogFooter></DialogContent></Dialog>;
}

function SummaryItem({ label, value }: { label: string; value: string }) { return <Card className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></CardContent></Card>; }
function Value({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
function EmptyHistory() { return <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-border p-6 text-center"><div><p className="font-medium">No hay autoridades de boletos aéreos todavía</p><p className="mt-1 text-sm text-muted-foreground">Cuando exista una observación o anulación diaria, aparecerá en este historial.</p></div></div>; }
function exactMoney(amount: string, currency: string) { return `${currency} ${amount}`; }
function revisionKindLabel(kind: AirfareHistoryItem["kind"]) { return kind === "ADMIN_OVERRIDE" ? "Anulación administrativa" : "Registro de agente"; }
function routeLabel(row: AirfareHistoryItem) { const origin = routeText(row, "origin") ?? "Origen pendiente"; const destination = routeText(row, "destination") ?? "Destino pendiente"; return `${origin} → ${destination}`; }
function routeText(row: AirfareHistoryItem, key: string) { const value = row.route?.[key]; return typeof value === "string" && value.trim() ? value : null; }
function componentRoute(component: CostComponent) { const detail = component.detailPayload; const origin = typeof detail?.origin === "string" ? detail.origin : "Origen"; const destination = typeof detail?.destination === "string" ? detail.destination : "Destino"; return `${origin} → ${destination}`; }
function timestamp(value: string) { return value.replace("T", " ").slice(0, 16); }
function message(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }

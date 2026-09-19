"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatBusinessDate } from "@/shared/regional";
import { useTenantDateTimeFormatter } from "@/shared/regional/tenant-regional-provider";
import {
  type AirfareDailyStatus,
  type AirfareDailyTask,
  listAgentAirfareDailyTasks,
  registerAgentAirfareDailyAuthority,
  retryAgentAirfareEvidence,
} from "@/lib/cost-engine-api";

const MONEY_PATTERN = /^\d+(?:\.\d{1,5})?$/;

type Props = {
  isOpen: boolean;
  status: AirfareDailyStatus | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
};

export function AirfareDailyTaskDialog({ isOpen, status, onClose, onChanged }: Props) {
  const [tasks, setTasks] = useState<AirfareDailyTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedTask, setSelectedTask] = useState<AirfareDailyTask | null>(null);
  const [notice, setNotice] = useState("");

  const refreshTasks = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await listAgentAirfareDailyTasks(1, 20);
      setTasks(response.tasks);
      return response.tasks;
    } catch (error) {
      setLoadError(message(error, "No se pudieron cargar las tarifas pendientes."));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSelectedTask(null);
      setNotice("");
      return;
    }
    void refreshTasks();
  }, [isOpen, refreshTasks]);

  const close = () => {
    setSelectedTask(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Actualización de tarifas aéreas</DialogTitle>
          <DialogDescription>
            Registra la primera tarifa observada para cada viaje pendiente de hoy.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Badge variant="warning">Pendientes: {status?.pendingToday ?? tasks.length}</Badge>
          <Badge variant="success">Actualizadas hoy: {status?.registeredToday ?? 0}</Badge>
        </div>

        {notice ? <Alert variant="info"><AlertTitle>Tarifas actualizadas</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
        {loadError ? <Alert variant="destructive"><AlertTitle>No se pudo cargar la lista</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert> : null}

        <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
          {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Cargando tarifas pendientes…</p> : null}
          {!loading && !loadError && tasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No hay tarifas aéreas pendientes de revisar hoy.</p>
          ) : null}
          {!loading && tasks.map((task) => <AirfareTaskRow key={task.costComponentId} task={task} onReview={() => setSelectedTask(task)} />)}
        </div>

        <DialogFooter>
          {loadError ? <Button type="button" variant="outline" onClick={() => void refreshTasks()} disabled={loading}>Reintentar</Button> : null}
          <Button type="button" variant="outline" onClick={close}>Volver</Button>
        </DialogFooter>
      </DialogContent>

      <AirfareRegistrationDialog
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onRegistered={async (continueToNext) => {
          const nextTasks = await refreshTasks();
          await onChanged();
          if (continueToNext && nextTasks?.length) {
            setSelectedTask(nextTasks[0]);
          } else {
            setSelectedTask(null);
          }
        }}
        onAlreadyRegistered={async () => {
          setNotice("Esta tarifa ya fue registrada hoy.");
          setSelectedTask(null);
          await Promise.all([refreshTasks(), onChanged()]);
        }}
      />
    </Dialog>
  );
}

function AirfareTaskRow({ task, onReview }: { task: AirfareDailyTask; onReview: () => void }) {
  const route = routeLabel(task);
  const airline = detailText(task, "airline");
  const cabinClass = detailText(task, "cabinClass");
  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{task.travelName}</p><Badge variant="warning">Pendiente</Badge></div>
          <p className="text-sm text-muted-foreground">{route} · Salida: {formatBusinessDate(task.startDate)}</p>
          <p className="text-xs text-muted-foreground">
            {task.sourceTravelType === "TRAVEL_PACKAGE" ? "Paquete turístico" : "Viaje interno"} · {flightTypeLabel(task)}
            {airline ? ` · ${airline}` : ""}{cabinClass ? ` · ${cabinClass}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:text-right">
          <div><p className="text-sm font-semibold">{task.currentSnapshot ? `${task.currentSnapshot.amount} ${task.currentSnapshot.currency ?? task.baseCurrency}` : "Sin costo actual"}</p><p className="text-xs text-muted-foreground">Moneda base: {task.baseCurrency}</p></div>
          <Button type="button" size="sm" onClick={onReview}>Revisar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AirfareRegistrationDialog({ task, onClose, onRegistered, onAlreadyRegistered }: {
  task: AirfareDailyTask | null;
  onClose: () => void;
  onRegistered: (continueToNext: boolean) => Promise<void>;
  onAlreadyRegistered: () => Promise<void>;
}) {
  const formatTenantDateTime = useTenantDateTimeFormatter();
  const [observedAmount, setObservedAmount] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [reason, setReason] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [pendingEvidence, setPendingEvidence] = useState<{ snapshotId: string; continueToNext: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setObservedAmount("");
    setSourceReference(task?.currentSnapshot?.sourceReference ?? "");
    setSourceUrl(task?.currentSnapshot?.sourceUrl ?? "");
    setReason("");
    setEvidenceFile(null);
    setPendingEvidence(null);
    setError("");
  }, [task?.costComponentId]);

  const register = async (continueToNext: boolean) => {
    if (!task) return;
    const amount = observedAmount.trim();
    if (!MONEY_PATTERN.test(amount)) {
      setError("Ingresa un precio exacto con hasta cinco decimales.");
      return;
    }
    if (!evidenceFile) {
      setError("El comprobante es requerido.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await registerAgentAirfareDailyAuthority(task.costComponentId, {
        observedAmount: amount,
        sourceReference: sourceReference.trim() || null,
        sourceUrl: sourceUrl.trim() || null,
        reason: reason.trim() || null,
      }, evidenceFile);
      if (!result.evidenceAttached) {
        setPendingEvidence({ snapshotId: result.snapshotId, continueToNext });
        setError(result.evidenceUploadError ?? "La tarifa fue registrada, pero falta adjuntar el comprobante.");
        return;
      }
      await onRegistered(continueToNext);
    } catch (caught) {
      if (message(caught, "").includes("AIRFARE_DAILY_AUTHORITY_ALREADY_REGISTERED")) {
        await onAlreadyRegistered();
        return;
      }
      setError(message(caught, "No se pudo registrar la tarifa."));
    } finally {
      setSaving(false);
    }
  };

  const retryEvidence = async () => {
    if (!pendingEvidence || !evidenceFile) {
      setError("El comprobante es requerido.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await retryAgentAirfareEvidence(pendingEvidence.snapshotId, evidenceFile);
      await onRegistered(pendingEvidence.continueToNext);
    } catch (caught) {
      setError(message(caught, "No se pudo adjuntar el comprobante."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(task)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar tarifa observada</DialogTitle>
          <DialogDescription>La primera tarifa válida registrada hoy se convierte en la autoridad diaria.</DialogDescription>
        </DialogHeader>
        {task ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{task.travelName}</p>
              <p className="mt-1 text-muted-foreground">{routeLabel(task)} · Salida: {formatBusinessDate(task.startDate)} · {flightTypeLabel(task)}</p>
            </div>
            <section className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium">Última tarifa registrada</p>
              {task.currentSnapshot ? <div className="mt-2 space-y-1 text-muted-foreground"><p>{task.currentSnapshot.amount} {task.currentSnapshot.currency ?? task.baseCurrency}</p><p><span className="font-medium text-foreground">Registrado por:</span> {task.currentSnapshot.actorName ?? "No disponible"}</p><p><span className="font-medium text-foreground">Registrado el:</span> {task.currentSnapshot.capturedAt ? formatTenantDateTime(task.currentSnapshot.capturedAt) : "No disponible"}</p>{task.currentSnapshot.sourceReference ? <p><span className="font-medium text-foreground">Referencia / fuente:</span> {task.currentSnapshot.sourceReference}</p> : null}{task.currentSnapshot.sourceUrl ? <a className="block w-fit text-primary hover:underline" href={task.currentSnapshot.sourceUrl} target="_blank" rel="noreferrer">Abrir fuente</a> : null}</div> : <p className="mt-2 text-muted-foreground">No hay una tarifa previa registrada.</p>}
            </section>
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            {!pendingEvidence ? <><label className="block text-sm font-medium">Precio observado hoy *<Input className="mt-1" value={observedAmount} onChange={(event) => setObservedAmount(event.target.value)} inputMode="decimal" placeholder={`Ej. 125.50000 ${task.baseCurrency}`} disabled={saving} /></label><label className="block text-sm font-medium">Referencia / fuente <span className="font-normal text-muted-foreground">(opcional)</span><Input className="mt-1" value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} disabled={saving} /></label><label className="block text-sm font-medium">URL <span className="font-normal text-muted-foreground">(opcional)</span><Input className="mt-1" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} type="url" disabled={saving} /></label></> : <p className="text-sm text-muted-foreground">La tarifa ya fue registrada. Adjunta el comprobante para completar esta observación.</p>}
            <label className="block text-sm font-medium">Comprobante *<Input className="mt-1" type="file" accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf" onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)} disabled={saving} />{evidenceFile ? <span className="mt-1 block text-xs font-normal text-muted-foreground">{evidenceFile.name}</span> : null}</label>
            {!pendingEvidence ? <label className="block text-sm font-medium">Observaciones <span className="font-normal text-muted-foreground">(opcional)</span><Textarea className="mt-1" value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving} /></label> : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          {pendingEvidence ? <Button type="button" onClick={() => void retryEvidence()} disabled={saving || !evidenceFile}>{saving ? "Adjuntando…" : "Reintentar comprobante"}</Button> : <><Button type="button" variant="secondary" onClick={() => void register(true)} disabled={saving || !task}>{saving ? "Registrando…" : "Registrar y continuar"}</Button><Button type="button" onClick={() => void register(false)} disabled={saving || !task}>{saving ? "Registrando…" : "Registrar"}</Button></>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function detailText(task: AirfareDailyTask, key: string) {
  const value = task.detailPayload?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function routeLabel(task: AirfareDailyTask) {
  const origin = detailText(task, "origin") ?? "Origen pendiente";
  const destination = detailText(task, "destination") ?? "Destino pendiente";
  return `${origin} → ${destination}`;
}

function flightTypeLabel(task: AirfareDailyTask) { return detailText(task, "flightType") === "DOMESTIC" ? "Interno" : "Internacional"; }
function message(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }

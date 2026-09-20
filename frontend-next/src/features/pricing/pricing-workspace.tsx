"use client";

import { FormEvent, useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatFinanceMoneyDisplay } from "@/lib/finance-money-display";
import {
  approvePricingCalculation,
  calculatePricing,
  getLatestApprovedPricingCalculation,
  getLatestPricingCalculation,
  getPricingConfiguration,
  getTravelPricingPublicationContext,
  listPricingCalculationVersions,
  publishPricingCalculation,
  updatePricingConfiguration,
  type PricingCalculationHistoryPage,
  type PricingCalculationVersion,
  type PricingConfigurationContext,
  type PricingConfigurationInput,
  type TravelPricingPublicationContext,
} from "@/lib/pricing-api";
import { useTenantDateTimeFormatter } from "@/shared/regional/tenant-regional-provider";

type Props = {
  costingProjectId: string;
  projectName: string;
  baseCurrency: string;
};

const EMPTY_CONFIGURATION: PricingConfigurationInput = {
  operationalCostsAmount: "0",
  riskMarginPercent: "0",
  targetProfitMarginPercent: "0",
  salesCommissionPercent: "0",
  bankCommissionPercent: "0",
  applicableTaxPercent: "0",
};

const CONFIGURATION_FIELDS: Array<{
  key: keyof PricingConfigurationInput;
  label: string;
  helper: string;
  money?: boolean;
}> = [
  { key: "operationalCostsAmount", label: "Gastos operativos", helper: "Monto adicional manual para la operación.", money: true },
  { key: "riskMarginPercent", label: "Margen de riesgo (%)", helper: "Calculado sobre costo base." },
  { key: "targetProfitMarginPercent", label: "Margen de utilidad objetivo (%)", helper: "Margen real sobre precio antes de impuesto." },
  { key: "salesCommissionPercent", label: "Comisión vendedor (%)", helper: "Calculada sobre precio antes de impuesto." },
  { key: "bankCommissionPercent", label: "Comisión bancaria (%)", helper: "Calculada sobre el precio final cobrado, incluyendo impuesto." },
  { key: "applicableTaxPercent", label: "Impuesto aplicable (%)", helper: "Calculado sobre precio antes de impuesto." },
];

export function PricingWorkspace({ costingProjectId, projectName, baseCurrency }: Props) {
  const formatTenantDateTime = useTenantDateTimeFormatter();
  const [context, setContext] = useState<PricingConfigurationContext | null>(null);
  const [configuration, setConfiguration] = useState<PricingConfigurationInput>(EMPTY_CONFIGURATION);
  const [calculation, setCalculation] = useState<PricingCalculationVersion | null>(null);
  const [approvedCalculation, setApprovedCalculation] = useState<PricingCalculationVersion | null>(null);
  const [publicationContext, setPublicationContext] = useState<TravelPricingPublicationContext | null>(null);
  const [history, setHistory] = useState<PricingCalculationHistoryPage | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPublicationConfirmation, setShowPublicationConfirmation] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextContext, latest, latestApproved, nextPublicationContext] = await Promise.all([
        getPricingConfiguration(costingProjectId),
        getLatestPricingCalculation(costingProjectId),
        getLatestApprovedPricingCalculation(costingProjectId),
        getTravelPricingPublicationContext(costingProjectId),
      ]);
      setContext(nextContext);
      setConfiguration(configurationFromContext(nextContext));
      setCalculation(latest);
      setApprovedCalculation(latestApproved);
      setPublicationContext(nextPublicationContext);
    } catch (caught) {
      setError(pricingMessage(caught, "No se pudo cargar la configuración de precio."));
    } finally {
      setLoading(false);
    }
  }, [costingProjectId]);

  const loadHistory = useCallback(async (page: number) => {
    setHistoryLoading(true);
    try {
      const response = await listPricingCalculationVersions(costingProjectId, page, 20);
      setHistory(response);
      setHistoryPage(response.page);
    } catch (caught) {
      setError(pricingMessage(caught, "No se pudo cargar el historial de precios."));
    } finally {
      setHistoryLoading(false);
    }
  }, [costingProjectId]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);
  useEffect(() => { if (historyOpen) void loadHistory(historyPage); }, [historyOpen, historyPage, loadHistory]);

  const configurationChanged = context ? CONFIGURATION_FIELDS.some(({ key }) => configuration[key] !== context.configuration[key]) : false;
  const currency = context?.currency ?? baseCurrency;
  const currentStatus = calculation?.status ?? context?.configuration.status;

  const saveConfiguration = async () => {
    const saved = await updatePricingConfiguration(costingProjectId, configuration);
    setContext(saved);
    setConfiguration(configurationFromContext(saved));
    return saved;
  };

  const submitConfiguration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || calculating) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await saveConfiguration();
      setNotice("La configuración de precio fue guardada.");
    } catch (caught) {
      setError(pricingMessage(caught, "No se pudo guardar la configuración de precio."));
    } finally {
      setSaving(false);
    }
  };

  const calculate = async () => {
    if (calculating || saving) return;
    setCalculating(true);
    setError("");
    setNotice("");
    try {
      if (configurationChanged) await saveConfiguration();
      const nextCalculation = await calculatePricing(costingProjectId);
      setCalculation(nextCalculation);
      setContext((current) => current ? { ...current, currentAuthoritativeCost: nextCalculation.authoritativeCostAmount, currency: nextCalculation.currency } : current);
      setNotice(`El cálculo de precio v${nextCalculation.versionNumber} fue creado como borrador.`);
      if (historyOpen) await loadHistory(1);
    } catch (caught) {
      setError(pricingMessage(caught, "No se pudo calcular el precio."));
    } finally {
      setCalculating(false);
    }
  };

  const approve = async () => {
    if (!calculation || calculation.status !== "DRAFT" || calculation.stale || approving) return;
    setApproving(true);
    setError("");
    setNotice("");
    try {
      const approved = await approvePricingCalculation(calculation.id);
      setCalculation(approved);
      setApprovedCalculation(approved);
      setNotice("El precio fue aprobado. La publicación comercial se realiza en un flujo posterior.");
      if (historyOpen) await loadHistory(1);
    } catch (caught) {
      setError(pricingMessage(caught, "No se pudo aprobar el precio."));
    } finally {
      setApproving(false);
    }
  };

  const publish = async () => {
    if (!calculation || calculation.status !== "APPROVED" || calculation.stale || publishing) return;
    setPublishing(true);
    setError("");
    setNotice("");
    try {
      await publishPricingCalculation(calculation.id);
      const refreshedPublicationContext = await getTravelPricingPublicationContext(costingProjectId);
      setPublicationContext(refreshedPublicationContext);
      setShowPublicationConfirmation(false);
      setNotice("El precio aprobado fue publicado en el viaje.");
    } catch (caught) {
      setError(pricingMessage(caught, "No se pudo publicar el precio en el viaje."));
    } finally {
      setPublishing(false);
    }
  };

  return <section className="space-y-6" aria-label="Espacio de trabajo de precios">
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Proyecto</p>
          <p className="mt-1 text-lg font-semibold">{projectName}</p>
          <p className="mt-1 text-sm text-muted-foreground">Moneda base: {currency}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {currentStatus ? <StatusBadge status={currentStatus} /> : <Badge variant="secondary">Sin cálculo</Badge>}
          {approvedCalculation ? <Badge variant="success">Último aprobado</Badge> : null}
          {calculation?.stale ? <Badge variant="warning">Costos cambiaron</Badge> : null}
        </div>
      </CardContent>
    </Card>

    {loading ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Cargando configuración de precio…</CardContent></Card> : null}
    {!loading && error ? <Alert variant="destructive"><AlertTitle>Acción no completada</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {!loading && notice ? <Alert variant="success"><AlertTitle>Precio actualizado</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
    {!loading && calculation?.stale ? <Alert variant="warning"><AlertTitle>Costos cambiaron</AlertTitle><AlertDescription>Los costos del proyecto cambiaron desde este cálculo. Recalcula antes de aprobar.</AlertDescription></Alert> : null}

    {!loading && context ? <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader><div><CardTitle>Configuración de precio</CardTitle><p className="mt-1 text-sm text-muted-foreground">Los importes y porcentajes se guardan como valores decimales exactos.</p></div></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => void submitConfiguration(event)}>
            <PricingField label="Costo autoritativo" helper="Proviene del total autoritativo actual de costos.">
              <Input readOnly value={money(context.currentAuthoritativeCost, currency)} aria-label="Costo autoritativo" />
            </PricingField>
            {CONFIGURATION_FIELDS.map(({ key, label, helper, money: isMoney }) => <PricingField key={key} label={label} helper={helper}>
              <Input
                inputMode="decimal"
                value={configuration[key]}
                onChange={(event) => setConfiguration((current) => ({ ...current, [key]: event.target.value }))}
                disabled={saving || calculating || context.configuration.status === "ARCHIVED"}
                aria-label={label}
                placeholder={isMoney ? "0.00" : "0"}
              />
            </PricingField>)}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="submit" variant="outline" disabled={saving || calculating || !configurationChanged || context.configuration.status === "ARCHIVED"}>{saving ? <ButtonLoadingLabel label="Guardando…" /> : "Guardar configuración"}</Button>
              <Button type="button" onClick={() => void calculate()} disabled={calculating || saving || context.configuration.status === "ARCHIVED"}>{calculating ? <ButtonLoadingLabel label="Calculando…" /> : calculation ? "Recalcular precio" : "Calcular precio"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <PricingBreakdown calculation={calculation} publicationContext={publicationContext} onApprove={() => void approve()} onPublish={() => setShowPublicationConfirmation(true)} approving={approving} formatTenantDateTime={formatTenantDateTime} />
    </div> : null}

    {!loading ? <Card>
      <CardHeader><div><CardTitle>Historial de precios</CardTitle><p className="mt-1 text-sm text-muted-foreground">Versiones inmutables, ordenadas de la más reciente a la más antigua.</p></div><Button type="button" variant="outline" size="sm" onClick={() => { setHistoryPage(1); setHistoryOpen((open) => !open); }}>{historyOpen ? "Ocultar historial" : "Ver historial"}</Button></CardHeader>
      {historyOpen ? <CardContent className="space-y-3">
        {historyLoading ? <p className="py-4 text-sm text-muted-foreground">Cargando historial de precios…</p> : null}
        {!historyLoading && history?.versions.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No hay cálculos de precio todavía.</p> : null}
        {!historyLoading && history?.versions.map((version) => <div key={version.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-medium">Versión {version.versionNumber}</p><p className="mt-1 text-sm text-muted-foreground">Creado: {formatTenantDateTime(version.createdAt)} · {version.createdBy.name}</p></div>
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={version.status} />{version.stale ? <Badge variant="warning">Costos cambiaron</Badge> : null}<span className="text-sm text-muted-foreground">Costo: {money(version.authoritativeCostAmount, version.currency)}</span><span className="font-semibold">{money(version.finalSellingPrice, version.currency)}</span></div>
        </div>)}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3"><p className="text-xs text-muted-foreground">Página {history?.page ?? historyPage} · máximo 20 registros</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setHistoryPage((page) => Math.max(1, page - 1))} disabled={historyLoading || historyPage <= 1}>Anterior</Button><Button type="button" variant="outline" size="sm" onClick={() => setHistoryPage((page) => page + 1)} disabled={historyLoading || !history || historyPage >= history.totalPages}>Siguiente</Button></div></div>
      </CardContent> : null}
    </Card> : null}
    <PublicationConfirmationDialog
      calculation={calculation}
      publicationContext={publicationContext}
      open={showPublicationConfirmation}
      publishing={publishing}
      formatTenantDateTime={formatTenantDateTime}
      onClose={() => { if (!publishing) setShowPublicationConfirmation(false); }}
      onPublish={() => void publish()}
    />
  </section>;
}

function PricingBreakdown({ calculation, publicationContext, onApprove, onPublish, approving, formatTenantDateTime }: { calculation: PricingCalculationVersion | null; publicationContext: TravelPricingPublicationContext | null; onApprove: () => void; onPublish: () => void; approving: boolean; formatTenantDateTime: (value: string) => string }) {
  if (!calculation) return <Card><CardHeader><CardTitle>Desglose financiero</CardTitle></CardHeader><CardContent className="grid min-h-80 place-items-center text-center text-sm text-muted-foreground">Aún no hay un cálculo. Guarda la configuración y selecciona “Calcular precio”.</CardContent></Card>;
  const currency = calculation.currency;
  const canApprove = calculation.status === "DRAFT" && !calculation.stale;
  const belowCommercialFloor = Boolean(publicationContext?.commercialFloorPrice && exactAmountIsBelow(calculation.finalSellingPrice, publicationContext.commercialFloorPrice));
  return <Card>
    <CardHeader><div><CardTitle>Desglose financiero</CardTitle><p className="mt-1 text-sm text-muted-foreground">Calculado con la política de precios vigente.</p></div><StatusBadge status={calculation.status} /></CardHeader>
    <CardContent className="space-y-5">
      <CollapsibleBreakdown label="Costo económico ajustado" value={money(calculation.adjustedEconomicCostAmount, currency)}>
        <div className="space-y-2">
          <BreakdownRow label="Costo autoritativo" value={money(calculation.authoritativeCostAmount, currency)} />
          <BreakdownRow label="Gastos operativos" value={money(calculation.operationalCostsAmount, currency)} />
          <BreakdownRow label="Reserva de riesgo" value={money(calculation.riskAmount, currency)} percent={`${calculation.riskMarginPercent}%`} />
          <BreakdownRow label="Costo económico ajustado" value={money(calculation.adjustedEconomicCostAmount, currency)} />
        </div>
      </CollapsibleBreakdown>
      <CollapsibleBreakdown label="Precio antes de impuesto" value={money(calculation.preTaxSellingPrice, currency)}>
        <div className="space-y-2">
          <BreakdownRow label="Costo económico ajustado" value={money(calculation.adjustedEconomicCostAmount, currency)} />
          <BreakdownRow label="Comisión vendedor" value={money(calculation.salesCommissionAmount, currency)} percent={`${calculation.salesCommissionPercent}%`} />
          <BreakdownRow label="Comisión bancaria" value={money(calculation.bankCommissionAmount, currency)} percent={`${calculation.bankCommissionPercent}%`} />
          <BreakdownRow label="Utilidad estimada de la agencia" value={money(calculation.estimatedAgencyProfitBeforeIncomeTax, currency)} percent={`${calculation.targetProfitMarginPercent}%`} />
          <BreakdownRow label="Precio antes de impuesto" value={money(calculation.preTaxSellingPrice, currency)} />
        </div>
      </CollapsibleBreakdown>
      <div className="rounded-lg border border-primary/25 bg-primary/5 p-4"><p className="text-sm font-medium">Utilidad estimada de la agencia</p><p className="mt-1 text-2xl font-semibold">{money(calculation.estimatedAgencyProfitBeforeIncomeTax, currency)}</p><p className="mt-1 text-xs text-muted-foreground">Antes de impuesto sobre la renta · objetivo {calculation.targetProfitMarginPercent}%</p></div>
      <div className="space-y-2 border-t border-border pt-4"><BreakdownRow label="Impuesto aplicable" value={money(calculation.taxAmount, currency)} percent={`${calculation.applicableTaxPercent}%`} /><div className="rounded-lg bg-success/10 p-4"><p className="text-sm font-semibold text-success">PRECIO FINAL RECOMENDADO</p><p className="mt-1 text-2xl font-semibold">{money(calculation.finalSellingPrice, currency)}</p></div></div>
      <CollapsibleBreakdown label="Conciliación" value="Ver detalle">
        <div className="space-y-2">
          {[
            ["Costo económico ajustado", money(calculation.adjustedEconomicCostAmount, currency)],
            ["+ Comisión vendedor", money(calculation.salesCommissionAmount, currency)],
            ["+ Comisión bancaria", money(calculation.bankCommissionAmount, currency)],
            ["+ Utilidad agencia", money(calculation.estimatedAgencyProfitBeforeIncomeTax, currency)],
            ["= Precio antes de impuesto", money(calculation.preTaxSellingPrice, currency)],
            ["+ Impuesto", money(calculation.taxAmount, currency)],
            ["= Precio final recomendado", money(calculation.finalSellingPrice, currency)],
          ].map(([label, value]) => <BreakdownRow key={label} label={label} value={value} />)}
        </div>
      </CollapsibleBreakdown>
      {calculation.stale ? <p className="text-sm text-warning">Recalcula antes de aprobar porque los costos cambiaron.</p> : null}
      {calculation.status === "DRAFT" ? <Button type="button" className="w-full" onClick={onApprove} disabled={!canApprove || approving}>{approving ? <ButtonLoadingLabel label="Aprobando…" /> : "Aprobar precio"}</Button> : <div className="space-y-3"><p className="text-sm font-medium text-success">Precio aprobado{calculation.approvedAt ? ` el ${formatTenantDateTime(calculation.approvedAt)}` : ""}.</p><PublicationSummary context={publicationContext} formatTenantDateTime={formatTenantDateTime} />{belowCommercialFloor && publicationContext?.commercialFloorPrice ? <Alert variant="warning"><AlertTitle>Precio por debajo del piso comercial</AlertTitle><AlertDescription>El precio aprobado está por debajo del piso comercial de {money(publicationContext.commercialFloorPrice, currency)}. Recalcula y aprueba un precio igual o superior antes de publicar.</AlertDescription></Alert> : null}{!calculation.stale ? <Button type="button" className="w-full" onClick={onPublish} disabled={belowCommercialFloor}>Publicar precio</Button> : null}</div>}
    </CardContent>
  </Card>;
}

function PublicationSummary({ context, formatTenantDateTime }: { context: TravelPricingPublicationContext | null; formatTenantDateTime: (value: string) => string }) {
  if (!context) return null;
  return <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm"><p className="font-medium">Publicación comercial</p><p className="mt-1 text-muted-foreground">Precio actual del viaje: <span className="font-medium text-foreground">{context.currentCommercialPrice ? money(context.currentCommercialPrice, context.currency) : "Precio pendiente"}</span></p>{context.commercialPriceStatus === "LEGACY" ? <p className="mt-1 text-xs text-muted-foreground">Precio manual heredado; aún no ha sido publicado mediante este flujo de precios.</p> : null}{context.commercialFloorPrice ? <p className="mt-1 text-muted-foreground">Piso comercial: <span className="font-medium text-foreground">{money(context.commercialFloorPrice, context.currency)}</span></p> : <p className="mt-1 text-muted-foreground">El primer precio publicado establecerá el piso comercial.</p>}{context.latestPublication ? <p className="mt-1 text-xs text-muted-foreground">Última publicación: {formatTenantDateTime(context.latestPublication.publishedAt)} · {context.latestPublication.publishedBy.name}</p> : null}</div>;
}

function PublicationConfirmationDialog({ calculation, publicationContext, open, publishing, formatTenantDateTime, onClose, onPublish }: { calculation: PricingCalculationVersion | null; publicationContext: TravelPricingPublicationContext | null; open: boolean; publishing: boolean; formatTenantDateTime: (value: string) => string; onClose: () => void; onPublish: () => void }) {
  const belowCommercialFloor = Boolean(calculation && publicationContext?.commercialFloorPrice && exactAmountIsBelow(calculation.finalSellingPrice, publicationContext.commercialFloorPrice));
  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Publicar precio</DialogTitle><DialogDescription>Esta acción aplica explícitamente el resultado aprobado al precio comercial del viaje.</DialogDescription></DialogHeader>{calculation && publicationContext ? <div className="space-y-3 text-sm"><BreakdownRow label="Precio aprobado" value={money(calculation.finalSellingPrice, calculation.currency)} /><BreakdownRow label="Precio actual del viaje" value={publicationContext.currentCommercialPrice ? money(publicationContext.currentCommercialPrice, publicationContext.currency) : "Precio pendiente"} /><BreakdownRow label="Piso comercial" value={publicationContext.commercialFloorPrice ? money(publicationContext.commercialFloorPrice, publicationContext.currency) : "Se establecerá con esta publicación"} />{publicationContext.latestPublication ? <p className="text-xs text-muted-foreground">Última publicación: {formatTenantDateTime(publicationContext.latestPublication.publishedAt)} · {publicationContext.latestPublication.publishedBy.name}</p> : null}{belowCommercialFloor ? <Alert variant="warning"><AlertDescription>El precio aprobado está por debajo del piso comercial de {publicationContext.commercialFloorPrice ? money(publicationContext.commercialFloorPrice, calculation.currency) : ""}. No puede publicarse.</AlertDescription></Alert> : null}</div> : null}<DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={publishing}>Cancelar</Button><Button type="button" onClick={onPublish} disabled={publishing || !calculation || !publicationContext || calculation.stale || belowCommercialFloor}>{publishing ? <ButtonLoadingLabel label="Publicando…" /> : "Publicar precio"}</Button></DialogFooter></DialogContent></Dialog>;
}

function PricingField({ label, helper, children }: { label: string; helper: string; children: ReactNode }) {
  return <label className="block text-sm font-medium"><span>{label}</span>{children}<span className="mt-1 block text-xs font-normal text-muted-foreground">{helper}</span></label>;
}

function CollapsibleBreakdown({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return <details className="group rounded-lg border border-border bg-muted/20">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
      <span>{label}</span>
      <span className="flex items-center gap-2"><span>{value}</span><ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" /></span>
    </summary>
    <div className="border-t border-border p-3">{children}</div>
  </details>;
}

function ButtonLoadingLabel({ label }: { label: string }) {
  return <><LoaderCircle className="animate-spin" aria-hidden="true" />{label}</>;
}

function BreakdownRow({ label, value, percent }: { label: string; value: string; percent?: string }) {
  return <div className="flex items-end justify-between gap-4 border-b border-border/70 pb-2 text-sm"><span className="text-muted-foreground">{label}{percent ? <span className="ml-2 text-xs">{percent}</span> : null}</span><span className="font-medium">{value}</span></div>;
}

function StatusBadge({ status }: { status: "DRAFT" | "ARCHIVED" | "APPROVED" }) {
  const labels = { DRAFT: "Borrador", ARCHIVED: "Archivado", APPROVED: "Aprobado" } as const;
  return <Badge variant={status === "APPROVED" ? "success" : status === "ARCHIVED" ? "secondary" : "info"}>{labels[status]}</Badge>;
}

function configurationFromContext(context: PricingConfigurationContext): PricingConfigurationInput {
  return {
    operationalCostsAmount: context.configuration.operationalCostsAmount,
    riskMarginPercent: context.configuration.riskMarginPercent,
    targetProfitMarginPercent: context.configuration.targetProfitMarginPercent,
    salesCommissionPercent: context.configuration.salesCommissionPercent,
    bankCommissionPercent: context.configuration.bankCommissionPercent,
    applicableTaxPercent: context.configuration.applicableTaxPercent,
  };
}

function money(value: string, currency: string) { return formatFinanceMoneyDisplay(value, currency); }

function pricingMessage(error: unknown, fallback: string) {
  const value = error instanceof Error ? error.message : "";
  if (/PRICING_INVALID_DENOMINATOR|denominator/i.test(value)) return "La combinación de márgenes y comisiones no permite calcular un precio válido.";
  if (/PRICING_PERCENTAGE_OUT_OF_RANGE|PRICING_INPUT_NEGATIVE|PRICING_DECIMAL_INVALID/i.test(value)) return "Ingresa montos y porcentajes decimales válidos, iguales o mayores que cero.";
  return value || fallback;
}

/** Presentation-only comparison. The backend remains the publication authority. */
function exactAmountIsBelow(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match) return null;
    return { whole: match[1].replace(/^0+(?=\d)/, ""), fraction: match[2] ?? "" };
  };
  const first = normalize(left); const second = normalize(right);
  if (!first || !second) return false;
  if (first.whole.length !== second.whole.length) return first.whole.length < second.whole.length;
  if (first.whole !== second.whole) return first.whole < second.whole;
  const scale = Math.max(first.fraction.length, second.fraction.length);
  return first.fraction.padEnd(scale, "0") < second.fraction.padEnd(scale, "0");
}

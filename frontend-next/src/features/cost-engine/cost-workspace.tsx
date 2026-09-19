"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatFinanceMoneyDisplay } from "@/lib/finance-money-display";
import { getHomeRouteForRole, getStoredSession } from "@/lib/auth-api";
import {
  archiveCostComponent, createCostCategory, createCostSupplier, createGenericCostComponent, getCostComposition,
  getCostEvidenceAccess, isGenericCostCategory, listCostCategories, listCostEvidence, listCostSuppliers,
  normalizeCustomCostCategoryCode, resolveInternalTripCostingProject, resolveTravelPackageCostingProject,
  updateCostComponentCost, updateGenericCostComponent, uploadCostEvidence,
  type CostCategory, type CostComponent, type CostComposition, type CostEvidence, type CostSnapshot, type CostSupplier, type CostingProject,
} from "@/lib/cost-engine-api";
import { getInternalTripById, type InternalTripDetail } from "@/lib/internal-trips-api";
import { getTravelPackageById, type TravelPackage } from "@/lib/travel-packages-api";
import { formatBusinessDate } from "@/shared/regional";
import { AirfareEvolutionDialog } from "./airfare-evolution-dialog";

type WorkspaceSourceType = "travel-package" | "internal-trip";
type DetailValues = Record<string, string>;
type TravelMeta = { name: string; startDate: string; endDate: string; sourceLabel: string };
type CostForm = {
  costCategoryId: string; costSupplierId: string; title: string; description: string; quantity: string; unit: string; amount: string;
  sourceReference: string; sourceUrl: string; details: DetailValues;
};

const EMPTY_FORM: CostForm = { costCategoryId: "", costSupplierId: "", title: "", description: "", quantity: "", unit: "", amount: "", sourceReference: "", sourceUrl: "", details: {} };
const MONEY_PATTERN = /^\d+(?:\.\d{1,5})?$/;
const SPECIALIZED_CODES = new Set(["AIRFARE", "BAGGAGE", "LODGING", "TRANSPORTATION", "TOUR", "INSURANCE", "EVENT_TICKET", "VISA_ASSISTANCE", "MEALS"]);
const STANDARD_CATEGORY_LABELS: Record<string, string> = {
  AIRFARE: "Boleto aéreo", BAGGAGE: "Equipaje", LODGING: "Hospedaje", TRANSPORTATION: "Transporte", TOUR: "Tour", INSURANCE: "Seguro", EVENT_TICKET: "Entradas", VISA_ASSISTANCE: "Asistencia de visa", MEALS: "Alimentación", OTHER: "Otros",
};
const ENUM_LABELS: Record<string, string> = {
  INTERNAL: "Interno", INTERNATIONAL: "Internacional", ONE_WAY: "Solo ida", ROUND_TRIP: "Ida y vuelta",
  ECONOMY: "Económica", PREMIUM_ECONOMY: "Económica premium", BUSINESS: "Ejecutiva", FIRST: "Primera", 
  CHECKED: "Equipaje facturado", CARRY_ON: "Equipaje de mano", EXCESS: "Exceso de equipaje", SPORTS_EQUIPMENT: "Equipo deportivo", OTHER: "Otro",
  HOTEL: "Hotel", HOSTEL: "Hostel", AIRBNB: "Airbnb", APARTMENT: "Apartamento", SINGLE: "Individual", MATRIMONIAL: "Matrimonial", DOUBLE: "Doble", TRIPLE: "Triple", QUADRUPLE: "Cuádruple",
  PRIVATE_TRANSFER: "Traslado privado", SHARED_TRANSFER: "Traslado compartido", CAR_RENTAL: "Alquiler de automóvil", RAIL: "Tren", BUS: "Autobús", FERRY: "Ferri",
  MEDICAL: "Médica", TRIP_CANCELLATION: "Cancelación de viaje", COMPREHENSIVE: "Integral", TOURIST: "Turista", TRANSIT: "Tránsito", STUDENT: "Estudiante", WORK: "Trabajo",
  BREAKFAST: "Desayuno", HALF_BOARD: "Media pensión", FULL_BOARD: "Pensión completa", ALL_INCLUSIVE: "Todo incluido",
};
const ENUMS = {
  flightType: ["INTERNAL", "INTERNATIONAL"], tripType: ["ONE_WAY", "ROUND_TRIP"], cabinClass: ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST", "OTHER"], baggageType: ["CHECKED", "CARRY_ON", "EXCESS", "SPORTS_EQUIPMENT", "OTHER"],
  lodgingType: ["HOTEL", "HOSTEL", "AIRBNB", "APARTMENT", "OTHER"], roomType: ["SINGLE", "MATRIMONIAL", "DOUBLE", "TRIPLE", "QUADRUPLE", "OTHER"], transportationType: ["PRIVATE_TRANSFER", "SHARED_TRANSFER", "CAR_RENTAL", "RAIL", "BUS", "FERRY", "OTHER"],
  coverageType: ["MEDICAL", "TRIP_CANCELLATION", "COMPREHENSIVE", "OTHER"], visaType: ["TOURIST", "BUSINESS", "TRANSIT", "STUDENT", "WORK", "OTHER"], mealPlanType: ["BREAKFAST", "HALF_BOARD", "FULL_BOARD", "ALL_INCLUSIVE", "OTHER"],
} as const;
const OPTIONAL_DETAIL_FIELDS: Record<string, readonly string[]> = {
  AIRFARE: ["returnDate", "airline", "cabinClass"], BAGGAGE: ["weightKg"],
  TRANSPORTATION: ["serviceTime", "returnDate"], TOUR: ["duration"], INSURANCE: ["coverageAmount"], MEALS: ["endDate"],
};

export function CostWorkspace({ sourceType, sourceId }: { sourceType: string; sourceId: string }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null); const [project, setProject] = useState<CostingProject | null>(null); const [travel, setTravel] = useState<TravelMeta | null>(null);
  const [composition, setComposition] = useState<CostComposition | null>(null); const [categories, setCategories] = useState<CostCategory[]>([]); const [suppliers, setSuppliers] = useState<CostSupplier[]>([]);
  const [form, setForm] = useState<CostForm>(EMPTY_FORM); const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null); const [initialSnapshot, setInitialSnapshot] = useState<CostSnapshot | null>(null);
  const [showNewCategory, setShowNewCategory] = useState(false); const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewSupplier, setShowNewSupplier] = useState(false); const [newSupplier, setNewSupplier] = useState({ name: "", website: "", notes: "" }); const [supplierSaving, setSupplierSaving] = useState(false); const [supplierError, setSupplierError] = useState("");
  const [evidence, setEvidence] = useState<CostEvidence[]>([]); const [evidenceLoading, setEvidenceLoading] = useState(false); const [evidenceFile, setEvidenceFile] = useState<File | null>(null); const [openingEvidenceId, setOpeningEvidenceId] = useState<string | null>(null);
  const [showEvolution, setShowEvolution] = useState(false);
  const validSourceType = sourceType === "travel-package" || sourceType === "internal-trip";
  const selectedCategory = useMemo(() => categories.find((category) => category.id === form.costCategoryId) ?? null, [categories, form.costCategoryId]);
  const genericCategory = isGenericCostCategory(selectedCategory);
  const lodgingCategory = selectedCategory?.code === "LODGING";
  const airfareCategory = selectedCategory?.code === "AIRFARE";
  const polishedSpecializedCategory = lodgingCategory || airfareCategory;
  const selectedComponent = useMemo(() => composition?.components.find((component) => component.id === selectedComponentId) ?? null, [composition, selectedComponentId]);
  const unsupportedHistoricalDetails = Boolean(selectedComponent && selectedCategory && !genericCategory && hasUnsupportedDetailSchema(selectedComponent));
  const standardCategories = categories.filter((category) => category.origin === "STANDARD" && category.code !== "ACCOMMODATION"); const customCategories = categories.filter((category) => category.origin === "CUSTOM");

  useEffect(() => { const session = getStoredSession(); const role = String(session?.user?.role ?? "").toUpperCase(); if (!session?.user?.id) { router.replace("/"); return; } if (role !== "ADMIN") { router.replace(getHomeRouteForRole(role)); return; } setAuthorized(true); }, [router]);
  useEffect(() => {
    if (!authorized || !validSourceType || !sourceId.trim()) { if (authorized) { setError("El origen de costos solicitado no es válido."); setLoading(false); } return; }
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const [resolution, source] = await Promise.all([sourceType === "travel-package" ? resolveTravelPackageCostingProject(sourceId) : resolveInternalTripCostingProject(sourceId), loadTravelMeta(sourceType as WorkspaceSourceType, sourceId)]);
        const [nextComposition, nextCategories, nextSuppliers] = await Promise.all([getCostComposition(resolution.costingProject.id), listCostCategories(), listCostSuppliers()]);
        if (cancelled) return; setProject(resolution.costingProject); setTravel(source); setComposition(nextComposition); setCategories(nextCategories); setSuppliers(nextSuppliers);
      } catch (caught) { if (!cancelled) setError(message(caught, "No se pudo abrir el espacio de costos.")); } finally { if (!cancelled) setLoading(false); }
    }
    void load(); return () => { cancelled = true; };
  }, [authorized, sourceId, sourceType, validSourceType]);

  async function refreshComposition() { if (project) setComposition(await getCostComposition(project.id)); }
  function resetForm() { setForm(EMPTY_FORM); setSelectedComponentId(null); setInitialSnapshot(null); setEvidence([]); setEvidenceFile(null); }
  async function loadEvidence(costSnapshotId: string | null) { if (!costSnapshotId) { setEvidence([]); return; } setEvidenceLoading(true); try { setEvidence((await listCostEvidence(costSnapshotId)).evidence); } catch (caught) { setError(message(caught, "No se pudieron cargar los comprobantes.")); setEvidence([]); } finally { setEvidenceLoading(false); } }
  function selectComponent(componentId: string) {
    const component = composition?.components.find((item) => item.id === componentId); if (!component) return;
    setError(null); setSelectedComponentId(component.id); setInitialSnapshot(component.currentSnapshot); setEvidenceFile(null); setForm(formFromComponent(component)); void loadEvidence(component.currentSnapshot?.id ?? null);
  }
  async function submitComponent(addAnother: boolean, event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault(); if (!project || !selectedCategory || saving) return;
    try {
      const componentTitle = lodgingCategory ? lodgingComponentTitle(form.details) || form.title.trim() : airfareCategory ? airfareComponentTitle(form.details) || form.title.trim() : form.title.trim();
      validateBaseForm(form, componentTitle); const details = genericCategory || unsupportedHistoricalDetails || preservesEmptySpecializedDetails(selectedComponent, form.details) ? null : specializedPayload(selectedCategory.code, form.details);
      const structural = { costCategoryId: selectedCategory.id, costSupplierId: form.costSupplierId || null, title: componentTitle, description: form.description.trim() || null, quantity: genericCategory ? form.quantity.trim() || null : selectedComponent?.quantity ?? null, unit: genericCategory ? form.unit.trim() || null : selectedComponent?.unit ?? null, ...(details ? { detailPayload: details, detailSchemaVersion: 1 } : {}) };
      const monetary = { amount: form.amount.trim(), currency: project.baseCurrency, sourceReference: form.sourceReference.trim() || null, sourceUrl: form.sourceUrl.trim() || null, reason: initialSnapshot?.reason ?? null };
      setSaving(true); setError(null); let snapshotForEvidence = initialSnapshot;
      if (!selectedComponentId) {
        const created = await createGenericCostComponent(project.id, { ...structural, ...monetary }); snapshotForEvidence = created.currentSnapshot;
      } else {
        await updateGenericCostComponent(selectedComponentId, structural);
        if (snapshotChanged(initialSnapshot, monetary)) snapshotForEvidence = (await updateCostComponentCost(selectedComponentId, monetary)).currentSnapshot;
      }
      if (evidenceFile) { if (!snapshotForEvidence) throw new Error("No hay un costo autoritativo disponible para adjuntar el comprobante."); await uploadCostEvidence(snapshotForEvidence.id, evidenceFile); }
      await refreshComposition(); resetForm();
    } catch (caught) { setError(message(caught, "No se pudo guardar el componente.")); } finally { setSaving(false); }
  }
  async function archiveSelectedComponent() { if (!selectedComponentId || saving) return; setSaving(true); setError(null); try { await archiveCostComponent(selectedComponentId); await refreshComposition(); resetForm(); } catch (caught) { setError(message(caught, "No se pudo archivar el componente.")); } finally { setSaving(false); } }
  async function submitNewCategory(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const displayName = newCategoryName.trim(); if (!displayName || saving) return; setSaving(true); setError(null); try { const created = await createCostCategory({ code: normalizeCustomCostCategoryCode(displayName), displayName }); setCategories((current) => [...current, created].sort((left, right) => left.displayName.localeCompare(right.displayName))); resetForm(); setForm((current) => ({ ...current, costCategoryId: created.id })); setNewCategoryName(""); setShowNewCategory(false); } catch (caught) { setError(message(caught, "No se pudo crear la categoría.")); } finally { setSaving(false); } }
  async function submitNewSupplier(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const name = newSupplier.name.trim(); if (!name || supplierSaving) return; setSupplierSaving(true); setSupplierError(""); try { const created = await createCostSupplier({ name, website: newSupplier.website.trim() || null, notes: newSupplier.notes.trim() || null }); const refreshed = await listCostSuppliers(); setSuppliers(refreshed); setForm((current) => ({ ...current, costSupplierId: created.id })); setNewSupplier({ name: "", website: "", notes: "" }); setShowNewSupplier(false); } catch (caught) { setSupplierError(message(caught, "No se pudo crear el proveedor.")); } finally { setSupplierSaving(false); } }
  async function openEvidence(item: CostEvidence) { if (!initialSnapshot || openingEvidenceId) return; setOpeningEvidenceId(item.id); setError(null); try { window.open((await getCostEvidenceAccess(initialSnapshot.id, item.id)).url, "_blank", "noopener,noreferrer"); } catch (caught) { setError(message(caught, "No se pudo abrir el comprobante.")); } finally { setOpeningEvidenceId(null); } }

  if (!authorized || loading) return <main className="app-shell grid min-h-[360px] place-items-center text-sm text-muted-foreground">Cargando espacio de costos…</main>;
  if (error && (!project || !travel)) return <main className="app-shell"><div className="mx-auto w-full max-w-3xl"><Alert variant="destructive"><AlertTitle>No se pudo abrir el espacio de costos</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></div></main>;
  if (!project || !travel) return null;
  const supplierField = <div className="space-y-2"><Field label="Proveedor"><Select value={form.costSupplierId} onChange={(event) => setFormField("costSupplierId", event.target.value, setForm)}><option value="">Sin proveedor</option>{suppliers.filter((supplier) => supplier.isActive).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select></Field><Button type="button" variant="outline" size="sm" onClick={() => { setSupplierError(""); setShowNewSupplier(true); }}>+ Nuevo proveedor</Button></div>;
  return <main className="app-shell"><div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6">
    <header className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-ui-xs lg:flex-row lg:items-start lg:justify-between"><div><Link className="text-sm font-medium text-primary hover:underline" href={sourceType === "travel-package" ? "/admin/travel-packages" : "/admin/internal-trips"}>← Volver a viajes</Link><h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Componer costos · {travel.name}</h1><p className="mt-2 text-sm text-muted-foreground">{formatBusinessDate(travel.startDate)} — {formatBusinessDate(travel.endDate)}</p><div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">{travel.sourceLabel}</Badge><Badge variant="info">{project.baseCurrency}</Badge><Badge variant="secondary">{projectStatusLabel(project.status)}</Badge></div></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setShowEvolution(true)}>Evolución de costos</Button><Button variant="outline" disabled>Ver detalles del viaje</Button></div></header>
    {error ? <Alert variant="destructive"><AlertTitle>Acción no completada</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]"><section className="space-y-6">
      <Card><CardHeader><CardTitle>Componentes del proyecto</CardTitle><Button type="button" variant="outline" size="sm" onClick={resetForm}>Nuevo componente</Button></CardHeader><CardContent className="space-y-2">{composition?.components.length ? composition.components.map((component) => <ComponentRow key={component.id} component={component} project={project} onSelect={selectComponent} />) : <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay componentes activos. Agrega el primero para comenzar.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>{selectedComponentId ? "Editar componente" : "Agregar componente"}</CardTitle></CardHeader><CardContent>
        <div className="mb-5 flex flex-wrap items-end gap-3"><label className="min-w-[220px] flex-1 text-sm font-medium">Categoría<Select value={form.costCategoryId} onChange={(event) => { resetForm(); setForm((current) => ({ ...current, costCategoryId: event.target.value })); }}><option value="">Selecciona una categoría</option><optgroup label="Estándar">{standardCategories.map((category) => <option key={category.id} value={category.id}>{categoryDisplayName(category)}</option>)}</optgroup>{customCategories.length ? <optgroup label="Personalizadas">{customCategories.map((category) => <option key={category.id} value={category.id}>{categoryDisplayName(category)}</option>)}</optgroup> : null}</Select></label><Button type="button" variant="outline" onClick={() => setShowNewCategory((value) => !value)}>+ Crear nueva opción</Button></div>
        {showNewCategory ? <form className="mb-5 rounded-lg border border-border bg-muted p-4" onSubmit={submitNewCategory}><label className="block text-sm font-medium">Nombre de la nueva opción<Input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="Ej. Trámite consular" /></label><div className="mt-3 flex gap-2"><Button type="submit" size="sm" disabled={saving || !newCategoryName.trim()}>Crear categoría</Button><Button type="button" size="sm" variant="ghost" onClick={() => setShowNewCategory(false)}>Cancelar</Button></div></form> : null}
        {!selectedCategory ? <p className="text-sm text-muted-foreground">Selecciona una categoría para cargar el formulario.</p> : <form className="space-y-4" onSubmit={(event) => void submitComponent(false, event)}>
          {unsupportedHistoricalDetails ? <Alert variant="info"><AlertTitle>Detalles históricos sin modificar</AlertTitle><AlertDescription>Este componente usa el esquema v{selectedComponent?.detailSchemaVersion ?? "desconocido"}. Puedes actualizar sus datos generales o costo, pero sus detalles especializados se conservan sin reinterpretarlos.</AlertDescription></Alert> : null}
          {!polishedSpecializedCategory ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Título *"><Input value={form.title} onChange={(event) => setFormField("title", event.target.value, setForm)} /></Field>{supplierField}</div> : null}
          {!polishedSpecializedCategory ? <Field label="Observaciones"><Textarea value={form.description} onChange={(event) => setFormField("description", event.target.value, setForm)} /></Field> : null}
          {!genericCategory && !unsupportedHistoricalDetails ? polishedSpecializedCategory ? <section className="space-y-3"><p className="text-sm font-medium">{lodgingCategory ? "Datos del hospedaje" : "Datos del vuelo"}</p><SpecializedDetailsFields code={selectedCategory.code} values={form.details} onChange={(field, value) => setForm((current) => ({ ...current, details: { ...current.details, [field]: value } }))} /></section> : <SpecializedDetailsFields code={selectedCategory.code} values={form.details} onChange={(field, value) => setForm((current) => ({ ...current, details: { ...current.details, [field]: value } }))} /> : null}
          {genericCategory ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Cantidad"><Input inputMode="decimal" value={form.quantity} onChange={(event) => setFormField("quantity", event.target.value, setForm)} placeholder="Ej. 2" /></Field><Field label="Unidad"><Input value={form.unit} onChange={(event) => setFormField("unit", event.target.value, setForm)} placeholder="Ej. noches, unidades" /></Field></div> : null}
          {polishedSpecializedCategory ? <><section className="space-y-3"><p className="text-sm font-medium">Costo y proveedor</p><div className="grid gap-4 sm:grid-cols-2"><Field label={`Costo * (${project.baseCurrency})`}><Input inputMode="decimal" value={form.amount} onChange={(event) => setFormField("amount", event.target.value, setForm)} placeholder="0.00" /></Field>{supplierField}</div></section><section className="space-y-3"><p className="text-sm font-medium">Información de respaldo</p><div className="grid gap-4 sm:grid-cols-2"><Field label="Referencia (opcional)"><Input value={form.sourceReference} onChange={(event) => setFormField("sourceReference", event.target.value, setForm)} placeholder={airfareCategory ? "Ej. Cotización, localizador, correo o referencia de tarifa" : "Ej. Cotización #1234, correo, WhatsApp o código de reserva"} /></Field><Field label="URL de fuente (opcional)"><Input type="url" value={form.sourceUrl} onChange={(event) => setFormField("sourceUrl", event.target.value, setForm)} placeholder="https://..." /></Field></div><EvidenceFields title="Comprobante (opcional)" evidence={evidence} loading={evidenceLoading} file={evidenceFile} existingSnapshot={initialSnapshot} openingEvidenceId={openingEvidenceId} onFile={setEvidenceFile} onOpen={openEvidence} /></section><Field label="Observaciones"><Textarea value={form.description} onChange={(event) => setFormField("description", event.target.value, setForm)} /></Field></> : <><div className="grid gap-4 sm:grid-cols-2"><Field label={`Costo * (${project.baseCurrency})`}><Input inputMode="decimal" value={form.amount} onChange={(event) => setFormField("amount", event.target.value, setForm)} placeholder="0.00" /></Field><Field label="Referencia / fuente"><Input value={form.sourceReference} onChange={(event) => setFormField("sourceReference", event.target.value, setForm)} /></Field></div><Field label="URL de fuente"><Input type="url" value={form.sourceUrl} onChange={(event) => setFormField("sourceUrl", event.target.value, setForm)} placeholder="https://" /></Field><EvidenceFields evidence={evidence} loading={evidenceLoading} file={evidenceFile} existingSnapshot={initialSnapshot} openingEvidenceId={openingEvidenceId} onFile={setEvidenceFile} onOpen={openEvidence} /></>}
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button><Button type="button" variant="outline" disabled={saving} onClick={() => void submitComponent(true)}>Guardar y agregar otro</Button>{selectedComponentId ? <Button type="button" variant="destructive" disabled={saving} onClick={() => void archiveSelectedComponent()}>Archivar</Button> : null}<Button type="button" variant="ghost" onClick={resetForm}>Cancelar</Button></div>
        </form>}
      </CardContent></Card>
    </section><CompositionSummary composition={composition} project={project} /></div>
  </div><AirfareEvolutionDialog isOpen={showEvolution} project={project} composition={composition} travel={travel} onClose={() => setShowEvolution(false)} onCompositionChanged={refreshComposition} /><Dialog open={showNewSupplier} onOpenChange={setShowNewSupplier}><DialogContent><DialogHeader><DialogTitle>Nuevo proveedor</DialogTitle><DialogDescription>Registra un proveedor de costos para este tenant. Puede ser manual o sin sitio web.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => void submitNewSupplier(event)}>{supplierError ? <Alert variant="destructive"><AlertDescription>{supplierError}</AlertDescription></Alert> : null}<Field label="Nombre *"><Input value={newSupplier.name} onChange={(event) => setNewSupplier((current) => ({ ...current, name: event.target.value }))} disabled={supplierSaving} autoFocus /></Field><Field label="Sitio web (opcional)"><Input type="url" value={newSupplier.website} onChange={(event) => setNewSupplier((current) => ({ ...current, website: event.target.value }))} disabled={supplierSaving} placeholder="https://" /></Field><Field label="Notas (opcional)"><Textarea value={newSupplier.notes} onChange={(event) => setNewSupplier((current) => ({ ...current, notes: event.target.value }))} disabled={supplierSaving} /></Field><DialogFooter><Button type="button" variant="outline" onClick={() => setShowNewSupplier(false)} disabled={supplierSaving}>Cancelar</Button><Button type="submit" disabled={supplierSaving || !newSupplier.name.trim()}>{supplierSaving ? "Creando…" : "Crear proveedor"}</Button></DialogFooter></form></DialogContent></Dialog></main>;
}

function ComponentRow({ component, project, onSelect }: { component: CostComponent; project: CostingProject; onSelect: (id: string) => void }) { return <button type="button" onClick={() => onSelect(component.id)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent"><span className="min-w-0"><span className="block truncate text-sm font-medium">{component.title}</span><span className="block truncate text-xs text-muted-foreground">{categoryDisplayName(component.costCategory)}{component.costSupplier ? ` · ${component.costSupplier.name}` : ""}</span></span><span className="text-right"><span className="block text-sm font-medium">{component.currentSnapshot ? formatFinanceMoneyDisplay(component.currentSnapshot.amount, project.baseCurrency) : "Sin costo"}</span><Badge variant="success">{componentStatusLabel(component.status)}</Badge></span></button>; }
function CompositionSummary({ composition, project }: { composition: CostComposition | null; project: CostingProject }) { return <aside><Card className="sticky top-4"><CardHeader><CardTitle>Resumen de composición</CardTitle></CardHeader><CardContent className="space-y-4"><div><p className="text-sm text-muted-foreground">Costo total autoritativo</p><p className="text-2xl font-semibold">{formatFinanceMoneyDisplay(composition?.authoritativeTotalCost ?? "0", project.baseCurrency)}</p></div><div className="border-t border-border pt-4"><p className="text-sm font-medium">Subtotales por categoría</p><div className="mt-2 space-y-2 text-sm">{composition?.categorySubtotals.map((subtotal) => <div key={subtotal.category.id} className="flex justify-between gap-3"><span className="text-muted-foreground">{categoryDisplayName(subtotal.category)}</span><span className="font-medium">{formatFinanceMoneyDisplay(subtotal.amount, project.baseCurrency)}</span></div>) ?? <p className="text-muted-foreground">Sin subtotales todavía.</p>}</div></div><div className="border-t border-border pt-4"><p className="text-sm font-medium">Componentes activos ({composition?.total ?? 0})</p><div className="mt-2 space-y-3">{composition?.components.map((component) => <div key={component.id} className="rounded-md bg-muted p-3"><p className="text-xs font-medium text-muted-foreground">{categoryDisplayName(component.costCategory)}</p><div className="mt-1 flex justify-between gap-3"><p className="min-w-0 truncate text-sm font-medium">{component.title}</p><p className="shrink-0 text-sm font-medium">{component.currentSnapshot ? formatFinanceMoneyDisplay(component.currentSnapshot.amount, project.baseCurrency) : "Sin costo"}</p></div><p className="mt-1 text-xs text-muted-foreground">{specializedDescription(component)}</p>{component.costSupplier ? <p className="mt-1 text-xs text-muted-foreground">Proveedor: {component.costSupplier.name}</p> : null}</div>) ?? <p className="text-sm text-muted-foreground">Aún no hay componentes activos.</p>}</div></div></CardContent></Card></aside>; }

function SpecializedDetailsFields({ code, values, onChange }: { code: string; values: DetailValues; onChange: (field: string, value: string) => void }) {
  const required = (field: string) => requiredDetailField(code, field) || (code === "AIRFARE" && field === "returnDate" && values.tripType === "ROUND_TRIP");
  const text = (label: string, field: string, type = "text", placeholder?: string) => <Field label={`${label}${required(field) ? " *" : ""}`}><Input type={type} value={values[field] ?? ""} onChange={(event) => onChange(field, event.target.value)} placeholder={placeholder} /></Field>;
  const select = (label: string, field: keyof typeof ENUMS) => <Field label={`${label}${required(field) ? " *" : ""}`}><Select value={values[field] ?? ""} onChange={(event) => onChange(field, event.target.value)}><option value="">Selecciona una opción</option>{ENUMS[field].map((value) => <option key={value} value={value}>{enumLabel(value, field)}</option>)}</Select></Field>;
  switch (code) {
    case "AIRFARE": return <DetailGrid>{select("Tipo de vuelo", "flightType")}{select("Tipo de trayecto", "tripType")}{text("Origen", "origin", "text", "SJO")}{text("Destino", "destination", "text", "MAD")}{text("Fecha de salida", "departureDate", "date")}{values.tripType === "ROUND_TRIP" ? text("Fecha de regreso", "returnDate", "date") : null}{text("Aerolínea", "airline")}{select("Cabina", "cabinClass")}</DetailGrid>;
    case "BAGGAGE": return <DetailGrid>{select("Tipo de equipaje", "baggageType")}{text("Piezas", "pieces", "number")}{text("Peso (kg)", "weightKg", "text", "Ej. 23.5")}</DetailGrid>;
    case "LODGING": return <DetailGrid>{text("Nombre del alojamiento", "propertyName")}{text("Ciudad", "city")}{select("Tipo de hospedaje", "lodgingType")}{select("Tipo de habitación", "roomType")}{text("Check-in", "checkIn", "date")}{text("Check-out", "checkOut", "date")}{text("Noches", "nights", "number")}{text("Cantidad de habitaciones", "roomCount", "number")}</DetailGrid>;
    case "TRANSPORTATION": return <DetailGrid>{select("Tipo de transporte", "transportationType")}{text("Origen", "origin")}{text("Destino", "destination")}{text("Fecha de servicio", "serviceDate", "date")}{text("Hora", "serviceTime", "time")}{text("Fecha de regreso", "returnDate", "date")}</DetailGrid>;
    case "TOUR": return <DetailGrid>{text("Actividad", "activityName")}{text("Ubicación", "location")}{text("Fecha de servicio", "serviceDate", "date")}{text("Duración", "duration", "text", "Ej. 4 horas")}</DetailGrid>;
    case "INSURANCE": return <DetailGrid>{select("Cobertura", "coverageType")}{text("Inicio de vigencia", "startDate", "date")}{text("Fin de vigencia", "endDate", "date")}{text("Monto de cobertura", "coverageAmount", "text", "Ej. 50000")}</DetailGrid>;
    case "EVENT_TICKET": return <DetailGrid>{text("Evento", "eventName")}{text("Recinto", "venue")}{text("Ciudad", "city")}{text("Fecha del evento", "eventDate", "date")}</DetailGrid>;
    case "VISA_ASSISTANCE": return <DetailGrid>{text("País de destino", "destinationCountry")}{select("Tipo de visa", "visaType")}{text("Fecha esperada de viaje", "expectedTravelDate", "date")}</DetailGrid>;
    case "MEALS": return <DetailGrid>{select("Plan de comidas", "mealPlanType")}{text("Fecha de inicio", "startDate", "date")}{text("Fecha final", "endDate", "date")}</DetailGrid>;
    default: return null;
  }
}
function EvidenceFields({ title = "Comprobante", evidence, loading, file, existingSnapshot, openingEvidenceId, onFile, onOpen }: { title?: string; evidence: CostEvidence[]; loading: boolean; file: File | null; existingSnapshot: CostSnapshot | null; openingEvidenceId: string | null; onFile: (file: File | null) => void; onOpen: (item: CostEvidence) => void }) { return <div className="rounded-lg border border-border p-4"><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG o WEBP; máximo 10 MB. Se adjunta al costo autoritativo actual.</p><Input className="mt-3" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => onFile(event.target.files?.[0] ?? null)} />{file ? <p className="mt-2 text-xs text-muted-foreground">Pendiente de adjuntar: {file.name}</p> : null}{existingSnapshot ? <div className="mt-3 border-t border-border pt-3"><p className="text-xs font-medium">Comprobantes actuales</p>{loading ? <p className="mt-1 text-xs text-muted-foreground">Cargando comprobantes…</p> : evidence.length ? <div className="mt-2 space-y-1">{evidence.map((item) => <Button key={item.id} type="button" variant="link" size="sm" className="h-auto w-fit px-0" disabled={Boolean(openingEvidenceId)} onClick={() => onOpen(item)}>{openingEvidenceId === item.id ? "Abriendo…" : item.originalFileName}</Button>)}</div> : <p className="mt-1 text-xs text-muted-foreground">Sin comprobantes adjuntos.</p>}</div> : null}</div>; }
function DetailGrid({ children }: { children: ReactNode }) { return <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">{children}</div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-sm font-medium text-foreground"><span className="mb-1 block">{label}</span>{children}</label>; }
function setFormField<Key extends Exclude<keyof CostForm, "details">>(key: Key, value: CostForm[Key], setForm: Dispatch<SetStateAction<CostForm>>) { setForm((current) => ({ ...current, [key]: value })); }
function formFromComponent(component: CostComponent): CostForm { const snapshot = component.currentSnapshot; return { costCategoryId: component.costCategory.id, costSupplierId: component.costSupplier?.id ?? "", title: component.title, description: component.description ?? "", quantity: component.quantity ?? "", unit: component.unit ?? "", amount: snapshot?.amount ?? "", sourceReference: snapshot?.sourceReference ?? "", sourceUrl: snapshot?.sourceUrl ?? "", details: component.detailSchemaVersion === 1 ? detailsFromPayload(component.detailPayload) : {} }; }
function detailsFromPayload(payload: Record<string, unknown> | null): DetailValues { return Object.fromEntries(Object.entries(payload ?? {}).map(([key, value]) => [key, String(value)])); }
function snapshotChanged(snapshot: CostSnapshot | null, next: { amount: string; currency: string; sourceReference: string | null; sourceUrl: string | null; reason: string | null }) { return !snapshot || snapshot.amount !== next.amount || snapshot.currency !== next.currency || snapshot.sourceReference !== next.sourceReference || snapshot.sourceUrl !== next.sourceUrl || snapshot.reason !== next.reason; }
function hasUnsupportedDetailSchema(component: CostComponent) { return (component.detailPayload !== null || component.detailSchemaVersion !== null) && component.detailSchemaVersion !== 1; }
function preservesEmptySpecializedDetails(component: CostComponent | null, details: DetailValues) { return Boolean(component && component.detailPayload === null && component.detailSchemaVersion === null && !Object.values(details).some((value) => value.trim())); }
function validateBaseForm(form: CostForm, title = form.title) { if (!title.trim()) throw new Error("El título es requerido."); if (!MONEY_PATTERN.test(form.amount.trim())) throw new Error("El costo debe ser un decimal exacto de hasta cinco decimales."); if (form.quantity.trim() && (!MONEY_PATTERN.test(form.quantity.trim()) || /^0(?:\.0+)?$/.test(form.quantity.trim()))) throw new Error("La cantidad debe ser un decimal exacto mayor que cero."); }
function lodgingComponentTitle(values: DetailValues) { return [values.propertyName?.trim(), values.city?.trim()].filter(Boolean).join(" - "); }
function airfareComponentTitle(values: DetailValues) { return [values.origin?.trim(), values.destination?.trim()].filter(Boolean).join(" → "); }

function specializedPayload(code: string, values: DetailValues): Record<string, unknown> {
  const string = (field: string) => requiredString(values, field); const date = (field: string) => requiredDate(values, field); const optionalDate = (field: string) => optional(values, field, (value) => requireIsoDate(value, field)); const optionalString = (field: string) => optional(values, field, (value) => requireText(value, field)); const optionalDecimal = (field: string) => optional(values, field, positiveDecimal); const optionalEnum = (field: keyof typeof ENUMS) => optional(values, field, (value) => enumValue(value, field));
  switch (code) {
    case "AIRFARE": { const tripType = enumValue(string("tripType"), "tripType"); const departureDate = date("departureDate"); const returnDate = tripType === "ROUND_TRIP" ? date("returnDate") : undefined; assertDateOrder(departureDate, returnDate, "returnDate", "departureDate"); return compact({ flightType: enumValue(string("flightType"), "flightType"), tripType, origin: string("origin"), destination: string("destination"), departureDate, returnDate, airline: optionalString("airline"), cabinClass: optionalEnum("cabinClass") }); }
    case "BAGGAGE": return compact({ baggageType: enumValue(string("baggageType"), "baggageType"), pieces: positiveInteger(values, "pieces"), weightKg: optionalDecimal("weightKg") });
    case "LODGING": { const checkIn = date("checkIn"); const checkOut = date("checkOut"); assertDateOrder(checkIn, checkOut, "checkOut", "checkIn"); return { propertyName: string("propertyName"), city: string("city"), lodgingType: enumValue(string("lodgingType"), "lodgingType"), roomType: enumValue(string("roomType"), "roomType"), checkIn, checkOut, nights: positiveInteger(values, "nights"), roomCount: positiveInteger(values, "roomCount") }; }
    case "TRANSPORTATION": { const serviceDate = date("serviceDate"); const returnDate = optionalDate("returnDate"); assertDateOrder(serviceDate, returnDate, "returnDate", "serviceDate"); return compact({ transportationType: enumValue(string("transportationType"), "transportationType"), origin: string("origin"), destination: string("destination"), serviceDate, serviceTime: optional(values, "serviceTime", time), returnDate }); }
    case "TOUR": return compact({ activityName: string("activityName"), location: string("location"), serviceDate: date("serviceDate"), duration: optionalString("duration") });
    case "INSURANCE": { const startDate = date("startDate"); const endDate = date("endDate"); assertDateOrder(startDate, endDate, "endDate", "startDate"); return compact({ coverageType: enumValue(string("coverageType"), "coverageType"), startDate, endDate, coverageAmount: optionalDecimal("coverageAmount") }); }
    case "EVENT_TICKET": return { eventName: string("eventName"), venue: string("venue"), city: string("city"), eventDate: date("eventDate") };
    case "VISA_ASSISTANCE": return { destinationCountry: string("destinationCountry"), visaType: enumValue(string("visaType"), "visaType"), expectedTravelDate: date("expectedTravelDate") };
    case "MEALS": { const startDate = date("startDate"); const endDate = optionalDate("endDate"); assertDateOrder(startDate, endDate, "endDate", "startDate"); return compact({ mealPlanType: enumValue(string("mealPlanType"), "mealPlanType"), startDate, endDate }); }
    default: throw new Error("La categoría no tiene un contrato especializado compatible.");
  }
}
function requiredString(values: DetailValues, field: string) { const value = values[field]?.trim(); if (!value) throw new Error(`${field} es requerido.`); return value; }
function requireText(value: string, field: string) { if (!value.trim()) throw new Error(`${field} es requerido.`); return value.trim(); }
function requireIsoDate(value: string, field: string) { if (!isIsoDate(value)) throw new Error(`${field} debe usar una fecha válida AAAA-MM-DD.`); return value; }
function requiredDate(values: DetailValues, field: string) { return requireIsoDate(requiredString(values, field), field); }
function optional<T>(values: DetailValues, field: string, normalize: (value: string) => T): T | undefined { const value = values[field]?.trim(); return value ? normalize(value) : undefined; }
function positiveInteger(values: DetailValues, field: string) { const value = requiredString(values, field); if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error(`${field} debe ser un entero positivo.`); return Number(value); }
function positiveDecimal(value: string) { if (!MONEY_PATTERN.test(value) || /^0(?:\.0+)?$/.test(value)) throw new Error("El valor debe ser un decimal exacto positivo."); return value; }
function enumValue(value: string, field: keyof typeof ENUMS) { const normalized = value.trim().toUpperCase(); if (!(ENUMS[field] as readonly string[]).includes(normalized)) throw new Error(`${field} tiene un valor no válido.`); return normalized; }
function time(value: string) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("La hora debe usar formato HH:mm."); return value; }
function isIsoDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const [year, month, day] = value.split("-").map(Number); const date = new Date(Date.UTC(year, month - 1, day)); return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day; }
function assertDateOrder(start: string | undefined, end: string | undefined, endLabel: string, startLabel: string) { if (start && end && end < start) throw new Error(`${endLabel} no puede ser anterior a ${startLabel}.`); }
function compact(value: Record<string, unknown>) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)); }
function requiredDetailField(code: string, field: string) { return SPECIALIZED_CODES.has(code) && !OPTIONAL_DETAIL_FIELDS[code]?.includes(field); }
function categoryDisplayName(category: Pick<CostCategory, "code" | "displayName"> & Partial<Pick<CostCategory, "origin">>) { return category.origin === "CUSTOM" ? category.displayName : STANDARD_CATEGORY_LABELS[category.code] ?? category.displayName; }
function enumLabel(value: string, field?: keyof typeof ENUMS) { if (field === "cabinClass" && value === "OTHER") return "Otra"; return ENUM_LABELS[value] ?? value.replaceAll("_", " "); }
function componentStatusLabel(status: CostComponent["status"]) { return status === "ACTIVE" ? "Activo" : "Archivado"; }
function projectStatusLabel(status: string) { return ({ DRAFT: "Borrador", ACTIVE: "Activo", ARCHIVED: "Archivado" } as Record<string, string>)[status] ?? status; }
function specializedDescription(component: CostComponent) {
  if (!SPECIALIZED_CODES.has(component.costCategory.code)) return component.description || (component.quantity && component.unit ? `${component.quantity} ${component.unit}` : "Sin descripción adicional");
  if (component.detailSchemaVersion !== 1 || !component.detailPayload) return `Detalles especializados v${component.detailSchemaVersion ?? "sin versión"}`;
  const detail = component.detailPayload; const text = (field: string) => typeof detail[field] === "string" || typeof detail[field] === "number" ? String(detail[field]) : "";
  switch (component.costCategory.code) {
    case "AIRFARE": return [[text("origin"), text("destination")].filter(Boolean).join(" → "), enumLabel(text("flightType")), text("departureDate")].filter(Boolean).join(" · ") || "Itinerario";
    case "BAGGAGE": return [enumLabel(text("baggageType")), text("pieces") && `${text("pieces")} pieza(s)`].filter(Boolean).join(" · ");
    case "LODGING": return [text("propertyName"), text("city"), enumLabel(text("lodgingType")), enumLabel(text("roomType")), text("checkIn") && `${text("checkIn")} — ${text("checkOut")}`].filter(Boolean).join(" · ");
    case "TRANSPORTATION": return [enumLabel(text("transportationType")), [text("origin"), text("destination")].filter(Boolean).join(" → "), text("serviceDate")].filter(Boolean).join(" · ");
    case "TOUR": return [text("activityName"), text("location"), text("serviceDate")].filter(Boolean).join(" · ");
    case "INSURANCE": return [enumLabel(text("coverageType")), text("startDate") && `${text("startDate")} — ${text("endDate")}`].filter(Boolean).join(" · ");
    case "EVENT_TICKET": return [text("eventName"), text("venue"), text("eventDate")].filter(Boolean).join(" · ");
    case "VISA_ASSISTANCE": return [text("destinationCountry"), enumLabel(text("visaType")), text("expectedTravelDate")].filter(Boolean).join(" · ");
    case "MEALS": return [enumLabel(text("mealPlanType")), text("startDate") && `${text("startDate")}${text("endDate") ? ` — ${text("endDate")}` : ""}`].filter(Boolean).join(" · ");
    default: return "Detalles especializados";
  }
}
async function loadTravelMeta(sourceType: WorkspaceSourceType, sourceId: string): Promise<TravelMeta> { if (sourceType === "travel-package") { const travel: TravelPackage = await getTravelPackageById(sourceId); return { name: travel.name, startDate: travel.departureDate, endDate: travel.returnDate, sourceLabel: "Paquete de viaje" }; } const trip: InternalTripDetail = await getInternalTripById(sourceId); return { name: trip.name, startDate: trip.departureDate, endDate: trip.returnDate, sourceLabel: "Viaje interno" }; }
function message(error: unknown, fallback: string) { const value = String((error as { message?: unknown })?.message ?? "").trim(); return value || fallback; }

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getHomeRouteForRole, getStoredSession } from "@/lib/auth-api";
import { getCostComposition, resolveInternalTripCostingProject, resolveTravelPackageCostingProject, type CostComposition, type CostingProject } from "@/lib/cost-engine-api";
import { getInternalTripById, type InternalTripDetail } from "@/lib/internal-trips-api";
import { getTravelPackageById, type TravelPackage } from "@/lib/travel-packages-api";
import { formatBusinessDate } from "@/shared/regional";
import { PricingWorkspace } from "@/features/pricing/pricing-workspace";
import { AirfareEvolutionDialog } from "./airfare-evolution-dialog";
import { GenericCostComposition } from "./generic-cost-composition";

type WorkspaceSourceType = "travel-package" | "internal-trip";
type TravelMeta = { name: string; startDate: string; endDate: string; sourceLabel: string };

export function CostWorkspace({ sourceType, sourceId }: { sourceType: string; sourceId: string }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<CostingProject | null>(null); const [travel, setTravel] = useState<TravelMeta | null>(null); const [composition, setComposition] = useState<CostComposition | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<"COSTS" | "PRICING">("COSTS"); const [showEvolution, setShowEvolution] = useState(false); const [refreshToken, setRefreshToken] = useState(0);
  const validSourceType = sourceType === "travel-package" || sourceType === "internal-trip";

  useEffect(() => { const session = getStoredSession(); const role = String(session?.user?.role ?? "").toUpperCase(); if (!session?.user?.id) { router.replace("/"); return; } if (role !== "ADMIN") { router.replace(getHomeRouteForRole(role)); return; } setAuthorized(true); }, [router]);
  useEffect(() => { if (!authorized || !validSourceType || !sourceId.trim()) { if (authorized) { setError("El origen de costos solicitado no es válido."); setLoading(false); } return; } let cancelled = false; void Promise.all([sourceType === "travel-package" ? resolveTravelPackageCostingProject(sourceId) : resolveInternalTripCostingProject(sourceId), loadTravelMeta(sourceType as WorkspaceSourceType, sourceId)]).then(([resolution, source]) => { if (!cancelled) { setProject(resolution.costingProject); setTravel(source); setError(null); } }).catch((caught) => { if (!cancelled) setError(message(caught, "No se pudo abrir el espacio de costos.")); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [authorized, sourceId, sourceType, validSourceType]);
  const refreshComposition = useCallback(async () => { if (!project) return; setComposition(await getCostComposition(project.id)); setRefreshToken((value) => value + 1); }, [project]);
  const handleCompositionChanged = useCallback((next: CostComposition) => setComposition(next), []);

  if (!authorized || loading) return <main className="app-shell grid min-h-[360px] place-items-center text-sm text-muted-foreground">Cargando espacio de costos…</main>;
  if (error && (!project || !travel)) return <main className="app-shell"><div className="mx-auto w-full max-w-3xl"><Alert variant="destructive"><AlertTitle>No se pudo abrir el espacio de costos</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></div></main>;
  if (!project || !travel) return null;
  return <main className="app-shell"><div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6"><header className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-ui-xs lg:flex-row lg:items-start lg:justify-between"><div><Link className="text-sm font-medium text-primary hover:underline" href={sourceType === "travel-package" ? "/admin/travel-packages" : "/admin/internal-trips"}>← Volver a viajes</Link><h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Componer costos · {travel.name}</h1><p className="mt-2 text-sm text-muted-foreground">{formatBusinessDate(travel.startDate)} — {formatBusinessDate(travel.endDate)}</p><div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">{travel.sourceLabel}</Badge><Badge variant="info">{project.baseCurrency}</Badge><Badge variant="secondary">{projectStatusLabel(project.status)}</Badge></div></div><nav className="flex flex-wrap gap-2" aria-label="Navegación del espacio de costos"><Button type="button" size="sm" variant={activeWorkspace === "COSTS" ? "default" : "outline"} aria-current={activeWorkspace === "COSTS" ? "page" : undefined} onClick={() => setActiveWorkspace("COSTS")}>Costos</Button><Button type="button" size="sm" variant={activeWorkspace === "PRICING" ? "default" : "outline"} aria-current={activeWorkspace === "PRICING" ? "page" : undefined} onClick={() => setActiveWorkspace("PRICING")}>Pricing</Button><Button type="button" size="sm" variant="outline" onClick={() => setShowEvolution(true)}>Historial de costos</Button></nav></header>{error ? <Alert variant="destructive"><AlertTitle>Acción no completada</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}<div hidden={activeWorkspace === "PRICING"}><GenericCostComposition costingProjectId={project.id} baseCurrency={project.baseCurrency} canEdit={true} refreshToken={refreshToken} onCompositionChanged={handleCompositionChanged} /></div>{activeWorkspace === "PRICING" ? <PricingWorkspace costingProjectId={project.id} projectName={travel.name} baseCurrency={project.baseCurrency} /> : null}</div><AirfareEvolutionDialog isOpen={showEvolution} project={project} composition={composition} travel={travel} onClose={() => setShowEvolution(false)} onCompositionChanged={refreshComposition} /></main>;
}

async function loadTravelMeta(sourceType: WorkspaceSourceType, sourceId: string): Promise<TravelMeta> { if (sourceType === "travel-package") { const travel: TravelPackage = await getTravelPackageById(sourceId); return { name: travel.name, startDate: travel.departureDate, endDate: travel.returnDate, sourceLabel: "Paquete de viaje" }; } const trip: InternalTripDetail = await getInternalTripById(sourceId); return { name: trip.name, startDate: trip.departureDate, endDate: trip.returnDate, sourceLabel: "Viaje interno" }; }
function projectStatusLabel(status: string) { return ({ DRAFT: "Borrador", ACTIVE: "Activo", ARCHIVED: "Archivado" } as Record<string, string>)[status] ?? status; }
function message(error: unknown, fallback: string) { const value = String((error as { message?: unknown })?.message ?? "").trim(); return value || fallback; }
